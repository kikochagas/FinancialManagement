import React from "react";
import { formatCurrency } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SubmittedReportHistoryItem } from "../types";
import { normalizeCurrency } from "../utils";

function formatSafeCurrency(
  value: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (value == null) return "-";
  const norm = normalizeCurrency(currency);
  if (norm) {
    return formatCurrency(value, norm);
  }
  return value + " (currency unknown)";
}

export function SnapshotDetailDialog({
  snapshot,
  open,
  onOpenChange,
}: {
  snapshot: SubmittedReportHistoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!snapshot) return null;

  const statementDateStr = new Date(snapshot.statementDate).toLocaleDateString(
    "en-GB",
    { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" },
  );
  const importedDateStr = new Date(snapshot.importedAt).toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "short", year: "numeric" },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Portfolio Snapshot Details</DialogTitle>
          <DialogDescription>
            Read-only evidence from {snapshot.account.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Account
            </span>
            <p className="text-sm font-medium text-foreground">
              {snapshot.account.name} ({snapshot.account.type})
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Statement Date
            </span>
            <p className="text-sm font-medium text-foreground">
              {statementDateStr}{" "}
              <span className="text-muted-foreground text-xs font-normal">
                ({snapshot.statementDateSource || "Unknown source"})
              </span>
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Imported Date
            </span>
            <p className="text-sm font-medium text-foreground">
              {importedDateStr}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground">
              Completeness
            </span>
            <p className="text-sm font-medium text-foreground">
              <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-medium text-xs">
                {snapshot.completeness}
              </span>
            </p>
          </div>
        </div>

        <div className="space-y-6 mt-4">
          {snapshot.positions && snapshot.positions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold border-b border-border pb-1">
                Positions ({snapshot.positions.length})
              </h3>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border text-muted-foreground">
                      <th className="p-2">Name / Ticker</th>
                      <th className="p-2">Section / Asset Class</th>
                      <th className="p-2">Identifier</th>
                      <th className="p-2 text-right">Quantity</th>
                      <th className="p-2 text-right">Unit Price</th>
                      <th className="p-2 text-right">Market Value</th>
                      <th className="p-2 text-right">Valuation Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {snapshot.positions.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/20">
                        <td className="p-2">
                          <div className="font-medium text-foreground">
                            {p.name || "-"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {p.ticker || "-"}
                          </div>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          <div>{p.sourceSection || "-"}</div>
                          <div className="text-[10px]">
                            {p.assetClass || "-"}
                          </div>
                        </td>
                        <td className="p-2 text-muted-foreground font-mono">
                          <div>{p.isin || "-"}</div>
                          <div className="text-[10px]">
                            {p.instrumentIdentifier || "-"} (
                            {p.instrumentIdentifierType || "-"})
                          </div>
                        </td>
                        <td className="p-2 text-right font-mono text-foreground">
                          {p.quantity ?? "-"}
                        </td>
                        <td className="p-2 text-right font-mono text-foreground">
                          {formatSafeCurrency(p.unitPrice, p.currency)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-foreground">
                          {p.marketValue != null ? (
                            formatSafeCurrency(p.marketValue, p.currency)
                          ) : (
                            <span className="font-normal text-muted-foreground">
                              Unavailable
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono text-muted-foreground">
                          {p.valuationDate || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {snapshot.cashBalances && snapshot.cashBalances.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold border-b border-border pb-1">
                Cash Balances
              </h3>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border text-muted-foreground">
                      <th className="p-2">Type</th>
                      <th className="p-2">Label</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {snapshot.cashBalances.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="p-2 text-foreground">{c.type || "-"}</td>
                        <td className="p-2 text-muted-foreground">
                          {c.label || "-"}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-foreground">
                          {formatSafeCurrency(c.amount, c.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {snapshot.totals && snapshot.totals.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold border-b border-border pb-1">
                Extracted Totals
              </h3>
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border text-muted-foreground">
                      <th className="p-2">Type</th>
                      <th className="p-2">Label</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {snapshot.totals.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/20">
                        <td className="p-2 text-foreground font-medium">
                          {t.type}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {t.label || "-"}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-foreground">
                          {formatSafeCurrency(t.amount, t.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
