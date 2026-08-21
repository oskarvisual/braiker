import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptSecret } from "@/lib/crypto";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWalletRole } from "@/modules/auth/session";

const bodySchema = z.object({ apiKey: z.string().min(8).max(512), apiSecret: z.string().min(8).max(512) });

export async function PUT(request: Request, context: { params: Promise<{ walletId: string }> }) {
  try {
    assertSameOrigin(request);
    const { walletId } = await context.params;
    const user = await requireWalletRole(walletId, ["ADMIN"]);
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
    const key = encryptSecret(body.data.apiKey);
    const secret = encryptSecret(body.data.apiSecret);
    await prisma.brokerConnection.upsert({
      where: { walletId_provider_mode: { walletId, provider: "alpaca", mode: "PAPER" } },
      create: { walletId, provider: "alpaca", mode: "PAPER", encryptedKey: key.ciphertext, keyIv: key.iv, keyTag: key.tag, encryptedSecret: secret.ciphertext, secretIv: secret.iv, secretTag: secret.tag, keyVersion: 1 },
      update: { encryptedKey: key.ciphertext, keyIv: key.iv, keyTag: key.tag, encryptedSecret: secret.ciphertext, secretIv: secret.iv, secretTag: secret.tag, keyVersion: 1 }
    });
    await prisma.auditLog.create({ data: { userId: user.id, walletId, action: "PAPER_BROKER_CREDENTIALS_UPDATED", target: "alpaca" } });
    return NextResponse.json({ provider: "alpaca", mode: "paper", configured: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
