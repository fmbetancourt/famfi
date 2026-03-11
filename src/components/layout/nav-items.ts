import {
  LayoutDashboard,
  Receipt,
  PieChart,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Gastos", href: "/transactions", icon: Receipt },
  { label: "Presupuesto", href: "/budget", icon: PieChart },
  { label: "Deuda", href: "/debt", icon: CreditCard },
];
