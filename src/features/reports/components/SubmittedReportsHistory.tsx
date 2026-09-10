import React, { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SnapshotDetailDialog } from "./SnapshotDetailDialog";
import { SubmittedReportHistoryItem } from "../types";

export function SubmittedReportsHistory({
  snapshotHistory,
}: {
  snapshotHistory: SubmittedReportHistoryItem[];
}) {
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedReportType, setSelectedReportType] = useState<string>("all");

  const [selectedSnapshot, setSelectedSnapshot] =
    useState<SubmittedReportHistoryItem | null>(null);

  // Extract filter options
  const accounts = useMemo(() => {
    const accs = new Map();
    snapshotHistory.forEach((s) => accs.set(s.account.id, s.account.name));
    return Array.from(accs.entries()).map(([id, name]) => ({ id, name }));
  }, [snapshotHistory]);

  const years = useMemo(() => {
    const yrs = new Set<string>();
    snapshotHistory.forEach((s) => yrs.add(s.statementDate.substring(0, 4)));
    return Array.from(yrs).sort().reverse();
  }, [snapshotHistory]);

  const months = [
    { value: "0", label: "January" },
    { value: "1", label: "February" },
    { value: "2", label: "March" },
    { value: "3", label: "April" },
    { value: "4", label: "May" },
    { value: "5", label: "June" },
    { value: "6", label: "July" },
    { value: "7", label: "August" },
    { value: "8", label: "September" },
    { value: "9", label: "October" },
    { value: "10", label: "November" },
    { value: "11", label: "December" },
  ];

  const filteredHistory = useMemo(() => {
    return snapshotHistory.filter((s) => {
      if (selectedAccount !== "all" && s.account.id !== selectedAccount)
        return false;

      if (
        selectedYear !== "all" &&
        s.statementDate.substring(0, 4) !== selectedYear
      )
        return false;
      if (
        selectedMonth !== "all" &&
        (parseInt(s.statementDate.substring(5, 7), 10) - 1).toString() !==
          selectedMonth
      )
        return false;

      if (selectedReportType !== "all" && s.reportType !== selectedReportType)
        return false;
      return true;
    });
  }, [
    snapshotHistory,
    selectedAccount,
    selectedYear,
    selectedMonth,
    selectedReportType,
  ]);

  if (!snapshotHistory || snapshotHistory.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg bg-neutral-900/20">
        No broker reports have been submitted yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg bg-card/50 border border-border">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">
            Account
          </label>
          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
            <SelectTrigger
              aria-label="Account"
              className="w-[180px] h-8 text-xs"
            >
              <SelectValue placeholder="All Accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">
            Year
          </label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger aria-label="Year" className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">
            Month
          </label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger aria-label="Month" className="w-[120px] h-8 text-xs">
              <SelectValue placeholder="All Months" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">
            Report Type
          </label>
          <Select
            value={selectedReportType}
            onValueChange={setSelectedReportType}
          >
            <SelectTrigger
              aria-label="Report Type"
              className="w-[160px] h-8 text-xs"
            >
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="Portfolio Snapshot">
                Portfolio Snapshot
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {filteredHistory.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground border border-dashed border-border rounded-lg bg-neutral-900/20">
          No reports match the selected filters.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border text-muted-foreground text-xs font-semibold">
                <th className="p-3">Account</th>
                <th className="p-3">Report Type</th>
                <th className="p-3">Statement Date</th>
                <th className="p-3">Imported Date</th>
                <th className="p-3 text-right">Total Value</th>
                <th className="p-3 text-right">Invested Value</th>
                <th className="p-3 text-right">Cash</th>
                <th className="p-3 text-right">Positions</th>
                <th className="p-3">Completeness</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredHistory.map((s) => {
                const statementDateStr = new Date(
                  s.statementDate,
                ).toLocaleDateString("en-GB", {
                  timeZone: "UTC",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });
                const importedDateStr = new Date(
                  s.importedAt,
                ).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });

                return (
                  <tr
                    key={s.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="p-3 text-foreground font-medium">
                      {s.account.name}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {s.reportType}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {statementDateStr}
                    </td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      Imported {importedDateStr}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-foreground">
                      {s.totalValue !== null && s.totalCurrency ? (
                        formatCurrency(s.totalValue, s.totalCurrency)
                      ) : (
                        <span className="text-muted-foreground font-normal">
                          Unavailable
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-foreground">
                      {s.investedValue !== null && s.investedCurrency ? (
                        formatCurrency(s.investedValue, s.investedCurrency)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-foreground">
                      {s.cashValue !== null && s.cashCurrency ? (
                        formatCurrency(s.cashValue, s.cashCurrency)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {s.positionsCount}
                    </td>
                    <td className="p-3 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 font-medium">
                        {s.completeness}
                      </span>
                    </td>
                    <td className="p-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setSelectedSnapshot(s)}
                      >
                        View Snapshot
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedSnapshot && (
        <SnapshotDetailDialog
          snapshot={selectedSnapshot}
          open={true}
          onOpenChange={(open) => {
            if (!open) setSelectedSnapshot(null);
          }}
        />
      )}
    </div>
  );
}
