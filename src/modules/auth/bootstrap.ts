import bcrypt from "bcryptjs";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function bootstrapAdmin() {
  const config = env();
  const email = config.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;
  await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(config.BOOTSTRAP_ADMIN_PASSWORD, 12), role: "ADMIN", mustChangePassword: true } });
  logger.warn({ email }, "Bootstrap administrator created; change its password immediately");
}
