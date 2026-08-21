import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/modules/auth/session";
import { buildDecisionReport } from "@/modules/decisions/decision-report";
import styles from "./decision-report.module.css";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "—") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function textArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default async function DecisionReportPage({ params }: { params: Promise<{ proposalId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { proposalId } = await params;
  const proposal = await prisma.tradeProposal.findUnique({
    where: { id: proposalId },
    include: { bot: { include: { wallet: { include: { members: { where: { userId: user.id }, select: { userId: true } } } } } } }
  });
  if (!proposal || (user.role !== "ADMIN" && !proposal.bot.wallet.members.length)) notFound();
  const [signal, ai, risk, order] = await Promise.all([
    proposal.signalId ? prisma.strategySignal.findUnique({ where: { id: proposal.signalId } }) : null,
    proposal.aiDecisionId ? prisma.aiDecision.findUnique({ where: { id: proposal.aiDecisionId } }) : null,
    prisma.riskDecision.findUnique({ where: { proposalId: proposal.id } }),
    prisma.order.findFirst({ where: { proposalId: proposal.id }, include: { fills: { orderBy: { filledAt: "asc" } } } })
  ]);
  const snapshot = signal?.snapshotId ? await prisma.marketSnapshot.findUnique({ where: { id: signal.snapshotId } }) : null;
  const snapshotPayload = object(snapshot?.payload);
  const candle = object(snapshotPayload.candle);
  const indicators = object(snapshotPayload.indicators);
  const aiResponse = object(ai?.response);
  const riskChecks = Array.isArray(risk?.checks) ? risk.checks.map((check) => {
    const item = object(check);
    return { rule: text(item.rule), passed: item.passed === true, detail: text(item.detail) };
  }) : [];
  const report = buildDecisionReport({
    symbol: proposal.symbol,
    action: proposal.action,
    quantity: proposal.quantity.toString(),
    estimatedPrice: proposal.estimatedPrice.toString(),
    snapshot: snapshot ? { capturedAt: snapshot.createdAt, close: text(candle.close), feed: text(candle.feed, "unknown"), indicators } : null,
    signal: signal ? { confidence: signal.confidence, reason: signal.reason } : null,
    ai: ai ? { provider: ai.provider, model: ai.model, recommendation: typeof aiResponse.recommendation === "string" ? aiResponse.recommendation : null, rationale: typeof aiResponse.rationale === "string" ? aiResponse.rationale : null, risks: textArray(aiResponse.risks), evidence: textArray(aiResponse.evidence), inputTokens: ai.inputTokens, outputTokens: ai.outputTokens, estimatedCostUsd: ai.costUsd?.toString() ?? null, error: ai.error } : null,
    risk: risk ? { approved: risk.approved, reason: risk.reason, checks: riskChecks } : null,
    order: order ? { status: order.status, clientOrderId: order.clientOrderId, createdAt: order.createdAt } : null,
    fills: order?.fills.map((fill) => ({ quantity: fill.quantity.toString(), price: fill.price.toString(), filledAt: fill.filledAt })) ?? []
  });

  return <><AppNavigation user={{ email: user.email, role: user.role }} /><main className="shell appContent"><header><div><p className="eyebrow">DECISION REPORT · {proposal.bot.name}</p><h1>{proposal.action} {proposal.symbol}</h1><p className="pageLead">{report.summary}</p></div><Link className="secondaryButton" href="/activity">Back to History</Link></header><section className={styles.timeline}>{report.steps.map((step, index) => <article className={`${styles.step} ${styles[step.state]}`} key={step.title}><span className={styles.index}>{String(index + 1).padStart(2, "0")}</span><div><p className="eyebrow">{step.title}</p><h2>{step.state === "complete" ? "Recorded" : step.state === "blocked" ? "Blocked" : "Not available"}</h2><p>{step.detail}</p></div></article>)}</section>{Object.keys(indicators).length ? <section className="panel"><div className="panelHeading"><div><p className="eyebrow">INDICATORS</p><h2>Recorded market context</h2></div><span className="muted">Snapshot only</span></div><div className={styles.facts}>{Object.entries(indicators).map(([name, value]) => <div key={name}><small>{name}</small><strong>{text(value)}</strong></div>)}</div></section> : null}{riskChecks.length ? <section className="panel"><div className="panelHeading"><div><p className="eyebrow">RISK CHECKS</p><h2>Safety gates</h2></div></div><div className={styles.checks}>{riskChecks.map((check) => <div key={`${check.rule}-${check.detail}`}><strong className={check.passed ? styles.pass : styles.fail}>{check.passed ? "PASS" : "BLOCK"}</strong><span>{check.rule}</span><p>{check.detail}</p></div>)}</div></section> : null}</main></>;
}
