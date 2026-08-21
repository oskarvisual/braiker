import { NextResponse } from "next/server";
import { requireUser } from "@/modules/auth/session";
import { getDecisionReportForUser } from "@/modules/decisions/decision-report-data";

export async function GET(_: Request, context: { params: Promise<{ proposalId: string }> }) {
  try {
    const user = await requireUser();
    const { proposalId } = await context.params;
    const report = await getDecisionReportForUser(proposalId, user);
    if (!report) return NextResponse.json({ error: "DECISION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "DECISION_REPORT_UNAVAILABLE";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
