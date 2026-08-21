import { metrics } from "@/modules/monitoring/metrics";
import { currentUser } from "@/modules/auth/session";
import { hasMetricsAccess } from "@/modules/monitoring/metrics-access";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await currentUser();
  const authorized = hasMetricsAccess({
    authorization: request.headers.get("authorization"),
    configuredToken: process.env.METRICS_TOKEN ?? "",
    userRole: user?.mustChangePassword ? null : user?.role ?? null
  });
  if (!authorized) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  return new Response(await metrics.metrics(), { headers: { "Content-Type": metrics.contentType } });
}
