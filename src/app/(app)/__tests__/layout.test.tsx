import { expect, test, describe, beforeAll, afterAll, vi } from "vitest";
import AppLayout from "../layout";
import { db } from "@/lib/db";
import * as auth from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  getUserId: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => "/"
}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => null })
}));

describe("AppLayout Global Net Worth", () => {
  let user: any;
  beforeAll(async () => {
    user = await db.user.create({ data: { email: "layout@example.com", name: "Layout Test", passwordHash: "dummy" } });
    vi.mocked(auth.getUserId).mockResolvedValue(user.id);
  });
  
  afterAll(async () => {
    await db.account.deleteMany({ where: { userId: user.id } });
    await db.investment.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
    vi.restoreAllMocks();
  });

  test("accounts = 43,478.14, investments = 2,775.00, expected displayed net worth = 46,253.14", async () => {
    await db.account.create({ data: { userId: user.id, name: "Bank", type: "Bank", balance: 43478.14, currency: "EUR" } });
    await db.investment.create({ data: { userId: user.id, name: "Stocks", type: "EQUITY", quantity: 1, marketValue: 2775.00, costBasis: 2775.00, profit: 0, allocation: 0 } });

    const element = await AppLayout({ children: null });
    
    // The layout returns:
    // <QueryProvider>
    //   <Sidebar />
    //   <div ...>
    //     <Header netWorth={netWorth} />
    
    const div = element.props.children[1];
    const header = div.props.children[0];
    
    expect(header.props.netWorth).toBe(46253.14);
  });
});
