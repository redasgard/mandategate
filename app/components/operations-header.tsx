import Link from "next/link";

export const PRIMARY_OPERATIONS_AREAS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "payments", label: "Payments", href: "/payments" },
  { key: "vendors", label: "Vendors", href: "/vendors" },
  { key: "policies", label: "Policies", href: "/policies" },
  { key: "activity", label: "Activity", href: "/activity" },
] as const;

export type OperationsArea = (typeof PRIMARY_OPERATIONS_AREAS)[number]["key"];

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
    <a href="#main-content" className="ops-skip-link">Skip to main content</a>
    <div className="ops-appbar">
      <Link href="/dashboard" className="ops-brand" aria-label="MandateGate, dashboard">
        <span className="ops-brand-mark" aria-hidden="true">M</span>
        <span className="ops-brand-text"><strong>MandateGate</strong><small>PAYMENT AUTHORITY</small></span>
      </Link>
      <nav className="ops-primary-nav" aria-label="Primary navigation">
        {PRIMARY_OPERATIONS_AREAS.map(item =>
          <Link key={item.key} href={item.href}
            aria-current={active === item.key ? "location" : undefined}
            className={active === item.key ? "ops-nav-link is-active" : "ops-nav-link"}>
            {item.label}
          </Link>)}
      </nav>
      <span className="ops-account" title={email}>{email}</span>
    </div>
    <header className="ops-page-heading" id="main-content" tabIndex={-1}>
      <div>
        <p className="eyebrow">MANDATEGATE / {context}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
    </header>
  </>;
}
