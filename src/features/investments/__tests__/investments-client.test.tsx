import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { InvestmentsClient } from "../investments-client";

// Mock the child components to simplify testing
vi.mock("../activity-tab", () => ({
  InvestmentActivityTab: () => <div data-testid="investment-activity-tab" />
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: () => <div />,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  PieChart: () => <div />,
  Pie: () => <div />,
  Cell: () => <div />,
}));

// Mock next/navigation
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/investments",
}));

const mockData = {
  investments: [],
  accounts: [],
  investmentAccounts: [],
  events: [],
};

describe("InvestmentsClient UX/Routing", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  test("renders only Portfolio and Activity tabs", () => {
    render(<InvestmentsClient data={mockData} />);
    
    // Verify tabs
    expect(screen.getByText("Portfolio")).toBeInTheDocument();
    expect(screen.getByText("Activity")).toBeInTheDocument();
    
    // Verify removed tab
    expect(screen.queryByText("Import PDF")).not.toBeInTheDocument();
  });

  test("renders \"Import broker report\" shortcut pointing to reports", () => {
    render(<InvestmentsClient data={mockData} />);
    
    const shortcut = screen.getByRole("link", { name: /import broker report/i });
    expect(shortcut).toBeInTheDocument();
    expect(shortcut).toHaveAttribute("href", "/reports?tab=broker");
  });

  test("renders Portfolio tab by default", () => {
    render(<InvestmentsClient data={mockData} />);
    // In Portfolio tab, we should see the Total Portfolio Value card
    expect(screen.getByText("Total Portfolio Value")).toBeInTheDocument();
  });

  test("renders Activity tab when query param is set", () => {
    mockSearchParams = new URLSearchParams("tab=activity");
    render(<InvestmentsClient data={mockData} />);
    expect(screen.getByTestId("investment-activity-tab")).toBeInTheDocument();
  });
});
