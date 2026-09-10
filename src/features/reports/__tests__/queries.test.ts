import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSubmittedReportsHistory } from "../queries";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn(),
}));

describe("getSubmittedReportsHistory query", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getUserId).mockResolvedValue("user-1");
    await db.investmentAccountSnapshot.deleteMany();
    await db.investmentEvent.deleteMany();
    await db.investment.deleteMany();
    await db.account.deleteMany();
  });

  it("returns only authenticated user's snapshots ordered by importedAt desc and deterministic id", async () => {
    await db.user.upsert({
      where: { id: "user-1" },
      update: {},
      create: { id: "user-1", email: "1@example.com", passwordHash: "x" },
    });
    await db.user.upsert({
      where: { id: "user-2" },
      update: {},
      create: { id: "user-2", email: "2@example.com", passwordHash: "x" },
    });

    const acc1 = await db.account.create({
      data: {
        id: "acc-1",
        userId: "user-1",
        name: "Acc 1",
        type: "Broker",
        currency: "EUR",
        balance: 0,
      },
    });
    const acc2 = await db.account.create({
      data: {
        id: "acc-2",
        userId: "user-1",
        name: "Acc 2",
        type: "Broker",
        currency: "USD",
        balance: 0,
      },
    });
    const accOther = await db.account.create({
      data: {
        id: "acc-other",
        userId: "user-2",
        name: "Acc Other",
        type: "Broker",
        currency: "EUR",
        balance: 0,
      },
    });

    const d1 = new Date("2026-05-01T10:00:00Z");
    const d2 = new Date("2026-05-01T12:00:00Z");

    await db.investmentAccountSnapshot.create({
      data: {
        id: "snap-a",
        userId: "user-1",
        accountId: acc1.id,
        statementDate: new Date("2026-05-01T00:00:00Z"),
        importedAt: d1,
        completeness: "COMPLETE",
        statementDateSource: "header",
        documentFingerprint: "hash1",
      },
    });

    await db.investmentAccountSnapshot.create({
      data: {
        id: "snap-b",
        userId: "user-1",
        accountId: acc2.id,
        statementDate: new Date("2026-05-02T00:00:00Z"),
        importedAt: d2, // later than d1
        completeness: "COMPLETE",
        statementDateSource: "header",
        documentFingerprint: "hash2",
      },
    });

    await db.investmentAccountSnapshot.create({
      data: {
        id: "snap-c",
        userId: "user-1",
        accountId: acc2.id,
        statementDate: new Date("2026-05-03T00:00:00Z"),
        importedAt: d2, // same as snap-b
        completeness: "COMPLETE",
        statementDateSource: "header",
        documentFingerprint: "hash3",
      },
    });

    await db.investmentAccountSnapshot.create({
      data: {
        id: "snap-other",
        userId: "user-2",
        accountId: accOther.id,
        statementDate: new Date("2026-05-04T00:00:00Z"),
        importedAt: d2,
        completeness: "COMPLETE",
        statementDateSource: "header",
        documentFingerprint: "hash4",
      },
    });

    const results = await getSubmittedReportsHistory();

    // 3 snapshots for user-1
    expect(results).toHaveLength(3);

    // Order: importedAt DESC, then id DESC
    // importedAt desc => d2, then d1
    // for d2, ids are "snap-b" and "snap-c". "snap-c" > "snap-b", so "snap-c" first.
    expect(results[0].id).toBe("snap-c");
    expect(results[1].id).toBe("snap-b");
    expect(results[2].id).toBe("snap-a");

    // Exact statement date preserved (YYYY-MM-DD)
    expect(results[0].statementDate).toBe("2026-05-03");

    // Accounts returned independently
    expect(results[0].account.id).toBe(acc2.id);
    expect(results[2].account.id).toBe(acc1.id);

    // documentFingerprint NOT exposed
    expect("documentFingerprint" in results[0]).toBe(false);
  });

  it("returns persisted ISIN correctly", async () => {
    await db.user.upsert({
      where: { id: "user-1" },
      update: {},
      create: { id: "user-1", email: "1@example.com", passwordHash: "x" },
    });
    await db.user.upsert({
      where: { id: "user-2" },
      update: {},
      create: { id: "user-2", email: "2@example.com", passwordHash: "x" },
    });

    const acc1 = await db.account.create({
      data: {
        id: "acc-1",
        userId: "user-1",
        name: "Acc 1",
        type: "Broker",
        currency: "EUR",
        balance: 0,
      },
    });

    const snap = await db.investmentAccountSnapshot.create({
      data: {
        id: "snap-isin",
        userId: "user-1",
        accountId: acc1.id,
        statementDate: new Date("2026-05-01T00:00:00Z"),
        importedAt: new Date("2026-05-02T10:00:00Z"),
        completeness: "COMPLETE",
        statementDateSource: "header",
        documentFingerprint: "hash1",
      },
    });

    await db.investmentPositionSnapshot.create({
      data: {
        id: "pos-1",
        snapshotId: snap.id,
        name: "Apple",
        isin: "US0378331005",
        quantity: 10,
        unitPrice: 150,
        marketValue: 1500,
        currency: "USD",
      },
    });

    const results = await getSubmittedReportsHistory();
    expect(results[0].positions[0].isin).toBe("US0378331005");
  });
});
