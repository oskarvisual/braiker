import { redirect } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { currentUser } from "@/modules/auth/session";
import { getSystemStatus, type SystemStatusState } from "@/modules/monitoring/system-status";

export const dynamic = "force-dynamic";

const stateLabel: Record<SystemStatusState, string> = {
  healthy: "Operational",
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
        <div><small>On</small><strong>{status.bots.on}</strong><span>actively evaluated</span></div>
        <div><small>Off</small><strong>{status.bots.off}</strong><span>not submitting orders</span></div>
        <div><small>Dead</small><strong>{status.bots.dead}</strong><span>history only</span></div>
        <div><small>Checked</small><strong>{status.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong><span>refresh for a new check</span></div>
      </section>
      <section className="statusServiceGrid" aria-label="Service status">
        {status.services.map((service) => <article className={`statusService ${service.state}`} key={service.id}>
          <div className="statusServiceHeading"><span className="statusIndicator" aria-hidden="true" /><div><h2>{service.label}</h2><strong>{stateLabel[service.state]}</strong></div></div>
          <p>{service.detail}</p>
        </article>)}
      </section>
      <section className="panel statusNotes"><p className="eyebrow">READING THIS PAGE</p><h2>What is checked</h2><ul><li>MySQL, worker heartbeat, the authenticated Alpaca market stream, and Alpaca Paper are live checks.</li><li>OpenAI reports advisory configuration readiness only; it never receives a health-check request. SMTP and webhooks report configuration because delivery is not implemented yet.</li><li>Only the single Paper environment may be operational. This page never enables live trading.</li></ul></section>
    </main>
  </>;
}
