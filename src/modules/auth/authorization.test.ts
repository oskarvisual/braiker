import { describe, expect, it } from "vitest";
import { canManageUsers, canManageWallet, canModifyUser, canOperateBot, passwordPolicyError } from "@/modules/auth/authorization";

describe("authorization policy", () => {
  it("reserves user and wallet administration for administrators", () => {
    expect(canManageUsers("ADMIN")).toBe(true);
    expect(canManageUsers("OPERATOR")).toBe(false);
    expect(canManageUsers("VIEWER")).toBe(false);
    expect(canManageWallet("ADMIN")).toBe(true);
    expect(canManageWallet("OPERATOR")).toBe(false);
  });

  it("allows operators, but never viewers, to operate bots in their wallet", () => {
    expect(canOperateBot("ADMIN")).toBe(true);
    expect(canOperateBot("OPERATOR")).toBe(true);
    expect(canOperateBot("VIEWER")).toBe(false);
  });

  it("does not allow an administrator to alter or delete their own account through user management", () => {
    expect(canModifyUser("admin-id", "admin-id")).toBe(false);
    expect(canModifyUser("admin-id", "another-user")).toBe(true);
  });

  it("requires a strong replacement password", () => {
    expect(passwordPolicyError("short")).toBe("Password must have at least 12 characters");
    expect(passwordPolicyError("onlylowercasepassword")).toBe("Password must include upper-case, lower-case, and a number");
    expect(passwordPolicyError("SecurePassword1")).toBeNull();
  });
});
