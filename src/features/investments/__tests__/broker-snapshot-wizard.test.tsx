import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrokerSnapshotWizard } from "../components/BrokerSnapshotWizard";
import * as actions from "../actions";

vi.mock("../actions", () => ({
  getSnapshotReconciliation: vi.fn(),
}));

describe("BrokerSnapshotWizard", () => {
  const accounts = [
    { id: "acc-1", name: "Trade Republic", type: "Broker" },
    { id: "acc-2", name: "Coinbase", type: "Crypto Wallet" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("requires account selection to enable processing", () => {
    render(<BrokerSnapshotWizard investmentAccounts={accounts} />);

    const processButton = screen.getByRole("button", { name: /Process PDF/i });
    const fileInput = processButton.parentElement?.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    // Initially disabled because no account and no file
    expect(processButton).toBeDisabled();

    // Select file but no account
    const file = new File(["dummy content"], "statement.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Still disabled because no account
    expect(processButton).toBeDisabled();
  });

  it("renders extracted snapshot and reconciliation statuses correctly", async () => {
    const mockSnapshot = {
      statementDate: "2026-08-30",
      completeness: "COMPLETE",
      positions: [],
      cashBalances: [{ type: "EUR", amount: 1500, currency: "EUR" }],
      totals: [],
      extractionWarnings: ["A minor warning about extraction"],
    };

    const mockReconciliation = {
      accountId: "acc-1",
      positions: [
        {
          importedPosition: {
            name: "Apple Inc.",
            quantity: 10,
            marketValue: 1500,
            currency: "USD",
          },
          status: "MATCHED",
          matchMethod: "ISIN",
          matchedInvestmentId: "inv-1",
          proposedChanges: { quantity: 10 },
          reason: null,
        },
        {
          importedPosition: {
            name: "Unknown Corp",
            quantity: 5,
            marketValue: 50,
            currency: "USD",
          },
          status: "NEW",
          matchMethod: "NONE",
          matchedInvestmentId: null,
          proposedChanges: null,
          reason: null,
        },
        {
          importedPosition: {
            name: "Ambiguous Corp",
            quantity: 100,
            marketValue: 500,
            currency: "EUR",
          },
          status: "AMBIGUOUS",
          matchMethod: "NAME",
          matchedInvestmentId: null,
          proposedChanges: null,
          reason: "Weak match by normalized name.",
        },
        {
          importedPosition: {
            name: "Conflict Corp",
            quantity: 100,
            marketValue: 500,
            currency: "EUR",
          },
          status: "CONFLICT",
          matchMethod: "TICKER",
          matchedInvestmentId: "inv-conf",
          proposedChanges: null,
          reason: "Identifiers conflict.",
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSnapshot,
    });

    vi.mocked(actions.getSnapshotReconciliation).mockResolvedValueOnce({
      data: mockReconciliation as any,
    } as any);

    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(<BrokerSnapshotWizard investmentAccounts={accounts} />);

    fireEvent.click(screen.getByRole("combobox"));
    const option = await screen.findByText("Trade Republic · Broker");
    fireEvent.click(option);

    const processButton = screen.getByRole("button", { name: /Process PDF/i });
    const fileInput = processButton.parentElement?.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(["dummy"], "test.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(processButton).not.toBeDisabled();
    fireEvent.click(processButton);

    expect(processButton).toHaveTextContent(/Processing/i);

    // Wait for the preview to render
    await waitFor(() => {
      expect(screen.getByText("Preview Mode Only")).toBeInTheDocument();
    });

    // Check overview
    expect(screen.getByText("2026-08-30")).toBeInTheDocument();
    expect(screen.getByText("COMPLETE")).toBeInTheDocument();
    expect(
      screen.getByText("A minor warning about extraction"),
    ).toBeInTheDocument();

    // Check cash balances
    expect(screen.getAllByText(/1.*500/)[0]).toBeInTheDocument();

    // Check positions and statuses
    expect(screen.getByText("Apple Inc.")).toBeInTheDocument();
    expect(screen.getByText("MATCHED")).toBeInTheDocument();

    expect(screen.getByText("Unknown Corp")).toBeInTheDocument();
    expect(screen.getByText("NEW")).toBeInTheDocument();

    expect(screen.getByText("Ambiguous Corp")).toBeInTheDocument();
    expect(screen.getByText("AMBIGUOUS")).toBeInTheDocument();
    expect(
      screen.getByText("Weak match by normalized name."),
    ).toBeInTheDocument();

    expect(screen.getByText("Conflict Corp")).toBeInTheDocument();
    expect(screen.getByText("CONFLICT")).toBeInTheDocument();
    expect(screen.getByText("Identifiers conflict.")).toBeInTheDocument();

    // Ensure there's NO apply/submit mutation button in the document
    expect(
      screen.queryByRole("button", { name: /Apply Changes/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Save Snapshot/i }),
    ).not.toBeInTheDocument();
  });
});
