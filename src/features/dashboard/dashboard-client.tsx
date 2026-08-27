"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import {
  TrendingUp,
  Coins,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Calculator,
  Shield,
  Home,
  Wallet,
  Activity
} from "lucide-react";
import { formatCurrency, formatPercentage, cn } from "@/lib/utils";

interface DashboardClientProps {
  data: {
    metrics: {
      netWorth: number;
      liquidAssets: number;
      investmentsValue: number;
      monthlyIncome: number;
      monthlyExpenses: number;
      savingsRate: number;
      monthName: string;
    };
    dynamicCards: Array<{
      title: string;
      value: number;
      description: string;
      type: string;
    }>;
    recentTransactions: Array<{
      id: string;
      date: string;
      description: string;
      direction: string;
      amount: number;
      category: string;
      color: string;
      account: string;
    }>;
    netWorthEvolution: Array<{
      name: string;
      netWorth: number;
      liquidAssets: number;
      investmentsValue: number;
    }>;
    cashFlow: Array<{
      month: string;
      Income: number;
      Expenses: number;
    }>;
    expensesByCategory: Array<{
      name: string;
      value: number;
      color: string;
    }>;
    incomeBySource: Array<{
      name: string;
      value: number;
      color: string;
    }>;
    assetAllocation: Array<{
      name: string;
      value: number;
    }>;
  };
}

export function DashboardClient({ data }: DashboardClientProps) {
  // Prevent SSR hydration mismatch for recharts
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isNetWorthEmpty = data.netWorthEvolution.every(s => s.netWorth === 0 && s.liquidAssets === 0 && s.investmentsValue === 0);
  const isCashFlowEmpty = data.cashFlow.every(c => c.Income === 0 && c.Expenses === 0);

  const cards = [
    {
      title: "Net Worth",
      value: data.metrics.netWorth,
      description: "Total net value of all assets",
      icon: TrendingUp,
      color: "text-violet-400",
      glow: "hover:shadow-glow"
    },
    {
      title: "Liquid Assets",
      value: data.metrics.liquidAssets,
      description: "Bank + Cash + TR Cash",
      icon: Coins,
      color: "text-emerald-400",
      glow: "hover:shadow-glow-green"
    },
    {
      title: "Investments Portfolio",
      value: data.metrics.investmentsValue,
      description: "Broker stocks + Crypto",
      icon: Activity,
      color: "text-blue-400",
      glow: "hover:shadow-glow"
    },
    {
      title: `Monthly Income (${data.metrics.monthName})`,
      value: data.metrics.monthlyIncome,
      description: "Incoming earnings",
      icon: ArrowUpRight,
      color: "text-emerald-400",
      glow: ""
    },
    {
      title: `Monthly Expenses (${data.metrics.monthName})`,
      value: data.metrics.monthlyExpenses,
      description: "Fixed & variable expenses",
      icon: ArrowDownRight,
      color: "text-rose-400",
      glow: ""
    },
    {
      title: `Savings Rate (${data.metrics.monthName})`,
      value: data.metrics.savingsRate,
      description: "Surplus percentage",
      icon: Percent,
      color: "text-amber-400",
      glow: "",
      isPercent: true
    }
  ];

  const dynamicIconMap: Record<string, any> = {
    tax: Calculator,
    goal: Home, // We could refine this if we had goal types
    account: Wallet,
  };

  const dynamicCards = data.dynamicCards.map(c => ({
    title: c.title,
    value: c.value,
    description: c.description,
    icon: dynamicIconMap[c.type] || Activity,
    color: c.type === "tax" ? "text-neutral-400" : c.type === "goal" ? "text-cyan-400" : "text-violet-400",
    glow: "",
    isPercent: false
  }));

  const allCards = [...cards, ...dynamicCards];

  if (!mounted) {
    return <div className="h-screen w-full flex items-center justify-center text-muted-foreground">Loading Dashboard Cockpit...</div>;
  }

  const tooltipStyle = { backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "8px", color: "hsl(var(--popover-foreground))" };
  const labelStyle = { color: "hsl(var(--muted-foreground))", fontSize: "12px", fontWeight: "bold" };

  return (
    <div className="space-y-8 pb-10">
      {/* Upper Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {allCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className={cn("bg-card/50 backdrop-blur-md border border-border hover:bg-accent/40 duration-200 shadow-sm", card.glow)}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{card.title}</CardTitle>
                <Icon className={cn("h-4.5 w-4.5", card.color)} />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-foreground tracking-tight">
                  {card.isPercent ? formatPercentage(card.value) : formatCurrency(card.value)}
                </div>
                <CardDescription className="text-[10px] mt-1 text-muted-foreground font-medium">
                  {card.description}
                </CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Net Worth Evolution */}
        <Card className="lg:col-span-2 border-border bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground">Net Worth Evolution</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Cumulative value of liquid assets and investments</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {isNetWorthEmpty ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.netWorthEvolution} margin={{ left: -10, right: 10, top: 10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="netWorthGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgb(139, 92, 246)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="rgb(139, 92, 246)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={labelStyle}
                    itemStyle={{ fontSize: "12px", color: "hsl(var(--foreground))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px", color: "hsl(var(--foreground))" }} />
                  <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#netWorthGlow)" />
                  <Area type="monotone" dataKey="liquidAssets" name="Liquid Assets" stroke="#10b981" strokeWidth={1.5} fillOpacity={0} />
                  <Area type="monotone" dataKey="investmentsValue" name="Investments" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Expenses by Category */}
        <Card className="border-border bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground">Expenses by Category</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Distribution of expenditures ({data.metrics.monthName} benchmark)</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] flex items-center justify-center">
            {data.expensesByCategory.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.expensesByCategory}
                    cx="50%"
                    cy="55%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {data.expensesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ fontSize: "12px", color: "hsl(var(--foreground))" }}
                  />
                  <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: "9px", color: "hsl(var(--foreground))" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second Row of Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Flow */}
        <Card className="border-border bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground">Monthly Cash Flow</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Income versus total expenses</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            {isCashFlowEmpty ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.cashFlow} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ fontSize: "12px", color: "hsl(var(--foreground))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px", color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="Income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Asset Allocation */}
        <Card className="border-border bg-card/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground">Asset Allocation</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Distribution of all wealth components</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px] flex items-center justify-center">
            {data.assetAllocation.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.assetAllocation}
                    cx="50%"
                    cy="50%"
                    innerRadius={0}
                    outerRadius={75}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {data.assetAllocation.map((entry, index) => {
                      const colors = ["#8b5cf6", "#3b82f6", "#f59e0b", "#ec4899", "#10b981"];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ fontSize: "12px", color: "hsl(var(--foreground))" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions List */}
        <Card className="border-border bg-card/50 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-card-foreground">Recent Transactions</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">Latest registry updates</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-4 max-h-[260px] pr-2">
            {data.recentTransactions.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground pb-4 pt-8">No data</div>
            ) : (
              data.recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">{tx.description}</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">{tx.account}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={cn("text-xs font-bold", tx.direction === "Credit" ? "text-emerald-500 dark:text-emerald-400" : tx.direction === "InternalTransfer" ? "text-blue-500 dark:text-blue-400" : "text-foreground")}>
                      {tx.direction === "Credit" ? "+" : tx.direction === "InternalTransfer" ? "⇄ " : "-"}
                      {formatCurrency(tx.amount)}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full mt-1 border"
                      style={{ borderColor: tx.color + "33", color: tx.color, backgroundColor: tx.color + "11" }}
                    >
                      {tx.category}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
