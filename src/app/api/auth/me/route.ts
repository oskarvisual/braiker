import { NextResponse } from "next/server";
import { currentUser } from "@/modules/auth/session";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  return NextResponse.json({ id: user.id, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword });
}
