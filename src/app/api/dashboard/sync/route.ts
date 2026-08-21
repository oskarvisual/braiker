import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { syncPaperWallet } from "@/modules/broker/paper-sync";
import { requireWalletRole } from "@/modules/auth/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const walletId = new URL(request.url).searchParams.get("walletId");
    if (!walletId) return NextResponse.json({ error: "WALLET_ID_REQUIRED" }, { status: 400 });
    await requireWalletRole(walletId, ["ADMIN"]);
    return NextResponse.json(await syncPaperWallet(walletId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
