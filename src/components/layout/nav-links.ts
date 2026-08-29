import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  TrendingUp,
  Target,
  BarChart3,
  Settings,
} from "lucide-react";

export const navLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];
