"use client";

import React, { useState, useTransition, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { updateInvestment, createInvestment, deleteInvestment } from "./actions";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Coins, TrendingUp, TrendingDown, Edit2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

interface Investment {
  id: string;
  name: string;
  type: string;
  symbol: string;
  quantity: number;
  costBasis: number;
  marketValue: number;
  profit: number;
  allocation: number;
}

interface InvestmentsClientProps {
  data: {
    investments: Investment[];
  };
}

export function InvestmentsClient({ data }: InvestmentsClientProps) {
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  // Dialog State
  const [isOpen, setIsOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedInv, setSelectedInv] = useState<Investment | null>(null);

  // Form State
  const [form, setForm] = useState({
    id: "",
    name: "",
    quantity: "",
    costBasis: "",
    marketValue: "",
  });

  const [addForm, setAddForm] = useState({
    name: "",
    type: "Stocks",
    symbol: "",
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
      quantity: String(inv.quantity),
      costBasis: String(inv.costBasis),
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
        quantity: Number(form.quantity),
        costBasis: Number(form.costBasis),
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
        quantity: Number(addForm.quantity),
        costBasis: Number(addForm.costBasis),
        marketValue: Number(addForm.marketValue),
      });
      if (res?.data?.success) {
        setIsAddOpen(false);
        setAddForm({
          name: "",
          type: "Stocks",
          symbol: "",
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
  const totalCost = data.investments.reduce((sum, inv) => sum + inv.costBasis, 0);
  const totalProfit = totalValue - totalCost;
  const profitPercentage = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

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
            <div className="text-3xl font-extrabold text-card-foreground tracking-tight">{formatCurrency(totalCost)}</div>
            <p className="text-[10px] text-muted-foreground mt-1 font-semibold">Total capital invested across all categories</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Unrealized P&L</CardTitle>
            {totalProfit >= 0 ? (
              <TrendingUp className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />
            ) : (
              <TrendingDown className="h-4.5 w-4.5 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn("text-3xl font-extrabold tracking-tight", totalProfit >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-destructive")}>
              {totalProfit >= 0 ? "+" : ""}
              {formatCurrency(totalProfit)}
            </div>
            <p className={cn("text-[10px] mt-1 font-bold", totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>
              {totalProfit >= 0 ? "+" : ""}
              {profitPercentage.toFixed(2)}% net returns
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
                  const isProfit = inv.profit >= 0;
                  return (
                    <tr key={inv.id} className="hover:bg-accent/40 transition-colors">
                      <td className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">{inv.type}</td>
                      <td className="p-4 font-semibold text-foreground">{inv.name}</td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">{inv.symbol}</td>
                      <td className="p-4 text-right font-mono text-xs">{inv.quantity.toLocaleString()}</td>
                      <td className="p-4 text-right font-mono">{formatCurrency(inv.costBasis)}</td>
                      <td className="p-4 text-right font-mono font-bold text-foreground">{formatCurrency(inv.marketValue)}</td>
                      <td className={cn("p-4 text-right font-mono font-bold", isProfit ? "text-emerald-500 dark:text-emerald-400" : "text-destructive")}>
                        {isProfit ? "+" : ""}
                        {formatCurrency(inv.profit)}
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
                    required
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
                      <SelectItem value="Trade Republic Cash">Trade Republic Cash</SelectItem>
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
                    required
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
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? "Adding..." : "Add Asset"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
