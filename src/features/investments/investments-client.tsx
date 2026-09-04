"use client";

import React, { useState, useTransition, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { updateInvestment, createInvestment, deleteInvestment } from "./actions";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Coins, TrendingUp, TrendingDown, Edit2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { InvestmentActivityTab, type InvestmentEventUI } from "./activity-tab";
import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";

interface Investment {
  id: string;
  name: string;
  type: string;
  symbol: string;
  accountId: string | null;
  accountName: string | null;
  accountType: string | null;
  quantity: number;
  costBasis: number | null;
  marketValue: number;
  profit: number | null;
  allocation: number;
}

interface InvestmentsClientProps {
  data: {
    investments: Investment[];
    events?: InvestmentEventUI[];
    accounts?: { id: string; name: string }[];
    investmentAccounts?: {
      id: string;
      name: string;
      type: string;
    }[];
  };
}

export function InvestmentsClient({ data }: InvestmentsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const investmentAccounts = data.investmentAccounts ?? [];

  const queryTab = searchParams.get("tab");
  const validTabs = ["portfolio", "activity"];
  const defaultTab = validTabs.includes(queryTab || "") ? queryTab as any : "portfolio";
  const [activeTab, setActiveTab] = useState<"portfolio" | "activity">(defaultTab);

  const handleTabChange = (val: "portfolio" | "activity") => {
    setActiveTab(val);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", val);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Dialog State
  const [isOpen, setIsOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedInv, setSelectedInv] = useState<Investment | null>(null);

  // Form State
  const [form, setForm] = useState({
    id: "",
    name: "",
    accountId: "unassigned",
    quantity: "",
    costBasis: "",
    marketValue: "",
  });

  const [addForm, setAddForm] = useState({
    name: "",
    type: "Stocks",
    symbol: "",
    accountId: "",
    quantity: "",
    costBasis: "",
    marketValue: "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEditClick = (inv: Investment) => {
    setSelectedInv(inv);
    setForm({
      id: inv.id,
      name: inv.name,
      accountId: inv.accountId ?? "unassigned",
      quantity: String(inv.quantity),
      costBasis: inv.costBasis == null ? '' : String(inv.costBasis),
      marketValue: String(inv.marketValue),
    });
    setIsOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateInvestment({
        id: form.id,
        name: form.name,
        accountId: form.accountId === "unassigned" ? null : form.accountId,
        quantity: Number(form.quantity),
        costBasis: form.costBasis === '' ? null : Number(form.costBasis),
        marketValue: Number(form.marketValue),
      });
      if (res?.data?.success) {
        setIsOpen(false);
      }
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createInvestment({
        name: addForm.name,
        type: addForm.type,
        symbol: addForm.symbol,
        accountId: addForm.accountId,
        quantity: Number(addForm.quantity),
        costBasis: addForm.costBasis === '' ? null : Number(addForm.costBasis),
        marketValue: Number(addForm.marketValue),
      });
      if (res?.data?.success) {
        setIsAddOpen(false);
        setAddForm({
          name: "",
          type: "Stocks",
          symbol: "",
          accountId: "",
          quantity: "",
          costBasis: "",
          marketValue: "",
        });
      }
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this asset?")) {
      startTransition(async () => {
        await deleteInvestment({ id });
      });
    }
  };

  const totalValue = data.investments.reduce((sum, inv) => sum + inv.marketValue, 0);
  const totalKnownCost = data.investments.reduce((sum, inv) => sum + (inv.costBasis != null ? inv.costBasis : 0), 0);
  const unknownCostCount = data.investments.filter(inv => inv.costBasis == null).length;
  const totalProfit = unknownCostCount === 0 ? totalValue - totalKnownCost : null;
  const profitPercentage = totalKnownCost > 0 && totalProfit != null ? (totalProfit / totalKnownCost) * 100 : 0;

  // Chart data
  const comparisonData = data.investments.map((inv) => ({
    name: inv.type,
    "Cost Basis": inv.costBasis,
    "Market Value": inv.marketValue,
  }));

  const pieData = data.investments.map((inv) => ({
    name: inv.type,
    value: inv.marketValue,
  }));

  const COLORS = ["#8b5cf6", "#3b82f6", "#f59e0b", "#ec4899", "#10b981"];

  if (!mounted) {
    return <div className="h-screen w-full flex items-center justify-center text-muted-foreground">Loading Investments Cockpit...</div>;
  }

  const tooltipStyle = { backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--popover-foreground))" };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex space-x-1 p-1 bg-muted rounded-lg w-max">
            <button 
              className={cn("px-4 py-2 text-sm font-medium rounded-md transition-colors", activeTab === "portfolio" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-muted-foreground/10")} 
              onClick={() => handleTabChange('portfolio')}
            >
              Portfolio
            </button>
            <button 
              className={cn("px-4 py-2 text-sm font-medium rounded-md transition-colors", activeTab === "activity" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-muted-foreground/10")} 
              onClick={() => handleTabChange('activity')}
            >
              Activity
            </button>
        </div>
        <Link href="/reports?tab=broker" className="flex items-center gap-2 text-sm text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 font-medium transition-colors">
          <FileText className="h-4 w-4" />
          Import broker report
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {activeTab === "activity" ? (
        <InvestmentActivityTab events={data.events || []} accounts={data.accounts || []} />
      ) : (
        <>
          {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border bg-card/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Portfolio Value</CardTitle>
            <Coins className="h-4.5 w-4.5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-foreground tracking-tight">{formatCurrency(totalValue)}</div>
            <p className="text-[10px] text-muted-foreground mt-1 font-semibold">Sum of all investment assets current valuation</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Cost Basis</CardTitle>
            <AlertCircle className="h-4.5 w-4.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div
                  className={cn(
                    "text-3xl font-extrabold tracking-tight",
                    unknownCostCount > 0
                      ? "text-muted-foreground"
                      : "text-card-foreground"
                  )}
                >
                  {unknownCostCount > 0
                    ? "Incomplete"
                    : formatCurrency(totalKnownCost)}
                </div>

                <p className="text-[10px] text-muted-foreground mt-1 font-semibold">
                  {unknownCostCount > 0
                    ? `${unknownCostCount} holding${unknownCostCount === 1 ? "" : "s"} with unknown cost basis`
                    : "Total capital invested across all categories"}
                </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Unrealized P&amp;L</CardTitle>
            {totalProfit == null ? (
              <AlertCircle className="h-4.5 w-4.5 text-muted-foreground" />
            ) : totalProfit >= 0 ? (
              <TrendingUp className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />
            ) : (
              <TrendingDown className="h-4.5 w-4.5 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-extrabold tracking-tight", totalProfit == null ? "text-muted-foreground" : totalProfit >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-destructive")}>
              {totalProfit == null ? 'Incomplete' : <>{totalProfit >= 0 ? "+" : ""}{formatCurrency(totalProfit)}</>}
            </div>
            <p className={cn("text-[10px] mt-1 font-bold", totalProfit == null ? "text-muted-foreground" : totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>
              {totalProfit == null ? 'Some cost bases are unknown' : <>{totalProfit >= 0 ? "+" : ""}{profitPercentage.toFixed(2)}% net returns</>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost vs Market Value Comparison */}
        <Card className="lg:col-span-2 border-border bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground">Cost Basis vs. Market Value</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Compare invested capital to current valuation per asset type</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ fontSize: "12px", color: "hsl(var(--foreground))" }}
                />
                <Legend wrapperStyle={{ fontSize: "10px", color: "hsl(var(--foreground))" }} />
                <Bar dataKey="Cost Basis" name="Cost Basis" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Market Value" name="Market Value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Investment Allocation */}
        <Card className="border-border bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground">Portfolio Weight Allocation</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Percentage share of total portfolio value</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ fontSize: "12px", color: "hsl(var(--foreground))" }}
                />
                <Legend wrapperStyle={{ fontSize: "9px", color: "hsl(var(--foreground))" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Asset Breakdown Table */}
      <Card className="border-border bg-card/50 shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-card-foreground">Asset breakdown ledger</CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1">Individual asset valuations and performance records</CardDescription>
          </div>
          <Button size="sm" className="flex items-center gap-2" onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Asset
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm text-card-foreground">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground font-semibold">
                  <th className="p-4">Asset Type</th>
                  <th className="p-4">Name</th>
                  <th className="p-4">Account</th>
                  <th className="p-4">Symbol</th>
                  <th className="p-4 text-right">Quantity</th>
                  <th className="p-4 text-right">Cost Basis</th>
                  <th className="p-4 text-right">Market Value</th>
                  <th className="p-4 text-right">Unrealized P&L</th>
                  <th className="p-4 text-right">Allocation</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.investments.map((inv) => {
                  return (
                    <tr key={inv.id} className="hover:bg-accent/40 transition-colors">
                      <td className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">{inv.type}</td>
                      <td className="p-4 font-semibold text-foreground">{inv.name}</td>
                      <td className="p-4 text-xs">
                        {inv.accountName ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-foreground">
                              {inv.accountName}
                            </span>

                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {inv.accountType}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">{inv.symbol}</td>
                      <td className="p-4 text-right font-mono text-xs">{inv.quantity.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono">{inv.costBasis != null ? formatCurrency(inv.costBasis) : '-'}</td>
                      <td className="p-4 text-right font-mono font-bold text-foreground">{formatCurrency(inv.marketValue)}</td>
                      <td
                          className={cn(
                            "p-4 text-right font-mono font-bold",
                            inv.profit == null
                              ? "text-muted-foreground"
                              : inv.profit >= 0
                                ? "text-emerald-500 dark:text-emerald-400"
                                : "text-destructive"
                          )}
                        >
                          {inv.profit != null && inv.profit >= 0 ? "+" : ""}
                          {inv.profit != null ? formatCurrency(inv.profit) : "-"}
                      </td>
                      <td className="p-4 text-right font-mono text-xs font-semibold text-primary">
                        {formatPercentage(inv.allocation)}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleEditClick(inv)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(inv.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Value Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="border-border bg-background">
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>Update Investment Valuation</DialogTitle>
              <DialogDescription>Modify parameters and pricing metrics for {selectedInv?.name}.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">Asset Name</label>
                <Input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                  Account
                </label>

                <Select
                  value={form.accountId}
                  onValueChange={(value) =>
                    setForm({ ...form, accountId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>

                  <SelectContent>
                    {selectedInv?.accountId == null && (
                      <SelectItem value="unassigned">
                        Unassigned (legacy)
                      </SelectItem>
                    )}

                    {investmentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedInv?.accountId == null &&
                  form.accountId === "unassigned" && (
                    <p className="text-[10px] text-muted-foreground">
                      This is a legacy holding. Assign it to a Broker or Crypto Wallet when known.
                    </p>
                  )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Quantity</label>
                  <Input
                    type="number"
                    step="any"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Cost Basis (€)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.costBasis}
                    onChange={(e) => setForm({ ...form, costBasis: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Market Value (€)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.marketValue}
                    onChange={(e) => setForm({ ...form, marketValue: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">Cancel</Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Saving..." : "Update"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Asset Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="border-border bg-background">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Add New Investment Asset</DialogTitle>
              <DialogDescription>Input parameters and pricing metrics for your new holding.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase">
                  Account
                </label>

                <Select
                  value={addForm.accountId}
                  onValueChange={(value) =>
                    setAddForm({ ...addForm, accountId: value })
                  }
                >
                  <SelectTrigger>
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

                {investmentAccounts.length === 0 && (
                  <p className="text-[10px] text-destructive">
                    Create a Broker or Crypto Wallet account before adding an investment.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Asset Name</label>
                  <Input
                    type="text"
                    value={addForm.name}
                    onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Asset Type</label>
                  <Select value={addForm.type} onValueChange={(val) => setAddForm({ ...addForm, type: val })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Stocks">Stocks</SelectItem>
                      <SelectItem value="Bitcoin">Bitcoin</SelectItem>
                      <SelectItem value="Ethereum">Ethereum</SelectItem>
                      <SelectItem value="Other Crypto">Other Crypto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Symbol (Optional)</label>
                  <Input
                    type="text"
                    value={addForm.symbol}
                    onChange={(e) => setAddForm({ ...addForm, symbol: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Quantity</label>
                  <Input
                    type="number"
                    step="any"
                    value={addForm.quantity}
                    onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Cost Basis (€)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={addForm.costBasis}
                    onChange={(e) => setAddForm({ ...addForm, costBasis: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase">Market Value (€)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={addForm.marketValue}
                    onChange={(e) => setAddForm({ ...addForm, marketValue: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm">Cancel</Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isPending || !addForm.accountId}>
                {isPending ? "Adding..." : "Add Asset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
