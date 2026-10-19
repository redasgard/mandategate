import Link from "next/link";
import { INCIDENT_FILTERS, type Incident, type IncidentFilter } from "@/src/db/dashboard-incidents";

function money(cents: number, currency: string) {
  const whole = BigInt(Math.trunc(cents));
  const prefix = whole < 0n ? "-" : "";
  const abs = whole < 0n ? -whole : whole;
  return currency + " " + prefix + (abs / 100n).toLocaleString("en-US") +
    "." + (abs % 100n).toString().padStart(2, "0");
}

const labels: Record<IncidentFilter, string> = {
  ALL: "All incidents", REVIEW: "Needs review", BLOCKED: "Blocked", PAYOUT: "Payout alerts",
};

export function IncidentInvestigation({
  incidents, activeFilter,
}: { incidents: Incident[]; activeFilter: IncidentFilter }) {
  return <section className="panel" aria-label="Incident investigation">
    <div className="panel-head">
      <div>
        <p className="eyebrow">Investigation / evidence-backed alerts</p>
        <h2>Incidents needing attention</h2>
      </div>
      <span className="badge">{incidents.length} shown · read-only triage</span>
    </div>
    <div className="panel-body">
      <p className="muted">Signals are derived from stored policy decisions and payment states, not invented by an AI model. Select a case to inspect its evidence and authorized actions.</p>
      <nav className="incident-toolbar" aria-label="Incident filters">
        {INCIDENT_FILTERS.map(filter =>
          <Link key={filter} aria-current={filter === activeFilter ? "page" : undefined}
            href={filter === "ALL" ? "/dashboard" : "/dashboard?risk=" + filter}>
            {labels[filter]}
          </Link>)}
      </nav>
      {incidents.length === 0
        ? <div className="empty">No {labels[activeFilter].toLowerCase()} in your authorized organizations.</div>
        : <div className="incident-list">
          {incidents.map(incident =>
            <article className={"incident-card incident-" + incident.kind.toLowerCase()}
              key={incident.requestId}>
              <div className="incident-heading">
                <span className={"decision " + (incident.kind === "BLOCKED" ? "deny" : "escalate")}>{incident.kind}</span>
                <span className="muted">{incident.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
              </div>
              <h3>{incident.title}</h3>
              <p><strong>{incident.vendor}</strong> · {incident.invoice} · {money(incident.amountCents, incident.currency)}</p>
              <p>{incident.explanation}</p>
              <dl className="incident-details">
                <div><dt>Organization</dt><dd>{incident.organization}</dd></div>
                <div><dt>How detected</dt><dd>{incident.discoveredBy}</dd></div>
                <div><dt>Evidence / reason codes</dt><dd>{incident.reasons.join(", ") || incident.state}</dd></div>
                <div><dt>Current state</dt><dd>{incident.state}</dd></div>
              </dl>
              <Link className="incident-action"
                href={"/payments/" + encodeURIComponent(incident.requestId)}>
                {incident.kind === "REVIEW" ? "Review request" : "Investigate evidence"} →
              </Link>
            </article>)}
        </div>}
    </div>
  </section>;
}
