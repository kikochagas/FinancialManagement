"use client";

import { usePathname } from "next/navigation";
import { format } from "date-fns";
import { Bell, TrendingUp, Calendar, Menu } from "lucide-react";

export function Header({ netWorth = 0 }: { netWorth?: number }) {
  const pathname = usePathname();

  const getPageTitle = () => {
    switch (pathname) {
      case "/":
        return "Wealth Cockpit";
      case "/transactions":
        return "Transactions Ledger";
      case "/accounts":
        return "Accounts & Balances";
      case "/investments":
        return "Investment Portfolios";
      case "/goals":
        return "Financial Aspirations";
      case "/reports":
        return "Intelligence & Analytics";
      case "/settings":
        return "System Preferences";
      default:
        return "Financial Management";
    }
  };

  return (
    <header className="h-16 border-b border-border bg-card/25 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        {/* Mobile menu trigger */}
        <button className="md:hidden text-muted-foreground hover:text-foreground">
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{getPageTitle()}</h1>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Calendar / Date */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          <span>{format(new Date(), "EEEE, d MMMM yyyy")}</span>
        </div>

        {/* Global Net Worth Stat Badge */}
        <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold shadow-none dark:shadow-glow-green">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>Net Worth: {new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(netWorth)}</span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-3">
          <button className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors">
            <Bell className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
