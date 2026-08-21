import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { currentUser } from "@/modules/auth/session";
import { getSystemStatus, type SystemStatusState } from "@/modules/monitoring/system-status";
import { OpenAiRuntimeControl } from "@/components/openai-runtime-control";

export const dynamic = "force-dynamic";

const stateLabel: Record<SystemStatusState, string> = {
  healthy: "Operational",
  configured: "Configured",
  warning: "Needs attention",
  unavailable: "Unavailable",
  disabled: "Disabled"
};

export default async function StatusPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  if (user.role !== "ADMIN") redirect("/");
  const status = await getSystemStatus();

  return <>
    <AppNavigation user={{ email: user.email, role: user.role }} />
    <main className="shell appContent">
      <header>
        <div><p className="eyebrow">OPERATIONS</p><h1>System status</h1><p className="pageLead">Live health of the local app, its worker and its configured Paper-only dependencies. No credentials or destinations are displayed here.</p></div>
        <a className="secondaryButton" href="/status">Refresh</a>
      </header>
      <section className="statusSummary" aria-label="Bot status summary">
        <div><small>On</small><strong>{status.bots.on}</strong><span>enabled; worker evaluates them</span></div>
        <div><small>Off</small><strong>{status.bots.off}</strong><span>not submitting orders</span></div>
        <div><small>Dead</small><strong>{status.bots.dead}</strong><span>history only</span></div>
        <div><small>Checked</small><strong>{status.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong><span>refresh for a new check</span></div>
      </section>
      <section className="statusServiceGrid" aria-label="Service status">
        {status.services.map((service) => <article className={`statusService ${service.state}`} key={service.id}>
          <div className="statusServiceHeading"><span className="statusIndicator" aria-hidden="true" /><div><h2>{service.label}</h2><strong>{stateLabel[service.state]}</strong></div></div>
          <p>{service.detail}</p>
          {service.id === "openai" && status.openAi.reactivationAllowed && <OpenAiRuntimeControl />}
        </article>)}
      </section>
      <section className="panel statusNotes"><p className="eyebrow">READING THIS PAGE</p><h2>What is checked</h2><ul><li>MySQL, worker heartbeat, the authenticated Alpaca market stream, and Alpaca Paper are live checks.</li><li>ON means a bot is eligible for the worker’s market cycle. A current worker heartbeat is required before it can be evaluated.</li><li>OpenAI is contacted only for eligible candidates. A quota or billing rejection pauses it while deterministic safeguards continue. The reactivation control appears only for that persistent quota pause and sends one minimal availability check; BrAIker never estimates or displays an OpenAI balance.</li><li>Only the single Paper environment may be operational. This page never enables live trading.</li></ul></section>
    </main>
  </>;
}
