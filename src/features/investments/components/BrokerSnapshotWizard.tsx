"use client";

import React, { useState, useTransition } from "react";
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
import { getSnapshotReconciliation } from "../actions";

interface BrokerSnapshotWizardProps {
  investmentAccounts: { id: string; name: string; type: string }[];
}

export function BrokerSnapshotWizard({
  investmentAccounts,
}: BrokerSnapshotWizardProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [snapshot, setSnapshot] = useState<BrokerSnapshot | null>(null);
  const [reconciliation, setReconciliation] =
    useState<SnapshotReconciliation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setSnapshot(null);
    setReconciliation(null);
    setError(null);
  };

  const handleFileChange = (newFile: File | null) => {
    setFile(newFile);
    setSnapshot(null);
    setReconciliation(null);
    setError(null);
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
              disabled={isUploading || isPending}
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
                type="file"
                accept="application/pdf"
                className="w-full md:w-[400px]"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                disabled={isUploading || isPending}
              />
              <Button
                onClick={handleUpload}
                disabled={
                  !file || !selectedAccountId || isUploading || isPending
                }
                className="flex items-center gap-2"
              >
                <UploadCloud className="h-4 w-4" />
                {isUploading || isPending ? "Processing..." : "Process PDF"}
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/10 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {reconciliation && snapshot && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
        </div>
      )}
    </div>
  );
}
