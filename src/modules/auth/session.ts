import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { passwordPolicyError } from "@/modules/auth/authorization";

const COOKIE_NAME = "braiker_session";
const SESSION_DAYS = 7;

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function authenticate(email: string, password: string): Promise<{ token: string; userId: string; role: string } | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
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

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireWalletRole(walletId: string, allowed: Array<"ADMIN" | "OPERATOR" | "VIEWER">) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  const membership = await prisma.walletMember.findUnique({ where: { walletId_userId: { walletId, userId: user.id } } });
  if (!membership || !allowed.includes(membership.role)) throw new Error("FORBIDDEN");
  return user;
}
