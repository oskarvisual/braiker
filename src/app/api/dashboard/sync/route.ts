import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { syncGlobalPaperAccount } from "@/modules/broker/paper-sync";
import { requireUser } from "@/modules/auth/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    return NextResponse.json(await syncGlobalPaperAccount());
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
