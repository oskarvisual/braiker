import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";
import { createTelegramPairingCode, hashTelegramPairingCode, pairingExpiresAt } from "@/modules/telegram/bot-manager";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    if (!env().TELEGRAM_BOT_TOKEN) return NextResponse.json({ error: "TELEGRAM_NOT_CONFIGURED" }, { status: 400 });

    const code = createTelegramPairingCode();
    const expiresAt = pairingExpiresAt();
    const pairing = await prisma.$transaction(async (tx) => {
      await tx.telegramPairingCode.deleteMany({ where: { userId: user.id, consumedAt: null } });
      return tx.telegramPairingCode.create({ data: { codeHash: hashTelegramPairingCode(code), userId: user.id, expiresAt } });
    });
    await prisma.auditLog.create({ data: { userId: user.id, action: "TELEGRAM_MANAGER_PAIRING_CREATED", target: pairing.id, metadata: { expiresAt: expiresAt.toISOString() } } });
    return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TELEGRAM_PAIRING_FAILED";
    const safeError = message === "UNAUTHENTICATED" || message === "FORBIDDEN" || message === "TELEGRAM_NOT_CONFIGURED" ? message : "TELEGRAM_PAIRING_FAILED";
    return NextResponse.json({ error: safeError }, { status: safeError === "FORBIDDEN" ? 403 : safeError === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
