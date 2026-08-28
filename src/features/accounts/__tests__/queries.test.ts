import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { getAccountsData } from "../queries";

// Mock the auth
vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn().mockResolvedValue("test-user-id"),
}));

describe("Accounts Queries - getAccountsData", () => {
  beforeEach(async () => {
    await db.transaction.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();

    await db.user.create({
      data: {
        id: "test-user-id",
        email: "test@example.com",
        passwordHash: "hash",
      },
    });
  });

  it("should merge InternalTransfer correctly for both source and destination accounts", async () => {
    const accA = await db.account.create({
      data: { userId: "test-user-id", name: "Account A", type: "Bank", balance: 1000 },
    });
    const accB = await db.account.create({
      data: { userId: "test-user-id", name: "Account B", type: "Bank", balance: 1000 },
    });
    const accC = await db.account.create({
      data: { userId: "test-user-id", name: "Account C", type: "Bank", balance: 1000 },
    });

    const tx = await db.transaction.create({
      data: {
        userId: "test-user-id",
        accountId: accA.id,
        destinationAccountId: accB.id,
        direction: "InternalTransfer",
        amount: 200,
        description: "Test Transfer",
        date: new Date("2026-08-01"),
        tags: "",
      },
    });

    const data = await getAccountsData();
    const fetchedA = data.accounts.find(a => a.id === accA.id)!;
    const fetchedB = data.accounts.find(a => a.id === accB.id)!;
    const fetchedC = data.accounts.find(a => a.id === accC.id)!;

    // Account A history
    expect(fetchedA.recentTransactions).toHaveLength(1);
    expect(fetchedA.recentTransactions[0].id).toBe(tx.id);
    expect(fetchedA.recentTransactions[0].description).toBe("Transfer to Account B");
    
    // Account B history
    expect(fetchedB.recentTransactions).toHaveLength(1);
    expect(fetchedB.recentTransactions[0].id).toBe(tx.id);
    expect(fetchedB.recentTransactions[0].description).toBe("Transfer from Account A");

    // Account C history
    expect(fetchedC.recentTransactions).toHaveLength(0);
  });

  it("should merge normal transactions and transfers up to the limit of 5", async () => {
    const accA = await db.account.create({
      data: { userId: "test-user-id", name: "Account A", type: "Bank", balance: 1000 },
    });
    const accB = await db.account.create({
      data: { userId: "test-user-id", name: "Account B", type: "Bank", balance: 1000 },
    });

    // Create 3 Debits for Account A
    for (let i = 1; i <= 3; i++) {
      await db.transaction.create({
        data: {
          userId: "test-user-id",
          accountId: accA.id,
          direction: "Debit",
          amount: 50,
          description: `Debit ${i}`,
          date: new Date(`2026-08-0${i}`),
          tags: "",
        },
      });
    }

    // Create 3 Incoming Transfers from B to A
    for (let i = 4; i <= 6; i++) {
      await db.transaction.create({
        data: {
          userId: "test-user-id",
          accountId: accB.id,
          destinationAccountId: accA.id,
          direction: "InternalTransfer",
          amount: 100,
          description: `Transfer ${i}`,
          date: new Date(`2026-08-0${i}`),
          tags: "",
        },
      });
    }

    const data = await getAccountsData();
    const fetchedA = data.accounts.find(a => a.id === accA.id)!;
    
    // Total transactions involving A is 6, limit is 5. 
    // Should contain the 5 most recent (dates 2 to 6).
    expect(fetchedA.recentTransactions).toHaveLength(5);
    
    // Verify it's sorted by date desc
    const dates = fetchedA.recentTransactions.map(t => t.date);
    expect(dates).toEqual(["2026-08-06", "2026-08-05", "2026-08-04", "2026-08-03", "2026-08-02"]);
  });
});
