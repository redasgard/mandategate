import Link from "next/link";
import { INCIDENT_FILTERS, type Incident, type IncidentFilter } from "@/src/db/dashboard-incidents";

const labels: Record<IncidentFilter, string> = {
  ALL:"All cases", REVIEW:"Needs review", BLOCKED:"Blocked", PAYOUT:"Payout issues",
};
const emptyText: Record<IncidentFilter, string> = {
  ALL:"No cases to display", REVIEW:"No reviews to display",
  BLOCKED:"No blocked cases to display", PAYOUT:"No payout issues to display",
};

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US",{style:"currency",currency}).format(cents/100);
}

export function IncidentInvestigation({incidents,activeFilter}:{
  incidents:Incident[];activeFilter:IncidentFilter;
}) {
  const shown = incidents.slice(0,7);
  return <div className="mg-incidents" id="incidents" aria-label="Incident investigation">
    <div className="mg-section-title">
      <h2>Decision queue</h2>
      <nav className="mg-filter" aria-label="Incident filters">
        {INCIDENT_FILTERS.map(filter=><Link key={filter}
          href={filter==="ALL"?"/dashboard#incidents":"/dashboard?risk="+filter+"#incidents"}
          aria-current={filter===activeFilter?"page":undefined}>{labels[filter]}</Link>)}
      </nav>
    </div>
    {shown.length===0 ? <div className="mg-case-empty" role="status">
      <span className="mg-case-empty-icon" aria-hidden="true">✓</span>
      <div><strong>{emptyText[activeFilter]}</strong>
        <small>There are no matching recorded cases in your authorized organizations. This is not a guarantee that every provider event or external invoice was ingested.</small></div>
    </div> : <div className="mg-case-list">
      {shown.map(incident=><Link
        className="mg-case-row"
        href={"/payments/"+encodeURIComponent(incident.requestId)}
        key={incident.requestId}
        aria-label={(incident.kind==="REVIEW"?"Review":"Investigate")+" "+incident.title+" for "+incident.vendor}>
        <span className={"mg-case-dot "+incident.kind.toLowerCase()} aria-hidden="true"/>
        <span className="mg-case-main">
          <span className="mg-case-name">{incident.title} <span className={"mg-mini-state "+(incident.kind==="BLOCKED"?"deny":"escalate")}>{incident.kind}</span></span>
          <span className="mg-case-caption">
            {incident.vendor} · {incident.invoice} · {incident.organization}
          </span>
          {incident.kind==="PAYOUT" ? <span className="mg-case-caption">{incident.explanation}</span> : null}
          <span className="mg-case-caption">{incident.discoveredBy} · {incident.reasons.join(", ")||incident.state}</span>
        </span>
        <span className="mg-case-money">{formatAmount(incident.amountCents,incident.currency)}</span>
        <span className="mg-case-arrow" aria-hidden="true">↗</span>
      </Link>)}
    </div>}
    <p className="mg-case-meta">
      {incidents.length>shown.length?"Showing the first seven prioritized cases. ":null}
      Decisions are based on persisted policy and provider states. Each case links to its original evidence and authorized actions.
    </p>
  </div>;
}
