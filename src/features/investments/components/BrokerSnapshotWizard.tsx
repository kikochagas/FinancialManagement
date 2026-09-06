"use client";

import React, { useState, useTransition, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertCircle,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Info,
  UploadCloud,
} from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { BrokerSnapshot } from "../broker-import/schema";
import {
  SnapshotReconciliation,
  PositionReconciliation,
} from "../broker-import/reconciliation";
import {
  getSnapshotReconciliation,
  getExistingSnapshotReconciliation,
} from "../actions";
import {
  applyBrokerSnapshot,
  applyExistingBrokerSnapshot,
} from "../actions-apply";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface BrokerSnapshotWizardProps {
  investmentAccounts: { id: string; name: string; type: string }[];
}

type DuplicateFingerprintResult = {
  success: false;
  error: "DUPLICATE_FINGERPRINT";
  warning?: string;
  existingSnapshotId?: string;
};

function isDuplicateFingerprintResult(
  data: unknown,
): data is DuplicateFingerprintResult {
  if (!data || typeof data !== "object") return false;

  const result = data as Record<string, unknown>;

  return result.success === false && result.error === "DUPLICATE_FINGERPRINT";
}

export function BrokerSnapshotWizard({
  investmentAccounts,
}: BrokerSnapshotWizardProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [existingSnapshotId, setExistingSnapshotId] = useState<string | null>(
    null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [snapshot, setSnapshot] = useState<BrokerSnapshot | null>(null);
  const [reconciliation, setReconciliation] =
    useState<SnapshotReconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);

  type IntentAction = "CREATE" | "UPDATE" | "SKIP";
  const [positionIntents, setPositionIntents] = useState<
    Record<number, IntentAction>
  >({});
  const [updateCashBalance, setUpdateCashBalance] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUseExistingSnapshot = async () => {
    if (!existingSnapshotId) return;
    setIsApplying(true);
    setError(null);
    setWarning(null);
    try {
      const res = await getExistingSnapshotReconciliation({
        snapshotId: existingSnapshotId,
      });
      if (res?.data) {
        setSnapshot(res.data.snapshot as BrokerSnapshot);
        setReconciliation(res.data.reconciliation as any);

        const initialIntents: Record<number, IntentAction> = {};
        res.data.reconciliation.positions.forEach((p: any, idx: number) => {
          initialIntents[idx] =
            p.status === "AMBIGUOUS" || p.status === "CONFLICT"
              ? "SKIP"
              : p.status === "NEW"
                ? "CREATE"
                : p.status === "MATCHED"
                  ? "UPDATE"
                  : "SKIP";
        });
        setPositionIntents(initialIntents);
      } else {
        setError(res?.serverError || "Failed to load existing snapshot.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to load existing snapshot.");
    } finally {
      setIsApplying(false);
    }
  };

  const handleImportAnother = () => {
    setFile(null);
    setSnapshot(null);
    setReconciliation(null);
    setPositionIntents({});
    setUpdateCashBalance(false);
    setApplyResult(null);
    setError(null);
    setWarning(null);
    setExistingSnapshotId(null);
    setIsConfirming(false);
    setIsApplying(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const [applyResult, setApplyResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    cashUpdated: boolean;
    warnings: string[];
  } | null>(null);

  const handleAccountChange = (val: string) => {
    setExistingSnapshotId(null);
    setSelectedAccountId(val);
    setSnapshot(null);
    setReconciliation(null);
    setError(null);
    setIsConfirming(false);
    setApplyResult(null);
    setPositionIntents({});
    setUpdateCashBalance(false);
  };

  const handleFileChange = (file: File | null) => {
    setExistingSnapshotId(null);
    setFile(file);
    setSnapshot(null);
    setReconciliation(null);
    setError(null);
    setIsConfirming(false);
    setApplyResult(null);
    setPositionIntents({});
    setUpdateCashBalance(false);
  };

  const handleUpload = async () => {
    if (!file || !selectedAccountId) return;

    setIsUploading(true);
    setError(null);
    setSnapshot(null);
    setReconciliation(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 1. Upload and extract snapshot
      const res = await fetch("/api/broker-import/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const extractedSnapshot: BrokerSnapshot = await res.json();
      setSnapshot(extractedSnapshot);

      // 2. Reconcile
      startTransition(async () => {
        const result = await getSnapshotReconciliation({
          accountId: selectedAccountId,
          snapshot: extractedSnapshot,
        });

        if (result?.data) {
          setReconciliation(result.data);
          const defaultIntents: Record<number, IntentAction> = {};
          result.data.positions.forEach((p, idx) => {
            defaultIntents[idx] = "SKIP";
          });
          setPositionIntents(defaultIntents);
        } else {
          setError(result?.serverError || "Reconciliation failed");
        }
      });
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsUploading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedAccountId || !reconciliation) return;
    if (!existingSnapshotId && !file) return;

    setIsApplying(true);
    setError(null);
    try {
      const getBase64 = (f: File): Promise<string> =>
        new Promise((res, rej) => {
          const reader = new FileReader();
          reader.readAsDataURL(f);
          reader.onload = () => {
            const encoded = reader.result?.toString() || "";
            const parts = encoded.split(",");
            res(parts.length > 1 ? parts[1] : encoded);
          };
          reader.onerror = (e) => rej(e);
        });

      const base64 = !existingSnapshotId && file ? await getBase64(file) : "";
      const intents = Object.entries(positionIntents).map(([idx, action]) => ({
        candidateIndex: Number(idx),
        action,
      }));

      let res;
      if (existingSnapshotId) {
        res = await applyExistingBrokerSnapshot({
          snapshotId: existingSnapshotId,
          positionIntents: intents,
          updateCashBalance,
        });
      } else {
        res = await applyBrokerSnapshot({
          accountId: selectedAccountId,
          fileBase64: base64,
          positionIntents: intents,
          updateCashBalance,
        });
      }

      if (isDuplicateFingerprintResult(res?.data)) {
        setError("DUPLICATE_FINGERPRINT");
        setWarning(
          res.data.warning || "This document has already been applied.",
        );
        if (res.data.existingSnapshotId) {
          setExistingSnapshotId(res.data.existingSnapshotId);
        }
        setIsConfirming(false);
      } else if (res?.data?.success) {
        let created = 0;
        let updated = 0;
        let skipped = 0;
        intents.forEach((intent) => {
          if (intent.action === "CREATE") created++;
          if (intent.action === "UPDATE") updated++;
          if (intent.action === "SKIP") skipped++;
        });

        setApplyResult({
          created,
          updated,
          skipped,
          cashUpdated:
            updateCashBalance &&
            (res.data.warnings || []).filter((w) =>
              w.includes("Cash balance untouched"),
            ).length === 0,
          warnings: res.data.warnings || [],
        });
        setIsConfirming(false);
      } else {
        setError(res?.serverError || "Failed to apply snapshot");
        setIsConfirming(false);
      }
    } catch (e: any) {
      setError(e.message || "An error occurred");
      setIsConfirming(false);
    } finally {
      setIsApplying(false);
    }
  };

  const selectedAccountName = investmentAccounts.find(
    (a) => a.id === selectedAccountId,
  )?.name;

  const formatSnapshotValue = (
    value: number,
    currency: string | null | undefined,
  ) =>
    currency
      ? formatCurrency(value, currency)
      : `${value.toLocaleString("pt-PT", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} (currency unknown)`;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card/50 shadow-sm">
        <CardHeader>
          <CardTitle>Import Broker Statement</CardTitle>
          <CardDescription>
            Upload a PDF statement to extract positions and reconcile against
            your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
              Target Account
            </label>
            <Select
              value={selectedAccountId}
              onValueChange={handleAccountChange}
              disabled={isUploading || isPending || isApplying}
            >
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Select Broker or Crypto Wallet" />
              </SelectTrigger>
              <SelectContent>
                {investmentAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} · {account.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase">
              PDF Document
            </label>
            <div className="flex items-center gap-3">
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="w-full md:w-[400px]"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                disabled={isUploading || isPending || isApplying}
              />
              <Button
                onClick={handleUpload}
                disabled={
                  (!existingSnapshotId && !file) ||
                  !selectedAccountId ||
                  isUploading ||
                  isPending ||
                  isApplying
                }
                className="flex items-center gap-2"
              >
                <UploadCloud className="h-4 w-4" />
                {isUploading || isPending ? "Processing..." : "Process PDF"}
              </Button>
            </div>
          </div>

          {error === "DUPLICATE_FINGERPRINT" ? (
            <div className="flex flex-col gap-3 text-sm text-amber-600 p-4 bg-amber-500/10 rounded-md border border-amber-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <div>
                  <p className="font-medium">Duplicate Statement</p>
                  <p className="text-amber-600/80 mt-1">
                    {warning || "This document has already been applied."}
                  </p>
                </div>
              </div>
              {existingSnapshotId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit border-amber-500/30 hover:bg-amber-500/10 text-amber-700"
                  onClick={handleUseExistingSnapshot}
                  disabled={isApplying}
                >
                  Use existing snapshot
                </Button>
              )}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/10 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {reconciliation && snapshot && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {!applyResult && (
            <div className="p-4 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-start gap-3">
              <Info className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Preview Mode Only</p>
                <p className="text-xs opacity-90">
                  This is a reconciliation preview. No data has been saved,
                  mutated, or applied to your database yet.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-border shadow-sm bg-background">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Document Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium text-foreground">
                    {selectedAccountName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Statement Date</span>
                  <span className="font-mono text-foreground">
                    {snapshot.statementDate || "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completeness</span>
                  <span
                    className={cn(
                      "font-semibold",
                      snapshot.completeness === "COMPLETE"
                        ? "text-emerald-500"
                        : "text-amber-500",
                    )}
                  >
                    {snapshot.completeness}
                  </span>
                </div>
                {snapshot.extractionWarnings &&
                  snapshot.extractionWarnings.length > 0 && (
                    <div className="mt-4 space-y-1">
                      <span className="text-xs font-semibold text-amber-500 uppercase">
                        Extraction Warnings
                      </span>
                      <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                        {snapshot.extractionWarnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm bg-background">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  Financial Totals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {snapshot.cashBalances.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      Cash Balances
                    </span>
                    {snapshot.cashBalances.map((cb, i) => (
                      <div
                        key={i}
                        className="flex justify-between border-b border-border/50 pb-1 last:border-0 last:pb-0"
                      >
                        <span className="text-foreground">
                          {cb.label || cb.type}
                        </span>
                        <span className="font-mono font-medium">
                          {formatCurrency(cb.amount, cb.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {snapshot.totals.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      Aggregates
                    </span>
                    {snapshot.totals.map((t, i) => (
                      <div
                        key={i}
                        className="flex justify-between border-b border-border/50 pb-1 last:border-0 last:pb-0"
                      >
                        <span className="text-foreground">
                          {t.label || t.type}
                        </span>
                        <span className="font-mono font-medium">
                          {formatCurrency(t.amount, t.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Extracted Positions & Reconciliation
              </CardTitle>
              <CardDescription className="text-xs">
                How the extracted positions match your existing account ledger.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-card-foreground">
                  <thead className="border-y border-border bg-muted/50">
                    <tr>
                      <th className="p-3 font-semibold text-xs text-muted-foreground uppercase">
                        Asset
                      </th>
                      <th className="p-3 font-semibold text-xs text-muted-foreground uppercase">
                        Extracted Values
                      </th>
                      <th className="p-3 font-semibold text-xs text-muted-foreground uppercase">
                        Match Status
                      </th>
                      <th className="p-3 font-semibold text-xs text-muted-foreground uppercase">
                        Proposed Updates
                      </th>
                      <th className="p-3 font-semibold text-xs text-muted-foreground uppercase">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {reconciliation.positions.map(
                      (rec: PositionReconciliation, idx: number) => {
                        const p = rec.importedPosition;
                        let statusBadge = "";
                        switch (rec.status) {
                          case "NEW":
                            statusBadge =
                              "bg-blue-500/10 text-blue-500 border-blue-500/20";
                            break;
                          case "MATCHED":
                            statusBadge =
                              "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                            break;
                          case "UNCHANGED":
                            statusBadge =
                              "bg-slate-500/10 text-slate-500 border-slate-500/20";
                            break;
                          case "AMBIGUOUS":
                            statusBadge =
                              "bg-amber-500/10 text-amber-500 border-amber-500/20";
                            break;
                          case "CONFLICT":
                            statusBadge =
                              "bg-red-500/10 text-red-500 border-red-500/20";
                            break;
                        }

                        return (
                          <tr
                            key={idx}
                            className="hover:bg-accent/40 transition-colors"
                          >
                            <td className="p-3 align-top">
                              <div className="font-semibold text-foreground text-sm">
                                {p.name || "Unknown Asset"}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {p.isin && (
                                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                    ISIN: {p.isin}
                                  </span>
                                )}
                                {p.ticker && (
                                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                    TICKER: {p.ticker}
                                  </span>
                                )}
                                {p.sourceSection && (
                                  <span className="text-[10px] text-muted-foreground/60">
                                    {p.sourceSection}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 align-top font-mono">
                              <div>
                                {p.quantity?.toLocaleString() || "-"} units
                              </div>
                              <div className="font-semibold text-foreground mt-0.5">
                                {p.marketValue != null
                                  ? formatSnapshotValue(
                                      p.marketValue,
                                      p.currency,
                                    )
                                  : "-"}
                              </div>
                            </td>
                            <td className="p-3 align-top">
                              <span
                                className={cn(
                                  "inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider mb-1",
                                  statusBadge,
                                )}
                              >
                                {rec.status}
                              </span>
                              {rec.matchMethod !== "NONE" && (
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  via {rec.matchMethod}
                                </div>
                              )}
                              {rec.reason && (
                                <div className="flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 max-w-[200px]">
                                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span>{rec.reason}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-3 align-top space-y-1 font-mono text-[11px]">
                              {rec.proposedChanges ? (
                                Object.entries(rec.proposedChanges).map(
                                  ([key, val]) => (
                                    <div
                                      key={key}
                                      className="flex items-center gap-1.5"
                                    >
                                      <span className="text-muted-foreground">
                                        Update {key}:
                                      </span>
                                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                        {key === "marketValue"
                                          ? formatSnapshotValue(
                                              val as number,
                                              p.currency,
                                            )
                                          : String(val)}
                                      </span>
                                    </div>
                                  ),
                                )
                              ) : (
                                <span className="text-muted-foreground italic text-[11px]">
                                  No changes
                                </span>
                              )}
                            </td>
                            <td className="p-3 align-top">
                              {rec.status === "UNCHANGED" ? (
                                <span className="text-xs text-muted-foreground italic">
                                  No action needed
                                </span>
                              ) : rec.status === "AMBIGUOUS" ||
                                rec.status === "CONFLICT" ? (
                                <div className="text-xs text-destructive font-medium">
                                  SKIP (Manual review req)
                                </div>
                              ) : (
                                <Select
                                  value={positionIntents[idx]}
                                  onValueChange={(val: IntentAction) =>
                                    setPositionIntents((prev) => ({
                                      ...prev,
                                      [idx]: val,
                                    }))
                                  }
                                  disabled={
                                    isConfirming ||
                                    isApplying ||
                                    applyResult !== null
                                  }
                                >
                                  <SelectTrigger className="w-[120px] h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="SKIP">Skip</SelectItem>
                                    {rec.status === "NEW" && (
                                      <SelectItem value="CREATE">
                                        Create
                                      </SelectItem>
                                    )}
                                    {rec.status === "MATCHED" && (
                                      <SelectItem value="UPDATE">
                                        Update
                                      </SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
              {reconciliation.positions.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No positions extracted from this document.
                </div>
              )}
            </CardContent>
          </Card>

          {applyResult === null && !isConfirming && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border border-border rounded-md bg-card">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="cash-toggle"
                  checked={updateCashBalance}
                  onCheckedChange={(checked) => setUpdateCashBalance(!!checked)}
                />
                <Label htmlFor="cash-toggle" className="text-sm cursor-pointer">
                  Update account cash balance from this snapshot
                </Label>
              </div>
              <Button onClick={() => setIsConfirming(true)}>
                Review & Confirm
              </Button>
            </div>
          )}

          {isConfirming && (
            <Card className="border-primary/50 shadow-sm bg-card mt-6">
              <CardHeader>
                <CardTitle>Confirm Snapshot Application</CardTitle>
                {existingSnapshotId && (
                  <p className="text-xs text-amber-500 mt-1 font-normal tracking-normal">
                    Applying projection changes to existing snapshot.
                  </p>
                )}
                <CardDescription>
                  Please review the final actions before applying to your
                  account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2 p-3 bg-muted/50 rounded-md">
                  <div className="text-muted-foreground">Snapshot Account</div>
                  <div className="font-semibold">{selectedAccountName}</div>
                  <div className="text-muted-foreground">Statement Date</div>
                  <div className="font-mono">{snapshot.statementDate}</div>
                  <div className="text-muted-foreground">
                    Positions to Create
                  </div>
                  <div className="font-semibold">
                    {
                      Object.values(positionIntents).filter(
                        (v) => v === "CREATE",
                      ).length
                    }
                  </div>
                  <div className="text-muted-foreground">
                    Positions to Update
                  </div>
                  <div className="font-semibold">
                    {
                      Object.values(positionIntents).filter(
                        (v) => v === "UPDATE",
                      ).length
                    }
                  </div>
                  <div className="text-muted-foreground">Positions Skipped</div>
                  <div className="font-semibold">
                    {
                      Object.values(positionIntents).filter((v) => v === "SKIP")
                        .length
                    }
                  </div>
                  <div className="text-muted-foreground">
                    Update Cash Balance
                  </div>
                  <div className="font-semibold">
                    {updateCashBalance ? "Yes" : "No"}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsConfirming(false)}
                    disabled={isApplying}
                  >
                    Back
                  </Button>
                  <Button onClick={handleApply} disabled={isApplying}>
                    {isApplying ? "Applying..." : "Apply Snapshot"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {applyResult && (
            <Card className="border-emerald-500/50 bg-emerald-500/5 shadow-sm mt-6">
              <CardHeader>
                <CardTitle className="text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Snapshot Saved Successfully
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ul className="list-disc list-inside space-y-1">
                  <li>Snapshot evidence persisted immutably</li>
                  <li>{applyResult.created} investments created</li>
                  <li>{applyResult.updated} investments updated</li>
                  <li>{applyResult.skipped} positions skipped</li>
                  <li>
                    Account cash balance{" "}
                    {applyResult.cashUpdated ? "updated" : "not updated"}
                  </li>
                </ul>
                {applyResult.warnings && applyResult.warnings.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md text-xs space-y-1">
                    <div className="font-semibold uppercase mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Server Warnings
                    </div>
                    {applyResult.warnings.map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-border flex justify-end">
                  <Button variant="outline" onClick={handleImportAnother}>
                    Import Another
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
