import { describe, expect, it } from "vitest";
import { accountMenuItems, sidebarNavigationItems } from "./app-navigation-policy";

describe("application navigation policy", () => {
  it("keeps operational navigation in the sidebar and moves admin links to the account menu", () => {
    expect(sidebarNavigationItems("ADMIN")).toEqual([
      { href: "/", label: "Dashboard" },
      { href: "/activity", label: "History" },
      { href: "/setup", label: "Bots" }
    ]);
    expect(accountMenuItems("ADMIN")).toEqual([
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
});
