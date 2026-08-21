import { describe, expect, it } from "vitest";
import { temporaryPasswordAccessError } from "@/modules/auth/session-policy";

describe("temporary-password access policy", () => {
  it("blocks privileged access until a temporary password is changed", () => {
    expect(temporaryPasswordAccessError({ mustChangePassword: true })).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("allows a user whose password has been changed", () => {
    expect(temporaryPasswordAccessError({ mustChangePassword: false })).toBeNull();
  });
});
