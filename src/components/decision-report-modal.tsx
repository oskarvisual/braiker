"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";

type DecisionReport = {
  botName: string;
  action: string;
  symbol: string;
  summary: string;
  steps: Array<{ title: string; state: "complete" | "blocked" | "pending"; detail: string }>;
  indicators: Array<{ name: string; value: string }>;
  riskChecks: Array<{ rule: string; passed: boolean; detail: string }>;
};

/** Shared immutable explanation of why an order was, or was not, sent. */
export function DecisionReportModal({ proposalId, onClose }: { proposalId: string; onClose: () => void }) {
  const [report, setReport] = useState<DecisionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { pushToast } = useToast();

  useEffect(() => {
    let active = true;
    setReport(null);
    setLoading(true);
    setFailed(false);
    void fetch(`/api/decisions/${proposalId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "DECISION_REPORT_UNAVAILABLE");
        if (active) setReport(body);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          pushToast({ tone: "error", title: "Decision report could not be loaded", message: "Please try again." });
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [proposalId, pushToast]);

  return <div className="modalOverlay" role="presentation"><section className="modalCard decisionReportModal" role="dialog" aria-modal="true" aria-labelledby="decision-report-modal-title"><div className="modalHeading"><div><p className="eyebrow">DECISION REPORT{report ? ` · ${report.botName}` : ""}</p><h2 id="decision-report-modal-title">{report ? `${report.action} ${report.symbol}` : "Decision report"}</h2></div><button type="button" className="iconButton" onClick={onClose} aria-label="Close">×</button></div>{loading ? <p className="muted modalLoading">Loading the decision path…</p> : failed ? <p className="muted modalLoading">This decision report is unavailable right now.</p> : report && <><p className="pageLead decisionSummary">{report.summary}</p><section className="decisionTimeline">{report.steps.map((step, index) => <article className={`decisionStep ${step.state}`} key={step.title}><span className="decisionStepIndex">{String(index + 1).padStart(2, "0")}</span><div><p className="eyebrow">{step.title}</p><h3>{step.state === "complete" ? "Recorded" : step.state === "blocked" ? "Blocked" : "Not available"}</h3><p>{step.detail}</p></div></article>)}</section>{report.indicators.length ? <section className="decisionSection"><div className="panelHeading"><div><p className="eyebrow">INDICATORS</p><h3>Recorded market context</h3></div><span className="muted">Snapshot only</span></div><div className="decisionFacts">{report.indicators.map((indicator) => <div key={indicator.name}><small>{indicator.name}</small><strong>{indicator.value}</strong></div>)}</div></section> : null}{report.riskChecks.length ? <section className="decisionSection"><div className="panelHeading"><div><p className="eyebrow">RISK CHECKS</p><h3>Safety gates</h3></div></div><div className="decisionChecks">{report.riskChecks.map((check) => <div key={`${check.rule}-${check.detail}`}><strong className={check.passed ? "decisionPass" : "decisionFail"}>{check.passed ? "PASS" : "BLOCK"}</strong><span>{check.rule}</span><p>{check.detail}</p></div>)}</div></section> : null}</>}</section></div>;
}
