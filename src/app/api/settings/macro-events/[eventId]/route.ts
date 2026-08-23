import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { requireUser } from "@/modules/auth/session";

export async function DELETE(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
    await context.params;
    return NextResponse.json({ error: "MACRO_EVENT_HISTORY_IMMUTABLE" }, { status: 405 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "MACRO_EVENT_DELETE_FAILED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 });
  }
}
