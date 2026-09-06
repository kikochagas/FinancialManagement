import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrokerSnapshotWizard } from "../components/BrokerSnapshotWizard";
import * as actions from "../actions";
import * as actionsApply from "../actions-apply";

vi.mock("../actions", () => ({
  getSnapshotReconciliation: vi.fn(),
  getExistingSnapshotReconciliation: vi.fn(),
}));

vi.mock("../actions-apply", () => ({
  applyBrokerSnapshot: vi.fn(),
    applyExistingBrokerSnapshot: vi.fn(),
}));

describe("BrokerSnapshotWizard", () => {
  const accounts = [
    { id: "acc-1", name: "Trade Republic", type: "Broker" },
    { id: "acc-2", name: "Coinbase", type: "Crypto Wallet" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  const setupPreview = async (mockReconciliationOverrides = {}) => {
    const mockSnapshot = {
      statementDate: "2026-08-30",
      completeness: "COMPLETE",
      positions: [],
      cashBalances: [{ type: "EUR", amount: 1500, currency: "EUR" }],
      totals: [],
    };

    const mockReconciliation = {
      accountId: "acc-1",
      positions: [
        {
          importedPosition: {
            name: "Apple",
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
          },
          status: "NEW",
          matchMethod: "NONE",
          matchedInvestmentId: null,
          proposedChanges: null,
          reason: null,
        },
        {
          importedPosition: { name: "Same Corp", quantity: 5, marketValue: 50 },
          status: "UNCHANGED",
          matchMethod: "NONE",
          matchedInvestmentId: "inv-3",
          proposedChanges: null,
          reason: null,
        },
        {
          importedPosition: {
            name: "Ambig Corp",
            quantity: 100,
            marketValue: 500,
          },
          status: "AMBIGUOUS",
          matchMethod: "NAME",
          matchedInvestmentId: null,
          proposedChanges: null,
          reason: "Weak match",
        },
        {
          importedPosition: {
            name: "Conflict Corp",
            quantity: 100,
            marketValue: 500,
          },
          status: "CONFLICT",
          matchMethod: "TICKER",
          matchedInvestmentId: "inv-conf",
          proposedChanges: null,
          reason: "Identifiers conflict.",
        },
        ...((mockReconciliationOverrides as any).positions || []),
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSnapshot,
    });

    vi.mocked(actions.getSnapshotReconciliation).mockResolvedValueOnce({
      data: mockReconciliation as any,
    } as any);

    render(<BrokerSnapshotWizard investmentAccounts={accounts} />);

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    const option = await screen.findByText("Trade Republic · Broker");
    fireEvent.click(option);

    const processButton = screen.getByRole("button", { name: /Process PDF/i });
    const fileInput = processButton.parentElement?.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(["dummy base64 content"], "test.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(processButton);

    await waitFor(() => {
      expect(screen.getByText("Preview Mode Only")).toBeInTheDocument();
    });

    return { fileInput, processButton };
  };

  it("renders correct actions for each position status", async () => {
    await setupPreview();

    // UNCHANGED
    expect(screen.getByText("No action needed")).toBeInTheDocument();

    // AMBIGUOUS and CONFLICT
    expect(screen.getAllByText("SKIP (Manual review req)").length).toBe(2);

    // MATCHED and NEW
    const selectTriggers = screen
      .getAllByRole("combobox")
      .filter((el) => !el.textContent?.includes("Trade Republic"));
    expect(selectTriggers.length).toBe(2);

    // Default to SKIP
    expect(selectTriggers[0]).toHaveTextContent("Skip");
    expect(selectTriggers[1]).toHaveTextContent("Skip");
  });

  it("can select CREATE/UPDATE, assert summary, verify exact payload, and handle success", async () => {
    await setupPreview();

    // Select UPDATE for MATCHED (first select)
    const selectTriggers = screen
      .getAllByRole("combobox")
      .filter((el) => !el.textContent?.includes("Trade Republic"));
    fireEvent.click(selectTriggers[0]);
    fireEvent.click(screen.getByText("Update"));

    // Select CREATE for NEW (second select)
    fireEvent.click(selectTriggers[1]);
    fireEvent.click(screen.getByText("Create"));

    // Enable cash balance toggle
    const cashToggle = screen.getByLabelText(/Update account cash balance/i);
    expect(cashToggle).not.toBeChecked();
    fireEvent.click(cashToggle);

    vi.mocked(actionsApply.applyBrokerSnapshot).mockResolvedValueOnce({
      data: {
        success: true,
        warnings: ["Cash balance untouched (not enabled)"],
      },
    } as any);

    fireEvent.click(screen.getByRole("button", { name: /Review & Confirm/i }));

    expect(
      screen.getByText("Confirm Snapshot Application"),
    ).toBeInTheDocument();

    // Verify confirmation counts
    expect(screen.getByText("Positions to Create")).toBeInTheDocument();
    expect(
      screen.getByText("Positions to Create").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      screen.getByText("Positions to Update").nextElementSibling,
    ).toHaveTextContent("1");
    expect(
      screen.getByText("Positions Skipped").nextElementSibling,
    ).toHaveTextContent("3");
    expect(
      screen.getByText("Update Cash Balance").nextElementSibling,
    ).toHaveTextContent("Yes");

    // Apply
    const applyBtn = screen.getByRole("button", { name: /Apply Snapshot/i });
    fireEvent.click(applyBtn);

    // Verify locking logic during apply
    expect(applyBtn).toBeDisabled();
    expect(applyBtn).toHaveTextContent("Applying...");
    const accountCombo = screen.getAllByRole("combobox")[0];
    expect(accountCombo).toBeDisabled();

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeDisabled();

    await waitFor(() => {
      expect(actionsApply.applyBrokerSnapshot).toHaveBeenCalledTimes(1);
    });

    const callArgs = vi.mocked(actionsApply.applyBrokerSnapshot).mock
      .calls[0][0];
    expect(callArgs).toEqual({
      accountId: "acc-1",
      fileBase64: expect.any(String),
      updateCashBalance: true,
      positionIntents: [
        { candidateIndex: 0, action: "UPDATE" },
        { candidateIndex: 1, action: "CREATE" },
        { candidateIndex: 2, action: "SKIP" },
        { candidateIndex: 3, action: "SKIP" },
        { candidateIndex: 4, action: "SKIP" },
      ],
    });

    // Assert no quantity, marketValue etc leaked into payload
    expect((callArgs as any).positionIntents[0].quantity).toBeUndefined();
    expect((callArgs as any).positionIntents[1].marketValue).toBeUndefined();

    // Check success UI
    expect(
      await screen.findByText("Snapshot Saved Successfully"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("• Cash balance untouched (not enabled)"),
    ).toBeInTheDocument();

    // Preview Mode should disappear
    expect(screen.queryByText("Preview Mode Only")).not.toBeInTheDocument();
  });

  it("handles DUPLICATE_FINGERPRINT with friendly warning", async () => {
    await setupPreview();

    vi.mocked(actionsApply.applyBrokerSnapshot).mockResolvedValueOnce({
      data: {
        success: false,
        error: "DUPLICATE_FINGERPRINT",
        warning: "This document has already been applied.",
      },
    } as any);

    fireEvent.click(screen.getByRole("button", { name: /Review & Confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Snapshot/i }));

    await waitFor(() => {
      expect(
        screen.getByText("This document has already been applied."),
      ).toBeInTheDocument();
    });
  });

  it("renders generic server errors visibly", async () => {
    await setupPreview();

    vi.mocked(actionsApply.applyBrokerSnapshot).mockResolvedValueOnce({
      serverError: "Simulated generic server failure",
    } as any);

    fireEvent.click(screen.getByRole("button", { name: /Review & Confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Snapshot/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Simulated generic server failure"),
      ).toBeInTheDocument();
    });
  });

  it("clears state when changing file", async () => {
    const { fileInput } = await setupPreview();
    expect(screen.getByText("Preview Mode Only")).toBeInTheDocument();

    const newFile = new File(["diff"], "diff.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [newFile] } });

    expect(screen.queryByText("Preview Mode Only")).not.toBeInTheDocument();
  });

  it("clears state when changing account", async () => {
    await setupPreview();

    expect(screen.getByText("Preview Mode Only")).toBeInTheDocument();

    const accountCombo = screen.getAllByRole("combobox")[0];
    accountCombo.focus();
    fireEvent.keyDown(accountCombo, { key: "ArrowDown" });
    const option = await screen.findByText(/Coinbase/i);
    fireEvent.click(option);

    expect(screen.queryByText("Preview Mode Only")).not.toBeInTheDocument();
  });

  it("resets file input on Import Another", async () => {
    const { fileInput, processButton } = await setupPreview();

    vi.mocked(actionsApply.applyBrokerSnapshot).mockResolvedValueOnce({
      data: { success: true, warnings: [] },
    } as any);

    fireEvent.click(screen.getByRole("button", { name: /Review & Confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Snapshot/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Snapshot Saved Successfully"),
      ).toBeInTheDocument();
    });

    const importAnotherBtn = screen.getByRole("button", {
      name: /Import Another/i,
    });
    fireEvent.click(importAnotherBtn);

    // success screen gone
    expect(
      screen.queryByText("Snapshot Saved Successfully"),
    ).not.toBeInTheDocument();

    // file input empty
    expect(fileInput.value).toBe("");

    // process button disabled
    expect(processButton).toBeDisabled();
  });
  it("handles DUPLICATE_FINGERPRINT with existing snapshot flow", async () => {
    const { fileInput, processButton } = await setupPreview();

    vi.mocked(actionsApply.applyBrokerSnapshot).mockResolvedValueOnce({
      data: {
        success: false,
        error: "DUPLICATE_FINGERPRINT",
        warning: "This document has already been applied.",
        existingSnapshotId: "snap-123",
      },
    } as any);

    fireEvent.click(screen.getByRole("button", { name: /Review & Confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Snapshot/i }));

    await waitFor(() => {
      expect(
        screen.getByText("This document has already been applied."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Use existing snapshot/i }),
      ).toBeInTheDocument();
    });

    vi.mocked(actions.getExistingSnapshotReconciliation).mockResolvedValueOnce({
      data: {
        snapshot: {
          statementDate: "2026-08-30",
          completeness: "COMPLETE",
          positions: [],
          cashBalances: [],
          totals: [],
        },
        reconciliation: {
          accountId: "acc-1",
          positions: [],
        },
        accountId: "acc-1",
      },
    } as any);

    fireEvent.click(
      screen.getByRole("button", { name: /Use existing snapshot/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Preview Mode Only")).toBeInTheDocument();
    });

    vi.mocked(actionsApply.applyExistingBrokerSnapshot).mockResolvedValueOnce({
      data: { success: true, warnings: [] },
    } as any);

    fireEvent.click(screen.getByRole("button", { name: /Review & Confirm/i }));

    // Confirmation screen should show the amber text
    expect(
      screen.getByText("Applying projection changes to existing snapshot."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Apply Snapshot/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Snapshot Saved Successfully"),
      ).toBeInTheDocument();
    });

    expect(actionsApply.applyExistingBrokerSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotId: "snap-123",
        updateCashBalance: false,
      }),
    );
  });
});
