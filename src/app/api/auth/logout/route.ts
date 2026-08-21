import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/http";
import { revokeSessionFromCookie } from "@/modules/auth/session";

export async function POST(request: Request) {
  assertSameOrigin(request);
  await revokeSessionFromCookie();
  return new NextResponse(null, { status: 204 });
}
