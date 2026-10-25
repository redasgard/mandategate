import Link from "next/link";

export const PRIMARY_OPERATIONS_AREAS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "overview" },
  { key: "payments", label: "Payments", href: "/payments", icon: "payments" },
  { key: "vendors", label: "Vendors", href: "/vendors", icon: "vendors" },
  { key: "policies", label: "Policies", href: "/policies", icon: "policies" },
  { key: "activity", label: "Activity", href: "/activity", icon: "activity" },
] as const;

export type OperationsArea = (typeof PRIMARY_OPERATIONS_AREAS)[number]["key"];
type Glyph = "overview" | "payments" | "vendors" | "policies" | "activity" | "mandates" | "history" | "documents";

function NavIcon({name}:{name:Glyph}) {
  const common = { fill:"none", stroke:"currentColor", strokeWidth:1.65, strokeLinecap:"round" as const, strokeLinejoin:"round" as const };
  return <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...common}>
    {name === "overview" ? <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></> : null}
    {name === "payments" ? <><rect x="2.7" y="5.4" width="18.6" height="13.2" rx="2.5"/><path d="M2.8 10h18.4M7 15h4"/></> : null}
    {name === "vendors" ? <><path d="M4 20v-13l8-4 8 4v13M3 20h18M9 20v-7h6v7M8 9h1m6 0h1"/></> : null}
    {name === "policies" ? <><path d="m12 2 8 4v6c0 5-3.5 8.2-8 10-4.5-1.8-8-5-8-10V6z"/><path d="m8.7 12 2.4 2.4 4.8-5"/></> : null}
    {name === "activity" ? <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.4 2"/></> : null}
    {name === "mandates" ? <><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M9 2.5v3h6v-3M8.5 11h7M8.5 15h5"/></> : null}
    {name === "history" ? <><path d="M4 8a9 9 0 1 1-1 5M4 3v5h5M12 7v5l4 2"/></> : null}
    {name === "documents" ? <><path d="M6 2.8h8l4 4V21H6zM14 2.8v4h4M9 12h6M9 16h6"/></> : null}
  </svg>;
}

export function OperationsHeader({
  active, title, description, email, context = "OPERATIONS",
}: {
  active: OperationsArea;
  title: string;
  description: string;
  email: string;
  context?: string;
}) {
  return <>
    <a className="mg-skip" href="#main-content">Skip to main content</a>
    <aside className="mg-sidebar" aria-label="Workspace sidebar">
      <Link href="/dashboard" className="mg-brand" aria-label="MandateGate dashboard">
        <span className="mg-brand-emblem" aria-hidden="true"><span>M</span></span>
        <span className="mg-brand-wordmark"><strong>mandategate</strong><small>AUTONOMOUS PAYMENT SECURITY</small></span>
      </Link>

      <p className="mg-nav-heading">WORKSPACE</p>
      <nav aria-label="Primary navigation" className="mg-nav">
        {PRIMARY_OPERATIONS_AREAS.map(area => <Link key={area.key} href={area.href}
          aria-current={active === area.key ? "page" : undefined}
          className={"mg-nav-item" + (active === area.key ? " active" : "")}>
          <NavIcon name={area.icon}/><span>{area.label}</span>
          {active === area.key ? <span className="mg-nav-selected" aria-hidden="true"/> : null}
        </Link>)}
      </nav>

      <p className="mg-nav-heading mg-nav-heading-later">CONTROL & EVIDENCE</p>
      <nav aria-label="Control and evidence navigation" className="mg-nav">
        <Link className="mg-nav-item" href="/assistant"><NavIcon name="documents"/><span>Assistant</span></Link>
        <Link className="mg-nav-item" href="/autopay"><NavIcon name="mandates"/><span>Standing mandates</span></Link>
        <Link className="mg-nav-item" href="/obligations"><NavIcon name="history"/><span>AP horizon</span></Link>
        <Link className="mg-nav-item" href="/invoice-artifacts"><NavIcon name="documents"/><span>Source documents</span></Link>
      </nav>
      <div className="mg-sidebar-foot">
        <div className="mg-sidebar-foot-symbol" aria-hidden="true">↗</div>
        <div><strong>Money has a boundary.</strong><small>Agents request. MandateGate decides.</small></div>
      </div>
    </aside>

    <div className="mg-topbar">
      <div className="mg-breadcrumb"><span>WORKSPACE</span><span aria-hidden="true">/</span><strong>{context}</strong></div>
      <div className="mg-session">
        <span className="mg-session-label">ADMIN VIEW</span>
        <span className="mg-session-avatar" aria-hidden="true">{email.slice(0,1).toUpperCase() || "A"}</span>
        <span className="mg-session-email" title={email}>{email}</span>
      </div>
    </div>
    <header id="main-content" className="mg-pagehead" tabIndex={-1}>
      <div><p className="mg-page-eyebrow">PAYMENT AUTHORITY / {context}</p>
        <h1>{title}</h1><p className="mg-page-description">{description}</p>
      </div>
    </header>
  </>;
}
