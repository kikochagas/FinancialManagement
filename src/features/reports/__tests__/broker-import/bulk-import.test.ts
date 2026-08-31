import { expect, test, describe, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { importBrokerTransactionsForUser } from "../../broker-import/actions";

describe("broker-import bulk deduplication and insertion", () => {
  let user: any;
  let account: any;

  beforeAll(async () => {
    user = await db.user.create({ data: { email: "test-bulk-dedup@example.com", name: "Test Bulk Dedup", passwordHash: "dummy" } });
  });

  afterAll(async () => {
    if (user) await db.user.delete({ where: { id: user.id } });
  });

  beforeEach(async () => {
    if (account) await db.account.delete({ where: { id: account.id } });
    account = await db.account.create({
      data: {
        userId: user.id,
        name: "Bulk Broker Account",
        type: "BROKER",
        balance: 0,
        currency: "EUR"
      }
    });
  });

  function generateMockEvent(row: number) {
    return {
      sourceRow: row,
      occurredAt: "2024-01-01T10:00:00.000Z",
      eventType: "BUY",
      rawEventType: "BUY",
      assetClass: "EQUITY",
      instrumentName: "Mock Stock " + row,
      quantity: 1,
      amount: -100,
      currency: "EUR"
    };
  }

  test("73-event style batch import succeeds", async () => {
    const candidates = Array.from({ length: 73 }).map((_, i) => generateMockEvent(i + 1));
    const result = await importBrokerTransactionsForUser(user.id, account.id, candidates, false);
    expect(result.insertedCount).toBe(73);
    expect(result.skippedCount).toBe(0);
    
    const dbCount = await db.investmentEvent.count({ where: { accountId: account.id } });
    expect(dbCount).toBe(73);
  });

  test("Existing duplicates are excluded in bulk", async () => {
    // insert 70 first
    const first70 = Array.from({ length: 70 }).map((_, i) => generateMockEvent(i + 1));
    await importBrokerTransactionsForUser(user.id, account.id, first70, false);

    // try to insert 73
    const all73 = Array.from({ length: 73 }).map((_, i) => generateMockEvent(i + 1));
    const result = await importBrokerTransactionsForUser(user.id, account.id, all73, false);
    
    expect(result.insertedCount).toBe(3);
    expect(result.skippedCount).toBe(70);

    const dbCount = await db.investmentEvent.count({ where: { accountId: account.id } });
    expect(dbCount).toBe(73);
  });

  test("Intra-batch deduplication works", async () => {
    const dupes = [generateMockEvent(1), generateMockEvent(1)];
    const result = await importBrokerTransactionsForUser(user.id, account.id, dupes, false);
    expect(result.insertedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  test("Exact re-import", async () => {
    const all73 = Array.from({ length: 73 }).map((_, i) => generateMockEvent(i + 1));
    await importBrokerTransactionsForUser(user.id, account.id, all73, false);

    const result = await importBrokerTransactionsForUser(user.id, account.id, all73, false);
    
    expect(result.insertedCount).toBe(0);
    expect(result.skippedCount).toBe(73);
  });

  test("Balance-only operation", async () => {
    // Insert 10 events
    const events = Array.from({ length: 10 }).map((_, i) => generateMockEvent(i + 1));
    await importBrokerTransactionsForUser(user.id, account.id, events, false);

    // Empty transactions but updateCashBalance = true
    const result = await importBrokerTransactionsForUser(user.id, account.id, [], true);
    expect(result.insertedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.balanceUpdated).toBe(true);
    expect(result.resultingBalance).toBe(-1000);
  });

  test("transaction failure still rolls back all writes", async () => {
    const events = Array.from({ length: 10 }).map((_, i) => generateMockEvent(i + 1));
    // Add an invalid event at the end that passes the pre-validation but fails in DB or balance phase
    // Let's force a balance calculation error instead
    events.push({
      ...generateMockEvent(11),
      currency: "USD" // multi-currency should fail the balance check
    });

    await expect(importBrokerTransactionsForUser(user.id, account.id, events, true)).rejects.toThrow(/Cash balance calculation was unsafe/);
    
    const dbCount = await db.investmentEvent.count({ where: { accountId: account.id } });
    expect(dbCount).toBe(0);
  });
});
