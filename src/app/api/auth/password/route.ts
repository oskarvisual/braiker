import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/http";
import { changePassword, requireUser, setSessionCookie } from "@/modules/auth/session";
import { authenticate } from "@/modules/auth/session";

const bodySchema = z.object({ currentPassword: z.string().min(1), nextPassword: z.string().min(1) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = bodySchema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "Invalid password format" }, { status: 400 });
    const user = await requireUser({ allowTemporaryPassword: true });
    await changePassword({ userId: user.id, currentPassword: body.data.currentPassword, nextPassword: body.data.nextPassword });
    const replacementSession = await authenticate(user.email, body.data.nextPassword, "password-change", { throttle: false });
    if (!replacementSession || "blocked" in replacementSession) throw new Error("SESSION_REPLACEMENT_FAILED");
    await setSessionCookie(replacementSession.token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
