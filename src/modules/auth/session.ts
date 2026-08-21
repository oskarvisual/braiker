import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { passwordPolicyError } from "@/modules/auth/authorization";
import { nextLoginThrottle } from "@/modules/auth/login-throttle";
import { temporaryPasswordAccessError } from "@/modules/auth/session-policy";

const COOKIE_NAME = "braiker_session";
const SESSION_DAYS = 7;

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

const loginThrottleHash = (kind: "email" | "ip", value: string) => createHash("sha256").update(`${kind}:${value.trim().toLowerCase()}`).digest("hex");
const LOGIN_IDENTITY_LIMIT = 5;
const LOGIN_IP_LIMIT = 20;

type AuthenticationSuccess = { token: string; userId: string; role: string };
type AuthenticationBlocked = { blocked: true };

async function isLoginBlocked(keys: string[], now: Date) {
  const throttles = await prisma.loginThrottle.findMany({ where: { keyHash: { in: keys }, blockedUntil: { gt: now } }, select: { keyHash: true } });
  return throttles.length > 0;
}

async function recordLoginOutcome(keys: Array<{ key: string; limit: number }>, succeeded: boolean, now: Date) {
  await prisma.$transaction(async (tx) => {
    for (const item of [...keys].sort((left, right) => left.key.localeCompare(right.key))) {
      await tx.$queryRaw`SELECT \`keyHash\` FROM \`LoginThrottle\` WHERE \`keyHash\` = ${item.key} FOR UPDATE`;
      const current = await tx.loginThrottle.findUnique({ where: { keyHash: item.key } });
      const next = nextLoginThrottle(
        current ?? { failures: 0, windowStartedAt: now, blockedUntil: null },
        succeeded,
        now,
        item.limit
      );
      await tx.loginThrottle.upsert({
        where: { keyHash: item.key },
        create: { keyHash: item.key, failures: next.failures, windowStartedAt: next.windowStartedAt, blockedUntil: next.blockedUntil },
        update: { failures: next.failures, windowStartedAt: next.windowStartedAt, blockedUntil: next.blockedUntil }
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function authenticate(email: string, password: string, clientIp = "unknown", options: { throttle?: boolean } = {}): Promise<AuthenticationSuccess | AuthenticationBlocked | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const throttleKeys = [{ key: loginThrottleHash("email", normalizedEmail), limit: LOGIN_IDENTITY_LIMIT }, { key: loginThrottleHash("ip", clientIp), limit: LOGIN_IP_LIMIT }];
  const now = new Date();
  if (options.throttle !== false && await isLoginBlocked(throttleKeys.map((item) => item.key), now)) return { blocked: true };
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const succeeded = Boolean(user && await bcrypt.compare(password, user.passwordHash));
  if (options.throttle !== false) await recordLoginOutcome(throttleKeys, succeeded, now);
  if (!user || !succeeded) return null;
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } });
  return { token, userId: user.id, role: user.role };
}

export async function changePassword(input: { userId: string; currentPassword: string; nextPassword: string }) {
  const error = passwordPolicyError(input.nextPassword);
  if (error) throw new Error(error);
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) throw new Error("INVALID_CURRENT_PASSWORD");
  await prisma.$transaction([
    prisma.user.update({ where: { id: input.userId }, data: { passwordHash: await bcrypt.hash(input.nextPassword, 12), mustChangePassword: false } }),
    prisma.session.deleteMany({ where: { userId: input.userId } })
  ]);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86_400 });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function revokeSessionFromCookie() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  await clearSessionCookie();
}

export async function requireUser(options: { allowTemporaryPassword?: boolean } = {}) {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!options.allowTemporaryPassword) {
    const error = temporaryPasswordAccessError(user);
    if (error) throw new Error(error);
  }
  return user;
}

export async function requireWalletRole(walletId: string, allowed: Array<"ADMIN" | "OPERATOR" | "VIEWER">) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  const membership = await prisma.walletMember.findUnique({ where: { walletId_userId: { walletId, userId: user.id } } });
  if (!membership || !allowed.includes(membership.role)) throw new Error("FORBIDDEN");
  return user;
}
