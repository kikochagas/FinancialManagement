import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SubmittedReportsHistory } from "../components/SubmittedReportsHistory";
import { SubmittedReportHistoryItem } from "../types";
import { formatCurrency } from "../../../lib/utils";

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("SubmittedReportsHistory UI", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.Element.prototype.hasPointerCapture = vi.fn();
    window.Element.prototype.releasePointerCapture = vi.fn();
    window.Element.prototype.setPointerCapture = vi.fn();
    window.Element.prototype.scrollIntoView = vi.fn();
  });

  const mockSnapshotHistory: SubmittedReportHistoryItem[] = [
    {
      id: "snap-1",
      reportType: "Portfolio Snapshot",
      account: { id: "acc-1", name: "Trade Republic", type: "Broker" },
      statementDate: "2026-08-30",
      importedAt: "2026-09-06T00:00:00.000Z",
      completeness: "COMPLETE",
      positionsCount: 5,
      investedValue: 4000,
      investedCurrency: "USD",
      cashValue: 1000,
      cashCurrency: "EUR",
      totalValue: null,
      totalCurrency: null,
      positions: [
        {
          id: "pos-1",
          name: "Apple",
          sourceSection: "Equities",
          assetClass: "Stock",
          isin: "US0378331005",
          ticker: "AAPL",
          instrumentIdentifier: "AAPL",
          instrumentIdentifierType: "TICKER",
          quantity: 10,
          unitPrice: 150,
          marketValue: 1500,
          currency: "USD",
          valuationDate: "2026-08-30",
        },
      ],
      cashBalances: [
        {
          id: "cash-1",
          type: "SETTLED",
          label: "Cash",
          amount: 1000,
          currency: "EUR",
        },
      ],
      totals: [
        {
          id: "tot-1",
          type: "OVERALL",
          label: "Total",
          amount: 5000,
          currency: "EUR",
        },
      ],
      statementDateSource: "header",
    },
    {
      id: "snap-2",
      reportType: "Portfolio Snapshot",
      account: { id: "acc-2", name: "Coinbase", type: "Broker" },
      statementDate: "2025-10-15",
      importedAt: "2025-10-20T00:00:00.000Z",
      completeness: "PARTIAL",
      positionsCount: 3,
      investedValue: 2000,
      investedCurrency: "EUR",
      cashValue: null,
      cashCurrency: null,
      totalValue: 2000,
      totalCurrency: "EUR",
      positions: [],
      cashBalances: [],
      totals: [],
      statementDateSource: "header",
    },
    {
      id: "snap-3",
      reportType: "Portfolio Snapshot",
      account: { id: "acc-1", name: "Trade Republic", type: "Broker" },
      statementDate: "2025-10-01",
      importedAt: "2025-10-05T00:00:00.000Z",
      completeness: "COMPLETE",
      positionsCount: 0,
      investedValue: 0,
      investedCurrency: "EUR",
      cashValue: 0,
      cashCurrency: "EUR",
      totalValue: 0,
      totalCurrency: "EUR",
      positions: [],
      cashBalances: [],
      totals: [],
      statementDateSource: "header",
    },
    {
      id: "snap-4",
      reportType: "Portfolio Snapshot",
      account: { id: "acc-1", name: "Trade Republic", type: "Broker" },
      statementDate: "2025-10-10",
      importedAt: "2025-10-12T00:00:00.000Z",
      completeness: "COMPLETE",
      positionsCount: 1,
      investedValue: 100,
      investedCurrency: "EUR",
      cashValue: 0,
      cashCurrency: "EUR",
      totalValue: 100,
      totalCurrency: "EUR",
      positions: [
        {
          id: "pos-4",
          name: "Bad Currency Asset",
          sourceSection: "Equities",
          assetClass: "Stock",
          isin: "US0378331006",
          ticker: "BAD",
          instrumentIdentifier: "BAD",
          instrumentIdentifierType: "TICKER",
          quantity: 1,
          unitPrice: 100,
          marketValue: 100,
          currency: "   ",
          valuationDate: "2025-10-10",
        },
      ],
      cashBalances: [],
      totals: [],
      statementDateSource: "header",
    },
  ];

  it("renders empty state", () => {
    render(<SubmittedReportsHistory snapshotHistory={[]} />);
    expect(
      screen.getByText("No broker reports have been submitted yet."),
    ).toBeInTheDocument();
  });

  it("table displays correct per-value currencies", () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);

    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);

    const formattedInvested = formatCurrency(4000, "USD").replace(/\s/g, "");
    const formattedCash = formatCurrency(1000, "EUR").replace(/\s/g, "");
    const formattedTotal2 = formatCurrency(2000, "EUR").replace(/\s/g, "");

    expect(
      screen.getAllByText(
        (content) => content.replace(/\s/g, "") === formattedInvested,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        (content) => content.replace(/\s/g, "") === formattedCash,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        (content) => content.replace(/\s/g, "") === formattedTotal2,
      ).length,
    ).toBeGreaterThan(0);

    const wrongEUR = formatCurrency(4000, "EUR").replace(/\s/g, "");
    const wrongUSD = formatCurrency(1000, "USD").replace(/\s/g, "");
    expect(
      screen.queryByText((content) => content.replace(/\s/g, "") === wrongEUR),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText((content) => content.replace(/\s/g, "") === wrongUSD),
    ).not.toBeInTheDocument();
  });

  it("Snapshot Detail renders explicitly required fields and no mutation controls", async () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);

    const viewButtons = screen.getAllByRole("button", {
      name: "View Snapshot",
    });
    fireEvent.click(viewButtons[0]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Equities")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();

    expect(screen.getByText("US0378331005")).toBeInTheDocument();
    expect(screen.getByText("AAPL (TICKER)")).toBeInTheDocument();

    const f1500 = formatCurrency(1500, "USD").replace(/\s/g, "");
    expect(
      screen.getAllByText((content) => content.replace(/\s/g, "") === f1500)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-08-30").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
    expect(screen.getAllByText("OVERALL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("COMPLETE").length).toBeGreaterThan(0);

    expect(
      screen.queryByRole("button", { name: /Edit/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Delete/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Apply/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reapply/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Change Account/i }),
    ).not.toBeInTheDocument();
  });

  it("filters by Account", async () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);
    const accountSelect = screen.getByRole("combobox", { name: /Account/i });
    fireEvent.click(accountSelect);
    const option = await screen.findByRole("option", {
      name: "Trade Republic",
    });
    fireEvent.click(option);

    expect(screen.getAllByRole("row").length).toBe(4);
  });

  it("filters by Year", async () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);
    const yearSelect = screen.getByRole("combobox", { name: /Year/i });
    fireEvent.click(yearSelect);
    const option = await screen.findByRole("option", { name: "2025" });
    fireEvent.click(option);

    expect(screen.getAllByRole("row").length).toBe(4);
  });

  it("filters by Month", async () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);
    const monthSelect = screen.getByRole("combobox", { name: /Month/i });
    fireEvent.click(monthSelect);
    const option = await screen.findByRole("option", { name: "August" });
    fireEvent.click(option);

    expect(screen.getAllByRole("row").length).toBe(2);
  });

  it("renders empty state when filtered-empty", async () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);
    const monthSelect = screen.getByRole("combobox", { name: /Month/i });
    fireEvent.click(monthSelect);
    const option = await screen.findByRole("option", { name: "January" });
    fireEvent.click(option);

    expect(
      screen.getByText("No reports match the selected filters."),
    ).toBeInTheDocument();
  });

  it("filters by Report Type", async () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);
    const typeSelect = screen.getByRole("combobox", { name: /Report Type/i });
    fireEvent.click(typeSelect);
    const option = await screen.findByRole("option", {
      name: "Portfolio Snapshot",
    });
    fireEvent.click(option);

    expect(screen.getAllByRole("row").length).toBe(5);
  });

  it("filters combine Account, Year, and Month and preserve multiple snapshots in the same month", async () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);

    const accountSelect = screen.getByRole("combobox", { name: /Account/i });
    fireEvent.click(accountSelect);
    const accountOption = await screen.findByRole("option", {
      name: "Trade Republic",
    });
    fireEvent.click(accountOption);

    const yearSelect = screen.getByRole("combobox", { name: /Year/i });
    fireEvent.click(yearSelect);
    const yearOption = await screen.findByRole("option", { name: "2025" });
    fireEvent.click(yearOption);

    const monthSelect = screen.getByRole("combobox", { name: /Month/i });
    fireEvent.click(monthSelect);
    const monthOption = await screen.findByRole("option", { name: "October" });
    fireEvent.click(monthOption);

    expect(screen.getAllByRole("row").length).toBe(3);
  });

  it("does not crash when a persisted currency is whitespace/invalid in detail dialog", async () => {
    render(<SubmittedReportsHistory snapshotHistory={mockSnapshotHistory} />);
    const viewButtons = screen.getAllByRole("button", {
      name: "View Snapshot",
    });

    fireEvent.click(viewButtons[3]);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getAllByText("100 (currency unknown)").length,
    ).toBeGreaterThan(0);
  });
});
