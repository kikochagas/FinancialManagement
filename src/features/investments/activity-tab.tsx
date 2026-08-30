"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getFriendlyActivityLabel } from "@/features/reports/broker-import/ux-helpers";
import { formatCurrency } from "@/lib/utils";
import { Search } from "lucide-react";
import Link from "next/link";

export interface InvestmentEventUI {
  id: string;
  accountId: string;
  accountName: string;
  occurredAt: string;
  eventType: string;
  instrumentName: string | null;
  isin: string | null;
  ticker: string | null;
  instrumentIdentifier: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  fee: number | null;
  tax: number | null;
  currency: string | null;
  description: string | null;
  rawEventType: string | null;
  rawCategory: string | null;
}

interface ActivityTabProps {
  events: InvestmentEventUI[];
  accounts: { id: string; name: string }[];
}

export function InvestmentActivityTab({ events, accounts }: ActivityTabProps) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filtered = useMemo(() => {
    return events.filter((ev) => {
      if (accountFilter !== "all" && ev.accountId !== accountFilter) return false;
      if (activityFilter !== "all" && ev.eventType !== activityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches = [
          ev.instrumentName,
          ev.ticker,
          ev.isin,
          ev.instrumentIdentifier,
          ev.description,
        ].some(val => val && val.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [events, search, accountFilter, activityFilter]);

  const pageCount = Math.ceil(filtered.length / itemsPerPage) || 1;
  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [pageCount, currentPage]);

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalActivities = events.length;

  if (totalActivities === 0) {
    return (
      <Card className="border-border bg-card/50 shadow-sm text-center py-12">
        <CardContent className="flex flex-col items-center justify-center space-y-4">
          <div className="rounded-full bg-muted p-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg">No investment activity yet</CardTitle>
          <CardDescription>
            Import a broker transaction statement from Reports to build your investment history.
          </CardDescription>
          <Button asChild className="mt-4">
            <Link href="/reports">Import Broker Activity</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card/50 shadow-sm overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-card-foreground">Investment Activity</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          View the historical investment activity imported from your brokers and other investment sources.<br/>
          Activity history is separate from your current portfolio valuation.
        </CardDescription>
      </CardHeader>
      
      <div className="p-4 border-b border-border space-y-4 bg-muted/20">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search instruments..."
              className="pl-9 h-9 text-sm"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Select value={accountFilter} onValueChange={(val) => { setAccountFilter(val); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map(acc => (
                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activityFilter} onValueChange={(val) => { setActivityFilter(val); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="All activities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activities</SelectItem>
              <SelectItem value="BUY">Buy</SelectItem>
              <SelectItem value="SELL">Sell</SelectItem>
              <SelectItem value="DIVIDEND">Dividend</SelectItem>
              <SelectItem value="INTEREST">Interest</SelectItem>
              <SelectItem value="CASH_DEPOSIT">Cash deposit</SelectItem>
              <SelectItem value="CASH_WITHDRAWAL">Cash withdrawal</SelectItem>
              <SelectItem value="ASSET_TRANSFER_IN">Asset received</SelectItem>
              <SelectItem value="ASSET_TRANSFER_OUT">Asset transferred out</SelectItem>
              <SelectItem value="FEE">Fee</SelectItem>
              <SelectItem value="TAX">Tax</SelectItem>
              <SelectItem value="CORPORATE_ACTION">Corporate action</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm text-card-foreground">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">
                <th className="p-3">Date</th>
                <th className="p-3">Activity</th>
                <th className="p-3">Investment</th>
                <th className="p-3">Account</th>
                <th className="p-3 text-right">Quantity</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((ev) => {
                const dateStr = new Date(ev.occurredAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric'
                });
                const label = getFriendlyActivityLabel(ev.eventType, ev.rawEventType);
                const instrument = ev.instrumentName || ev.isin || ev.ticker || ev.instrumentIdentifier || "—";
                
                return (
                  <tr key={ev.id} className="hover:bg-accent/40 transition-colors">
                    <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">{dateStr}</td>
                    <td className="p-3 font-medium">
                      <span className="bg-muted px-2 py-1 rounded-md text-xs">{label}</span>
                    </td>
                    <td className="p-3 text-xs max-w-[200px] truncate" title={instrument}>
                      {instrument}
                      {ev.description && <div className="text-[10px] text-muted-foreground truncate" title={ev.description}>{ev.description}</div>}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{ev.accountName}</td>
                    <td className="p-3 text-right font-mono text-xs">
                      {ev.quantity != null ? ev.quantity : "—"}
                    </td>
                    <td className="p-3 text-right font-mono text-xs font-semibold">
                      {ev.amount != null ? (
                        <span className={ev.amount < 0 ? "text-destructive" : (ev.amount > 0 ? "text-emerald-500" : "")}>
                          {ev.amount > 0 ? "+" : ""}{formatCurrency(ev.amount, ev.currency || "EUR")}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">No activities found matching your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between bg-muted/10 text-xs text-muted-foreground">
          <div>
            Showing {filtered.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} activities
          </div>
          <div className="flex items-center gap-4">
            <span>Page {currentPage} of {pageCount}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>Previous</Button>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setCurrentPage(prev => Math.min(pageCount, prev + 1))} disabled={currentPage === pageCount}>Next</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
