import type { UserRole } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";

export function hasMetricsAccess(input: { authorization: string | null; configuredToken: string; userRole: UserRole | null }) {
  if (input.userRole === "ADMIN") return true;
  const token = input.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || !input.configuredToken) return false;
  const candidate = Buffer.from(token);
  const expected = Buffer.from(input.configuredToken);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
