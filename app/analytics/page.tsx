import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/src/auth/auth";
import { isRestrictedJudge } from "@/src/auth/judge-dashboard";
import { OperationsHeader } from "@/app/components/operations-header";
import { readPaymentAnalyticsRows } from "@/src/db/payment-analytics";
import { PaymentsAnalyticsStudio } from "./payments-analytics-studio";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (await isRestrictedJudge(session.user.id)) redirect("/judge");

  const rows = await readPaymentAnalyticsRows(session.user.id);

  return <main className="shell mg-shell">
    <OperationsHeader active="analytics" context="ANALYTICS" title="Payment analytics"
      description="Self-serve dashboards over the same authority records — powered by AG Studio."
      email={session.user.email ?? "Administrator"}/>
    <PaymentsAnalyticsStudio rows={rows}
      licenseKey={process.env.AG_STUDIO_LICENSE_KEY || undefined}/>
  </main>;
}
