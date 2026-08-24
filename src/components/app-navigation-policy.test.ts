import { describe, expect, it } from "vitest";
import { accountMenuItems, mobileNavigationItems, sidebarNavigationItems } from "./app-navigation-policy";

describe("application navigation policy", () => {
  it("keeps the admin-only Bot Manager in the sidebar and moves account administration to the account menu", () => {
    expect(sidebarNavigationItems("ADMIN")).toEqual([
      { href: "/", label: "Dashboard" },
      { href: "/activity", label: "History" },
      { href: "/manager", label: "Bot Manager" },
      { href: "/resources", label: "Resources" },
      { href: "/setup", label: "Bots" }
    ]);
    expect(accountMenuItems("ADMIN")).toEqual([
      { href: "/status", label: "System status" },
      { href: "/settings", label: "Settings" },
      { href: "/admin/users", label: "Users" }
    ]);
  });

  it("does not expose admin links to operator or viewer accounts", () => {
    expect(sidebarNavigationItems("OPERATOR")).toEqual([
      { href: "/", label: "Dashboard" },
      { href: "/activity", label: "History" }
    ]);
    expect(accountMenuItems("VIEWER")).toEqual([]);
  });

  it("combines operational and account destinations in the one mobile menu", () => {
    expect(mobileNavigationItems("ADMIN")).toEqual([
      ...sidebarNavigationItems("ADMIN"),
      ...accountMenuItems("ADMIN"),
      { href: "/account/password", label: "Change password" }
    ]);
  });
});
