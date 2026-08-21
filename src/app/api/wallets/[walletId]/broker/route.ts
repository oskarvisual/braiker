import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { requireWalletRole } from "@/modules/auth/session";

export async function PUT(request: Request, context: { params: Promise<{ walletId: string }> }) {
  try {
    assertSameOrigin(request);
    const { walletId } = await context.params;
    await requireWalletRole(walletId, ["ADMIN"]);
    return NextResponse.json({ error: "GLOBAL_PAPER_CONNECTION_FROM_ENV" }, { status: 410 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 400 }); }
}
