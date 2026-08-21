import { metrics } from "@/modules/monitoring/metrics";

export const dynamic = "force-dynamic";
export async function GET() { return new Response(await metrics.metrics(), { headers: { "Content-Type": metrics.contentType } }); }
