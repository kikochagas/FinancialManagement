import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { ReportsClient } from "../reports-client";

// Mock child components
vi.mock("../bank-import/components/BankImportWizard", () => ({
  BankImportWizard: () => <div data-testid="bank-import-wizard" />
}));

vi.mock("../broker-import/components/BrokerTransactionImportWizard", () => ({
  BrokerTransactionImportWizard: () => <div data-testid="broker-transaction-wizard" />
}));

vi.mock("../../investments/components/BrokerSnapshotWizard", () => ({
  BrokerSnapshotWizard: () => <div data-testid="broker-snapshot-wizard" />
}));

// Mock next/navigation
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/reports",
}));

const mockData = {
  transactions: [],
  accounts: [
    { id: "1", name: "Bank", type: "Bank", balance: 0, currency: "EUR", isBankConnected: false },
    { id: "2", name: "Broker", type: "Broker", balance: 0, currency: "EUR", isBankConnected: false }
  ],
  categories: [],
  investments: [],
  goals: [],
  taxReservation: { year: 2026, estimatedTaxLiability: 0, taxWithheld: 0, notes: "" }
};

describe("ReportsClient UX/Routing", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });

  test("Default state opens the Overview & Export tab", () => {
    render(<ReportsClient data={mockData} />);
    
    // Check tabs
    expect(screen.getByText("Overview & Export")).toBeInTheDocument();
    expect(screen.getByText("Bank Statements")).toBeInTheDocument();
    expect(screen.getByText("Broker Reports")).toBeInTheDocument();

    // Check content
    expect(screen.getByText("Portuguese IRS Simulation")).toBeInTheDocument();
    expect(screen.getByText("Excel / CSV Data Operations")).toBeInTheDocument();
    
    // Ensure wizards are NOT mounted
    expect(screen.queryByTestId("bank-import-wizard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("broker-snapshot-wizard")).not.toBeInTheDocument();
  });

  test("/reports?tab=bank opens Bank Statements and isolates its wizard", () => {
    mockSearchParams = new URLSearchParams("tab=bank");
    render(<ReportsClient data={mockData} />);
    
    expect(screen.getByTestId("bank-import-wizard")).toBeInTheDocument();
    expect(screen.getByText("Bank Statement Import")).toBeInTheDocument();
    
    // Ensure others are NOT mounted
    expect(screen.queryByTestId("broker-snapshot-wizard")).not.toBeInTheDocument();
    expect(screen.queryByText("Portuguese IRS Simulation")).not.toBeInTheDocument();
  });

  test("/reports?tab=broker opens Broker Reports and mounts both wizards", () => {
    mockSearchParams = new URLSearchParams("tab=broker");
    render(<ReportsClient data={mockData} />);
    
    // Check headings
    expect(screen.getByText("Portfolio Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Broker Activity")).toBeInTheDocument();

    // Check wizards mount
    expect(screen.getByTestId("broker-snapshot-wizard")).toBeInTheDocument();
    expect(screen.getByTestId("broker-transaction-wizard")).toBeInTheDocument();
    
    // Ensure others are NOT mounted
    expect(screen.queryByTestId("bank-import-wizard")).not.toBeInTheDocument();
    expect(screen.queryByText("Portuguese IRS Simulation")).not.toBeInTheDocument();
  });
});
