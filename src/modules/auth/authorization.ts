import type { UserRole } from "@prisma/client";

export function canManageUsers(role: UserRole) {
  return role === "ADMIN";
}

export function canManageWallet(role: UserRole) {
  return role === "ADMIN";
}

export function canOperateBot(role: UserRole) {
  return role === "ADMIN" || role === "OPERATOR";
}

export function canModifyUser(actorId: string, targetUserId: string) {
  return actorId !== targetUserId;
}

export function passwordPolicyError(password: string) {
  if (password.length < 12) return "Password must have at least 12 characters";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include upper-case, lower-case, and a number";
  }
  return null;
}
