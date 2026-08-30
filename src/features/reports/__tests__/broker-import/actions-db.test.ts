import { expect, test, describe, vi, beforeAll, afterAll } from "vitest";
import { generateDedupKey } from "../../broker-import/dedup";
import { validateBrokerTransaction } from "../../broker-import/validation";
import { evaluateBrokerMappingConfidence } from "../../broker-import/confidence";
import { mapBrokerColumnsDeterministically } from "../../broker-import/column-mapping";
import { orchestrateBrokerColumnMapping } from "../../broker-import/orchestrator";
import { importBrokerTransactionsForUser } from "../../broker-import/actions";
import { parseBrokerDatetimeStrict } from "../../broker-import/date-parser";
import { db } from "@/lib/db";



describe("broker-import date-parser strictness", () => {
  test("rejects invalid February day", () => {
    expect(parseBrokerDatetimeStrict("2024-02-30T12:00:00Z").valid).toBe(false);
    expect(parseBrokerDatetimeStrict("2023-02-29T12:00:00Z").valid).toBe(false); // not leap year
  });
  test("rejects invalid month", () => {
    expect(parseBrokerDatetimeStrict("2024-13-01T12:00:00Z").valid).toBe(false);
  });
  test("rejects invalid hour", () => {
    expect(parseBrokerDatetimeStrict("2024-01-01T25:00:00Z").valid).toBe(false);
  });
  test("accepts valid Z datetime", () => {
    const res = parseBrokerDatetimeStrict("2024-01-01T12:00:00Z");
    expect(res.valid).toBe(true);
    expect(res.value).toBe("2024-01-01T12:00:00.000Z");
  });
  test("accepts valid offset datetime", () => {
    const res = parseBrokerDatetimeStrict("2024-01-01T12:00:00+02:00");
    expect(res.valid).toBe(true);
    expect(res.value).toBe("2024-01-01T10:00:00.000Z");
  });
  test("timezone-less datetime produces deterministic UTC", () => {
    const res = parseBrokerDatetimeStrict("2024-01-01T12:00:00");
    expect(res.valid).toBe(true);
    expect(res.value).toBe("2024-01-01T12:00:00.000Z");
  });
});

describe("broker-import database integration", () => {
  let user: any;
  let account: any;

  beforeAll(async () => {
    user = await db.user.create({
      data: { email: "test-broker-import@example.com", passwordHash: "x", name: "Test User" }
    });
    account = await db.account.create({
      data: { userId: user.id, name: "Broker Account", type: "Broker", balance: 0, currency: "EUR" }
    });
  });

  afterAll(async () => {
    await db.account.delete({ where: { id: account.id } });
    await db.user.delete({ where: { id: user.id } });
  });

  test("valid event persists securely", async () => {
    const tx = [{
      occurredAt: "2024-01-01T10:00:00Z",
      eventType: "CASH_DEPOSIT",
      quantity: null,
      amount: 100,
      currency: "EUR",
      sourceRow: 1,
    }];
    const res = await importBrokerTransactionsForUser(user.id, account.id, tx);
    expect(res.success).toBe(true);
    expect(res.insertedCount).toBe(1);

    const saved = await db.investmentEvent.findFirst({ where: { accountId: account.id } });
    expect(saved).not.toBeNull();
    expect(saved?.sourceRow).toBe(1);
    expect(saved?.amount).toBe(100);
  });

  test("repeated identical event is idempotent", async () => {
    const tx = [{
      occurredAt: "2024-01-02T10:00:00Z",
      eventType: "CASH_DEPOSIT",
      quantity: null,
      amount: 50,
      currency: "EUR",
      sourceRow: 2,
    }];
    
    // First import
    const res1 = await importBrokerTransactionsForUser(user.id, account.id, tx);
    expect(res1.insertedCount).toBe(1);
    
    // Second import
    const res2 = await importBrokerTransactionsForUser(user.id, account.id, tx);
    expect(res2.insertedCount).toBe(0);
    expect(res2.skippedCount).toBe(1);
  });

  test("invalid date is rejected server-side and rolls back", async () => {
    const tx = [{
      occurredAt: "2024-02-30T10:00:00Z",
      eventType: "CASH_DEPOSIT",
      amount: 50,
      currency: "EUR",
      sourceRow: 3,
    }];
    
    await expect(importBrokerTransactionsForUser(user.id, account.id, tx)).rejects.toThrow(/Strict server validation failed/);
  });

  test("account ownership is enforced", async () => {
    const otherUser = await db.user.create({
      data: { email: "other@example.com", passwordHash: "x" }
    });
    
    const tx = [{
      occurredAt: "2024-01-03T10:00:00Z",
      eventType: "CASH_DEPOSIT",
      amount: 50,
      currency: "EUR",
      sourceRow: 4,
    }];
    
    await expect(importBrokerTransactionsForUser(otherUser.id, account.id, tx)).rejects.toThrow(/Account not found or unauthorized/);
    await db.user.delete({ where: { id: otherUser.id } });
  });

  test("active open banking connection blocks import", async () => {
    const obAccount = await db.account.create({
      data: { userId: user.id, name: "OB Account", type: "Bank", balance: 0, currency: "EUR" }
    });
    const connection = await db.bankConnection.create({
      data: { userId: user.id, provider: "Test", institutionName: "Test", institutionCountry: "US", status: "CONNECTED" }
    });
    await db.externalAccountMapping.create({
      data: { accountId: obAccount.id, bankConnectionId: connection.id, providerAccountUid: "123", identificationHash: "123" }
    });

    const tx = [{
      occurredAt: "2024-01-03T10:00:00Z",
      eventType: "CASH_DEPOSIT",
      amount: 50,
      currency: "EUR",
      sourceRow: 5,
    }];

    await expect(importBrokerTransactionsForUser(user.id, obAccount.id, tx)).rejects.toThrow(/Cannot import broker transactions into an actively connected Open Banking account/);
    
    await db.account.delete({ where: { id: obAccount.id } });
    await db.bankConnection.delete({ where: { id: connection.id } });
  });

  test("balance-only operation", async () => {
    await db.investmentEvent.deleteMany({ where: { accountId: account.id } });
    await db.account.update({ where: { id: account.id }, data: { balance: 0 } });

    await db.investmentEvent.create({
      data: {
        userId: user.id,
        accountId: account.id,
        dedupKey: "seed-1",
        occurredAt: new Date("2024-01-01T10:00:00Z"),
        eventType: "CASH_DEPOSIT",
        amount: 100,
        currency: "EUR"
      }
    });

    const res = await importBrokerTransactionsForUser(user.id, account.id, [], true);
    expect(res.insertedCount).toBe(0);
    expect(res.balanceUpdated).toBe(true);
    expect(res.resultingBalance).toBe(100);

    const updatedAccount = await db.account.findUnique({ where: { id: account.id } });
    expect(updatedAccount?.balance).toBe(100);
  });

  test("idempotent reimport + balance", async () => {
    await db.investmentEvent.deleteMany({ where: { accountId: account.id } });
    await db.account.update({ where: { id: account.id }, data: { balance: 0 } });

    const tx = [{
      occurredAt: "2024-01-01T10:00:00Z",
      eventType: "CASH_DEPOSIT",
      amount: 100,
      currency: "EUR",
      sourceRow: 1,
    }];
    
    // First import
    const res1 = await importBrokerTransactionsForUser(user.id, account.id, tx, true);
    expect(res1.insertedCount).toBe(1);
    expect(res1.balanceUpdated).toBe(true);
    expect(res1.resultingBalance).toBe(100);

    // Second import exactly the same
    const res2 = await importBrokerTransactionsForUser(user.id, account.id, tx, true);
    expect(res2.insertedCount).toBe(0);
    expect(res2.skippedCount).toBe(1);
    expect(res2.balanceUpdated).toBe(true); // Technically updated to same balance
    expect(res2.resultingBalance).toBe(100);

    const updatedAccount = await db.account.findUnique({ where: { id: account.id } });
    expect(updatedAccount?.balance).toBe(100);
  });

  test("user declines balance update", async () => {
    await db.investmentEvent.deleteMany({ where: { accountId: account.id } });
    await db.account.update({ where: { id: account.id }, data: { balance: 500 } });

    const tx = [{
      occurredAt: "2024-01-02T10:00:00Z",
      eventType: "CASH_DEPOSIT",
      amount: 100,
      currency: "EUR",
      sourceRow: 1,
    }];
    
    const res = await importBrokerTransactionsForUser(user.id, account.id, tx, false);
    expect(res.insertedCount).toBe(1);
    expect(res.balanceUpdated).toBe(false);

    const updatedAccount = await db.account.findUnique({ where: { id: account.id } });
    expect(updatedAccount?.balance).toBe(500); // Should remain 500
  });

  test("unsafe balance is rejected", async () => {
    await db.investmentEvent.deleteMany({ where: { accountId: account.id } });
    await db.account.update({ where: { id: account.id }, data: { balance: 500 } });

    const tx = [{
      occurredAt: "2024-01-02T10:00:00Z",
      eventType: "CASH_DEPOSIT",
      amount: 100,
      currency: "USD", // Mismatch with account EUR
      sourceRow: 1,
    }];
    
    await expect(importBrokerTransactionsForUser(user.id, account.id, tx, true)).rejects.toThrow(/Cash balance calculation was unsafe/);

    const updatedAccount = await db.account.findUnique({ where: { id: account.id } });
    expect(updatedAccount?.balance).toBe(500); 
  });

});
