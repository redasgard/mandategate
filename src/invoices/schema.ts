import { z } from "zod";
import { invoiceDecimalToCents, isIsoCalendarDate } from "./normalize";

// Source references are evidence claims made by the model, not trusted proof.
export const invoiceEvidenceSchema = z.object({
  artifact_id: z.string().uuid(),
  page_number: z.number().int().min(1).max(20),
  source_fragment: z.string().min(1).max(1000),
}).strict();

const invoiceFieldSchema = z.object({
  value: z.string().max(320).nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(invoiceEvidenceSchema).max(5),
}).strict();

export const invoiceExtractionSchema = z.object({
  vendor_name: invoiceFieldSchema,
  invoice_number: invoiceFieldSchema,
  invoice_date: invoiceFieldSchema,
  due_date: invoiceFieldSchema,
  currency: invoiceFieldSchema,
  total_amount_decimal: invoiceFieldSchema,
  invoice_payment_destination: invoiceFieldSchema,
  observed_instructions: z.array(z.string().min(1).max(500)).max(5).optional(),
  line_items: z.array(z.object({
    description: z.string().min(1).max(1000),
    quantity_decimal: z.string().max(64).nullable(),
    unit_price_decimal: z.string().max(64).nullable(),
    line_total_decimal: z.string().max(64).nullable(),
    evidence: z.array(invoiceEvidenceSchema).max(5),
  }).strict()).max(100),
}).strict();

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;
type PaymentCriticalField =
  | "vendor_name"
  | "invoice_number"
  | "currency"
  | "total_amount_decimal";

export type InvoicePageEvidence = {
  // Text is null for image/scan evidence that has not yet been independently checked.
  text: string | null;
};

export type InvoiceExtractionAssessment = {
  state: "EXTRACTED_UNTRUSTED" | "ESCALATE";
  reasonCodes: string[];
  extracted: InvoiceExtraction | null;
  amountCents: number | null;
};

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const POSSIBLE_DOCUMENT_INSTRUCTIONS =
  /(?:ignore (?:all |any )?(?:previous|prior) instructions|system prompt|bypass (?:the )?(?:approval|policy|security)|pay (?:to|instead) (?:this|another) account)/i;

// No route from this validation result directly to an ALLOW or PayPal call.
export function assessUntrustedInvoiceExtraction(
  candidate: unknown,
  context: {
    artifactId: string;
    pages: readonly InvoicePageEvidence[];
    trustedDestination?: string;
  },
): InvoiceExtractionAssessment {
  const parsed = invoiceExtractionSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      state: "ESCALATE",
      reasonCodes: ["EXTRACTION_INVALID"],
      extracted: null,
      amountCents: null,
    };
  }

  const invoice = parsed.data;
  const reasons = new Set<string>();
  if (invoice.observed_instructions?.length) reasons.add("DOCUMENT_INSTRUCTIONS_SUSPECTED");
  const critical: PaymentCriticalField[] = [
    "vendor_name", "invoice_number", "currency", "total_amount_decimal",
  ];

  for (const field of critical) {
    const fact = invoice[field];
    if (!fact.value?.trim()) reasons.add("MISSING_" + field.toUpperCase());
    if (fact.confidence < 0.85) reasons.add("LOW_CONFIDENCE_" + field.toUpperCase());
    if (fact.evidence.length === 0) reasons.add("MISSING_EVIDENCE_" + field.toUpperCase());
  }

  const amountCents = invoice.total_amount_decimal.value
    ? invoiceDecimalToCents(invoice.total_amount_decimal.value)
    : null;
  if (amountCents === null) reasons.add("INVALID_AMOUNT");

  if (!/^[A-Z]{3}$/.test(invoice.currency.value ?? "")) {
    reasons.add("INVALID_CURRENCY");
  }

  for (const field of ["invoice_date", "due_date"] as const) {
    const value = invoice[field].value;
    if (value !== null && !isIsoCalendarDate(value)) {
      reasons.add("INVALID_" + field.toUpperCase());
    }
  }

  const observedDestination = invoice.invoice_payment_destination.value;
  if (
    context.trustedDestination &&
    observedDestination &&
    observedDestination !== context.trustedDestination
  ) {
    reasons.add("DESTINATION_MISMATCH_UNTRUSTED");
  }

  const evidence = [
    ...Object.values(invoice).filter(
      (item): item is z.infer<typeof invoiceFieldSchema> =>
        typeof item === "object" && item !== null && "evidence" in item &&
        "confidence" in item,
    ).flatMap((field) => field.evidence),
    ...invoice.line_items.flatMap((line) => line.evidence),
  ];

  for (const ref of evidence) {
    if (ref.artifact_id !== context.artifactId || ref.page_number > context.pages.length) {
      reasons.add("EVIDENCE_REFERENCE_MISMATCH");
      continue;
    }
    const source = context.pages[ref.page_number - 1]?.text;
    if (source === null || source === undefined) {
      // A model quote of an image is not independently verified evidence.
      reasons.add("IMAGE_EVIDENCE_NOT_VERIFIED");
    } else if (!normalizedText(source).includes(normalizedText(ref.source_fragment))) {
      reasons.add("EVIDENCE_QUOTE_MISMATCH");
    }
    if (POSSIBLE_DOCUMENT_INSTRUCTIONS.test(ref.source_fragment)) {
      reasons.add("DOCUMENT_INSTRUCTIONS_SUSPECTED");
    }
  }

  return {
    state: reasons.size ? "ESCALATE" : "EXTRACTED_UNTRUSTED",
    reasonCodes: [...reasons].sort(),
    extracted: invoice,
    amountCents,
  };
}
