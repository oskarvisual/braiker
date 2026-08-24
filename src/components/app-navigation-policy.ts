export type AppRole = "ADMIN" | "OPERATOR" | "VIEWER";

export type NavigationItem = { href: string; label: string };

const operationalItems: NavigationItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/activity", label: "History" }
];

export function sidebarNavigationItems(role: AppRole): NavigationItem[] {
  return role === "ADMIN" ? [...operationalItems, { href: "/manager", label: "Bot Manager" }, { href: "/resources", label: "Resources" }, { href: "/setup", label: "Bots" }] : operationalItems;
}

export function accountMenuItems(role: AppRole): NavigationItem[] {
  return role === "ADMIN"
    ? [{ href: "/status", label: "System status" }, { href: "/settings", label: "Settings" }, { href: "/admin/users", label: "Users" }]
    : [];
}

export function mobileNavigationItems(role: AppRole): NavigationItem[] {
  return [...sidebarNavigationItems(role), ...accountMenuItems(role), { href: "/account/password", label: "Change password" }];
}
