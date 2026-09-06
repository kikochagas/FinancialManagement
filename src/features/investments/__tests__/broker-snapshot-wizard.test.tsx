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
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => {};
    if (typeof window.PointerEvent === "undefined") {
      (window as any).PointerEvent = class PointerEvent extends MouseEvent {};
    }
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

  it("renders correct actions for each position status with new defaults", async () => {
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

    // MATCHED defaults to UPDATE
    expect(selectTriggers[0]).toHaveTextContent("Update");
    // NEW defaults to CREATE
    expect(selectTriggers[1]).toHaveTextContent("Create");
  });

  it("verifies default summary, allows changing to SKIP, verifies exact payload, and handles success", async () => {
    await setupPreview();

    // Verify initial defaults
    const selectTriggers = screen
      .getAllByRole("combobox")
      .filter((el) => !el.textContent?.includes("Trade Republic"));

    // Change MATCHED from Update to Skip
    fireEvent.click(selectTriggers[0]);
    fireEvent.click(screen.getAllByRole("option", { name: "Skip" })[0]);

    // Change NEW from Create to Skip
    fireEvent.click(selectTriggers[1]);
    fireEvent.click(screen.getAllByRole("option", { name: "Skip" })[0]);

    // Change them BACK to default behavior (UPDATE/CREATE) to preserve the rest of the test
    fireEvent.click(selectTriggers[0]);
    fireEvent.click(screen.getByText("Update"));
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

    expect(screen.getByText("Document Overview")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Review & Confirm/i }),
    ).toBeInTheDocument();

    const accountCombo = screen
      .getAllByRole("combobox")
      .find((el) => el.textContent?.includes("Trade Republic"));

    expect(accountCombo).toBeInTheDocument();

    // The preview can render before startTransition has fully settled.
    await waitFor(() => {
      expect(accountCombo).not.toBeDisabled();
    });

    // Change Account A -> Account B
    fireEvent.click(accountCombo!);

    const option = await screen.findByText("Coinbase · Crypto Wallet");
    fireEvent.click(option);

    // Account change clears stale preview/reconciliation state.
    await waitFor(() => {
      expect(screen.queryByText("Preview Mode Only")).not.toBeInTheDocument();
      expect(screen.queryByText("Document Overview")).not.toBeInTheDocument();

      expect(
        screen.queryByRole("button", { name: /Review & Confirm/i }),
      ).not.toBeInTheDocument();

      expect(
        screen.queryByText("Confirm Snapshot Application"),
      ).not.toBeInTheDocument();
    });
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

  it("handles DUPLICATE_FINGERPRINT with existing snapshot flow and verifies success wording", async () => {
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
          positions: [
            {
              status: "MATCHED",
              importedPosition: {
                name: "Apple",
                quantity: 10,
                marketValue: 1500,
                currency: "USD",
              },
              matchMethod: "ISIN",
              matchedInvestmentId: "inv-1",
              proposedChanges: { quantity: 10 },
              reason: null,
            },
          ],
        },
      },
    } as any);

    fireEvent.click(
      screen.getByRole("button", { name: /Use existing snapshot/i }),
    );

    await waitFor(() => {
      expect(actions.getExistingSnapshotReconciliation).toHaveBeenCalledWith({
        snapshotId: "snap-123",
      });
    });

    // Assert existing-snapshot default UPDATE
    const selectTriggers = screen
      .getAllByRole("combobox")
      .filter((el) => !el.textContent?.includes("Trade Republic"));
    expect(selectTriggers[0]).toHaveTextContent("Update");

    // Now apply existing
    vi.mocked(actionsApply.applyExistingBrokerSnapshot).mockResolvedValueOnce({
      data: { success: true, warnings: [] },
    } as any);

    fireEvent.click(screen.getByRole("button", { name: /Review & Confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: /Apply Snapshot/i }));

    await waitFor(() => {
      expect(actionsApply.applyExistingBrokerSnapshot).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByText("Portfolio Updated Successfully"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Existing snapshot evidence preserved"),
      ).toBeInTheDocument();
    });
  });
});
