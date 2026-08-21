import { NextResponse } from "next/server";
import { getSystemStatus } from "@/modules/monitoring/system-status";
import { toPublicSystemStatus } from "@/modules/monitoring/public-system-status";

export const dynamic = "force-dynamic";

/**
 * Public, secret-free health payload for uptime monitoring and automations.
 * It intentionally exposes the same aggregate checks as the authenticated /status page.
 */
export async function GET() {
  const status = toPublicSystemStatus(await getSystemStatus());
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
