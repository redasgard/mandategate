"use client";

import { useEffect, useMemo, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import type { AgStudioMode } from "ag-studio";
import type { AnalyticsRequestRow } from "@/src/db/payment-analytics";
import {
  analyticsStudioTheme, buildAnalyticsData, buildAnalyticsInitialReport, hasAnalyticsData,
} from "./studio-config";

/**
 * AG Studio embedded-analytics dashboard over the organization's payment
 * authority records. Runs entirely in the browser: the rows are fetched by the
 * server component with an active-ADMIN membership check and passed down.
 * Self-serve editing (drag widgets, build charts) is enabled in edit mode.
 */
export function PaymentsAnalyticsStudio({ rows, licenseKey }: {
  rows: AnalyticsRequestRow[];
  licenseKey?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<AgStudioMode>("view");
  const data = useMemo(() => buildAnalyticsData(rows), [rows]);
  const report = useMemo(() => buildAnalyticsInitialReport(rows), [rows]);
  useEffect(() => setMounted(true), []);

  if (!hasAnalyticsData(rows)) {
    return <section className="mg-surface" style={{ margin: "0 24px 48px" }}>
      <p className="muted">
        No payment activity yet. Submit an agent or invoice-derived payment request,
        then come back: this dashboard builds itself over those records.
      </p>
    </section>;
  }

  return <div style={{ padding: "0 24px 48px" }}>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
      <button type="button" className="mg-button"
        onClick={() => setMode((current) => current === "view" ? "edit" : "view")}>
        {mode === "view" ? "Edit dashboard" : "Done editing"}
      </button>
    </div>
    {mounted ? (
      <AgStudioProvider licenseKey={licenseKey}>
        <AgStudio
          style={{ height: "78vh", width: "100%" }}
          theme={analyticsStudioTheme}
          layout={{ widgetBorderEnabled: true }}
          data={data}
          initialState={report}
          mode={mode}
        />
      </AgStudioProvider>
    ) : (
      <p className="muted">Loading dashboard…</p>
    )}
  </div>;
}
