export type AppRole = "ADMIN" | "OPERATOR" | "VIEWER";

export type NavigationItem = { href: string; label: string };

const operationalItems: NavigationItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/activity", label: "History" }
];

export function sidebarNavigationItems(role: AppRole): NavigationItem[] {
  return role === "ADMIN" ? [...operationalItems, { href: "/setup", label: "Bots" }] : operationalItems;
}

export function accountMenuItems(role: AppRole): NavigationItem[] {
  return role === "ADMIN"
    ? [{ href: "/settings", label: "Settings" }, { href: "/admin/users", label: "Users" }]
    : [];
}
