import { studioTheme } from "ag-studio";
import type {
  AgDataSourcesDefinition, AgFieldDefinition, AgFormat, AgPageState, AgRelationDefinition,
  AgReportState, AgWidgetLayoutState,
} from "ag-studio";
import type { AnalyticsRequestRow } from "@/src/db/payment-analytics";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

// ------------------------------------------------------------------- helpers
type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide && { hide }) }));

const manyToOne = (id: string, source: string, target: string): AgRelationDefinition => {
  const [sourceTable, sourceField] = source.split(".");
  const [targetTable, targetField] = target.split(".");
  return { id, source: { tableId: sourceTable, fieldId: sourceField },
    target: { tableId: targetTable, fieldId: targetField }, type: "many-to-one" };
};

const CALENDAR_ID = "calendar";
const onCalendar = (tableId: string, fieldId: string): AgRelationDefinition => ({
  id: `${tableId}-${fieldId}-calendar`,
  source: { tableId, fieldId }, target: { calendarId: CALENDAR_ID }, truncate: "day",
});

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState =>
  ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const countd = (id: string) => ({ id, aggregation: "countd" as const });
const typography = (fontSize: number, fontWeight: "normal" | "bold" = "normal") =>
  ({ fontFamily: FONT, fontSize, fontWeight, fontStyle: "normal" as const });

const kpi = (text: string, value: { id: string; aggregation?: "sum" | "avg" | "countd" }) => ({
  type: "value" as const,
  dataMapping: { value: [value] },
  format: {
    title: { enabled: true, text, typography: typography(14, "bold") },
    caption: { enabled: true, text: "", typography: typography(0) },
    style: { typography: typography(22) },
  },
});

// ------------------------------------------------------------------ data
export function buildAnalyticsData(rows: AnalyticsRequestRow[]): AgDataSourcesDefinition {
  const requests = rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    vendorId: row.vendorId,
    amountUsd: row.amountCents / 100,
    currency: row.currency,
    status: row.status,
    outcome: row.outcome ?? "UNKNOWN",
    source: row.source,
    reasonCodes: row.reasonCodes.join(", ") || "None",
    settled: row.settled,
    createdAt: row.createdAt.slice(0, 10),
  }));
  const vendors = [...new Map(rows.map((row) => [row.vendorId, {
    id: row.vendorId, name: row.vendorName,
  }])).values()];
  const executions = rows.filter((row) => row.executionStatus).map((row) => ({
    id: row.id,
    requestId: row.id,
    status: row.executionStatus ?? "",
    batchId: row.paypalPayoutBatchId ?? "",
    itemId: row.paypalPayoutItemId ?? "",
    amountUsd: row.amountCents / 100,
    submittedAt: row.submittedAt?.slice(0, 10) ?? "",
    reconciledAt: row.lastReconciledAt?.slice(0, 10) ?? "",
  }));

  const dates = requests.map((row) => row.createdAt).filter(Boolean).sort();
  const today = new Date().toISOString().slice(0, 10);
  const settledValue = executions.reduce((total, row) => total + row.amountUsd, 0);

  return {
    description:
      "Payment authority records for this organization: agent and invoice-derived " +
      "payment requests, their recorded decisions (ALLOW / ESCALATE / DENY) with " +
      "reason codes, and any PayPal Sandbox settlement. Amounts are USD. " +
      "A settled payout exists only after independent policy checks and explicit human approval.",
    sources: [
      {
        id: "requests",
        description: "One row per payment request with its recorded decision outcome.",
        data: requests,
        fields: fields([
          ["id", "Request ID", "textFormat", true],
          ["invoiceNumber", "Invoice", "textFormat"],
          ["vendorId", "Vendor ID", "textFormat", true],
          ["amountUsd", "Amount", "currencyFormat"],
          ["currency", "Currency", "textFormat", true],
          ["status", "Request Status", "textFormat"],
          ["outcome", "Decision", "textFormat"],
          ["source", "Source", "textFormat"],
          ["reasonCodes", "Reason Codes", "textFormat"],
          ["settled", "Settled", "booleanFormat"],
          ["createdAt", "Requested", "dateFormat"],
        ]),
      },
      {
        id: "vendors",
        description: "Vendors referenced by payment requests.",
        data: vendors,
        fields: fields([
          ["id", "Vendor ID", "textFormat", true],
          ["name", "Vendor", "textFormat"],
        ]),
      },
      {
        id: "executions",
        description: "Executed PayPal Sandbox payouts (settled money only).",
        data: executions,
        fields: fields([
          ["id", "Execution ID", "textFormat", true],
          ["requestId", "Request ID", "textFormat", true],
          ["status", "Execution Status", "textFormat"],
          ["batchId", "Payout Batch", "textFormat"],
          ["itemId", "Payout Item", "textFormat"],
          ["amountUsd", "Settled Amount", "currencyFormat"],
          ["submittedAt", "Submitted", "dateFormat"],
          ["reconciledAt", "Reconciled", "dateFormat"],
        ]),
      },
    ],
    relationships: [
      manyToOne("request-vendor", "requests.vendorId", "vendors.id"),
      manyToOne("execution-request", "executions.requestId", "requests.id"),
      onCalendar("requests", "createdAt"),
    ],
    calendars: [{
      id: CALENDAR_ID,
      label: "Calendar",
      range: { from: { type: "date", value: dates[0] ?? today },
        to: { type: "date", value: dates.at(-1) ?? today } },
      fragments: ["year", "quarter", "month", "week", "day"],
    }],
    expressions: settledValue > 0 ? [{
      id: "settledValueShare",
      name: "Settled value share",
      description: "Settled payout value divided by total requested value.",
      format: "percentageFormat",
      isMeasure: true,
      expression: { operator: "divide", inputs: [sum("executions.amountUsd"), sum("requests.amountUsd")] },
    }] : [],
  };
}

export const hasAnalyticsData = (rows: AnalyticsRequestRow[]) => rows.length > 0;

// ----------------------------------------------------------------- report
export function buildAnalyticsInitialReport(rows: AnalyticsRequestRow[]): AgReportState {
  const hasSettlements = rows.some((row) => row.executionStatus);
  const widgets: AgPageState["widgets"] = {
    "kpi-requests": kpi("Requests", countd("requests.id")),
    "kpi-settled": kpi("Settled payouts", countd("executions.id")),
    ...(hasSettlements
      ? { "kpi-settled-value": kpi("Settled value", sum("executions.amountUsd")) }
      : {}),
    "kpi-vendors": kpi("Vendors", countd("vendors.id")),
    "outcome-mix": {
      type: "donut-chart",
      dataMapping: {
        categoryKey: [{ id: "requests.outcome" }],
        valueKey: [sum("requests.amountUsd")],
      },
      format: {
        ...title("Requested value by decision"),
        style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } },
      },
    },
    "requests-by-month": {
      type: "column-chart-stacked",
      dataMapping: {
        categoryKey: [{ id: "calendar::month" }],
        valueKey: [sum("requests.amountUsd")],
        legendKey: [{ id: "requests.outcome" }],
      },
      format: {
        ...title("Requested value by month and decision"),
        style: { theme: { common: { legend: { enabled: true } } } },
      },
    },
    "requests-grid": {
      type: "grid",
      dataMapping: {
        cols: [
          { id: "requests.invoiceNumber" },
          { id: "vendors.name" },
          { id: "requests.status" },
          { id: "requests.outcome" },
          { id: "requests.reasonCodes" },
          sum("requests.amountUsd"),
          { id: "requests.createdAt" },
        ],
      },
      sort: [{ field: { id: "requests.createdAt" }, direction: "desc" }],
      format: title("Payment requests, newest first"),
    },
  };
  const kpiLayout = hasSettlements
    ? {
      "kpi-requests": at(0, 0, 6, 7), "kpi-settled": at(6, 0, 6, 7),
      "kpi-settled-value": at(12, 0, 6, 7), "kpi-vendors": at(18, 0, 6, 7),
    }
    : {
      "kpi-requests": at(0, 0, 8, 7), "kpi-settled": at(8, 0, 8, 7),
      "kpi-vendors": at(16, 0, 8, 7),
    };
  return {
    selectedPageId: "overview",
    pages: [{
      id: "overview",
      widgets,
      widgetLayout: {
        ...kpiLayout,
        "outcome-mix": at(0, 7, 9, 17),
        "requests-by-month": at(9, 7, 15, 17),
        "requests-grid": at(0, 24, 24, 24),
      },
    }],
  };
}

// ------------------------------------------------------------------ theme
const P = {
  canvas: "#101415", surface: "#181e20", border: "#323a3c", gridline: "#262d2f",
  ink: "#f0eee9", muted: "#98a4a7", copper: "#d4a473", hover: "#1d2526",
};
const line = (color: string) => ({ width: 1, color });
const palette = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
  const colors = ["#d4a473", "#7fa4b8", "#8fb996", "#c98a7d", "#b98d5e",
    "#6fa3a0", "#9b8aa6", "#caa46a", "#6e7a7e", "#c2b49a"];
  return [[`chartPaletteFills${index + 1}Color`, colors[index]],
    [`chartPaletteStrokes${index + 1}Color`, colors[index]]];
}).flat());

export const analyticsStudioTheme = studioTheme.withParams({
  fontFamily: FONT, fontSize: 14,
  textColor: P.ink, foregroundColor: P.ink, subtleTextColor: P.muted,
  backgroundColor: P.canvas, borderColor: P.border, accentColor: P.copper,
  iconColor: P.copper, rowHoverColor: P.hover,
  studioWrapperBorder: false, studioWrapperBorderRadius: 0, studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: P.canvas,
  studioCanvasBorder: false, studioCanvasBorderRadius: 0, studioCanvasShadow: false,
  studioCanvasBackgroundColor: P.canvas, studioCanvasPadding: 20,
  studioCanvasRowHeight: 18, studioCanvasFontFamily: FONT,
  studioWidgetBackgroundColor: P.surface, studioWidgetBorder: line(P.border),
  studioWidgetBorderRadius: 8, studioWidgetPadding: 10,
  studioWidgetTitleFontFamily: FONT, studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 600, studioWidgetTitleTextColor: P.ink,
  studioWidgetSubtitleFontFamily: FONT, studioWidgetSubtitleFontSize: 13,
  studioWidgetSubtitleTextColor: P.muted,
  studioWidgetCaptionFontFamily: FONT, studioWidgetCaptionFontSize: 13,
  studioWidgetCaptionTextColor: P.muted, studioWidgetResizeBorderColor: P.copper,
  studioPanelContainerBackgroundColor: P.surface, studioPanelContainerBorder: line(P.border),
  studioPanelContainerBorderRadius: 0, studioPanelDividerColor: P.border,
  studioPanelDividerActiveColor: P.copper, studioPanelSectionBorderColor: P.border,
  studioPanelHeaderFontFamily: FONT, studioPanelHeaderFontWeight: 600,
  studioPanelChevronButtonHoverBackgroundColor: P.hover,
  studioPanelChevronButtonHoverColor: P.copper,
  studioToggleButtonActiveBackgroundColor: P.hover,
  studioToggleButtonActiveBorderColor: P.copper, studioToggleButtonActiveColor: P.copper,
  gridFontFamily: FONT, gridFontSize: 14, gridCellTextColor: P.ink,
  gridHeaderBackgroundColor: P.surface, gridHeaderTextColor: P.muted,
  gridHeaderFontWeight: 600, gridHeaderFontSize: 13, gridRowHeight: 40,
  gridRowBorder: line(P.gridline), gridHeaderRowBorder: line(P.border),
  gridPinnedRowBorder: line(P.border), gridRowHoverColor: P.hover, gridWrapperBorder: false,
  chartFontFamily: FONT, chartTextColor: P.ink, chartSubtleTextColor: P.muted,
  chartAxisLineColor: P.border, chartGridLineColor: P.gridline,
  ...palette,
});
