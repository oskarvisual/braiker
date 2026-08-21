import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, setSessionCookie } from "@/modules/auth/session";

const bodySchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid credentials format" }, { status: 400 });
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp = request.headers.get("x-real-ip") ?? forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  const session = await authenticate(body.data.email, body.data.password, clientIp);
  if (session && "blocked" in session) return NextResponse.json({ error: "Too many sign-in attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(15 * 60) } });
  if (!session) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  await setSessionCookie(session.token);
  return NextResponse.json({ userId: session.userId, role: session.role });
}
