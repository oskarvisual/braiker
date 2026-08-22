import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/modules/auth/session";

export async function DELETE(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
    const { eventId } = await context.params;
    await prisma.macroCalendarEvent.delete({ where: { id: eventId } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "FORBIDDEN" : "MACRO_EVENT_DELETE_FAILED" }, { status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400 });
  }
}
