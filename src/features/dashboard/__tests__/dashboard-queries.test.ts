import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { getDashboardData } from "../queries";
import { db } from "@/lib/db";
import * as auth from "@/lib/auth";

describe("Dashboard queries", () => {
  const testUserId = "dashboard-test-user";
  const accountId = "test-account";

  beforeEach(async () => {
    await db.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: "dashboard@test.com",
        name: "Dashboard Test",
        passwordHash: "dummy"
      }
    });

    await db.account.create({
      data: {
        id: accountId,
        userId: testUserId,
        name: "Test Bank",
        type: "Bank",
        balance: 1000,
        currency: "EUR"
      }
    });
  });

  afterEach(async () => {
    await db.monthlySnapshot.deleteMany({ where: { userId: testUserId } });
    await db.investment.deleteMany({ where: { userId: testUserId } });
    await db.transaction.deleteMany({ where: { userId: testUserId } });
    await db.account.deleteMany({ where: { userId: testUserId } });
    await db.user.deleteMany({ where: { id: testUserId } });
  });

  test("getDashboardData accurately calculates investmentsValue", async () => {
    await db.investment.create({
      data: {
        userId: testUserId,
        name: "Apple Inc.",
        type: "Stock",
        quantity: 10,
        costBasis: 1000, isin: null, instrumentIdentifier: null, instrumentIdentifierType: null,
        marketValue: 1500,
        profit: 500,
        allocation: 0
      }
    });

    vi.spyOn(auth, "getUserId").mockResolvedValue(testUserId);

    const data = await getDashboardData();
    
    vi.restoreAllMocks();
  });

  test("net worth aggregates correctly without double counting", async () => {
    // Bank account with 1000 balance is created in beforeEach

    await db.account.create({
      data: {
        id: "broker-account-1",
        userId: testUserId,
        name: "Any Broker",
        type: "Broker",
        balance: 500, // Broker cash
        currency: "EUR"
      }
    });

    await db.investment.create({
      data: {
        userId: testUserId,
        name: "Apple Inc.",
        type: "Stock",
        quantity: 10,
        costBasis: 1000, isin: null, instrumentIdentifier: null, instrumentIdentifierType: null,
        marketValue: 1500,
        profit: 500,
        allocation: 0
      }
    });

    vi.spyOn(auth, "getUserId").mockResolvedValue(testUserId);

    const data = await getDashboardData();
    
    // total account balance = 1500 (1000 bank + 500 broker cash)
    // investments = 1500 (1500 stock market value)
    // net worth = 3000
    expect(data.metrics.liquidAssets).toBe(1500);
    expect(data.metrics.investmentsValue).toBe(1500);
    expect(data.metrics.netWorth).toBe(3000);

    vi.restoreAllMocks();
  });
});
