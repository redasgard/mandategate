import { z } from "zod";
import { invoiceDecimalToCents, isIsoCalendarDate } from "./normalize";
import { verifyFieldEvidenceBinding } from "./semantic-evidence";

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
  observed_instructions: z.array(z.string().min(1).max(500)).max(5),
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
    // Emit only fixed, schema-owned field names. Never leak a model-provided
    // key, quote, value, or validation error message into audit reasons.
    const allowedRoots = new Set([
      "vendor_name", "invoice_number", "invoice_date", "due_date",
      "currency", "total_amount_decimal", "invoice_payment_destination",
      "line_items", "observed_instructions",
    ]);
    const safeReasons = new Set<string>(["EXTRACTION_INVALID"]);
    for (const issue of parsed.error.issues.slice(0, 32)) {
      const root = issue.path[0];
      if (typeof root === "string" && allowedRoots.has(root)) {
        safeReasons.add("EXTRACTION_SCHEMA_" + root.toUpperCase());
      } else {
        safeReasons.add("EXTRACTION_SCHEMA_OTHER");
      }
    }
    return {
      state: "ESCALATE",
      reasonCodes: [...safeReasons].sort(),
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

  const fieldNames = [
    "vendor_name",
    "invoice_number",
    "invoice_date",
    "due_date",
    "currency",
    "total_amount_decimal",
    "invoice_payment_destination",
  ] as const;

  // Compare every claimed field with the exact page quote AND its labeled
  // semantic value. A quote merely existing somewhere cannot validate a
  // contradictory amount, invoice ID, date or currency.
  for (const fieldName of fieldNames) {
    const field = invoice[fieldName];
    if (field.value && field.evidence.length === 0) {
      reasons.add("MISSING_EVIDENCE_" + fieldName.toUpperCase());
    }
    for (const ref of field.evidence) {
      if (ref.artifact_id !== context.artifactId || ref.page_number > context.pages.length) {
        reasons.add("EVIDENCE_REFERENCE_MISMATCH");
        continue;
      }
      const source = context.pages[ref.page_number - 1]?.text;
      if (source === null || source === undefined) {
        // Visual quotes reported by the image model are not independently
        // validated against OCR and cannot become trusted evidence.
        reasons.add("IMAGE_EVIDENCE_NOT_VERIFIED");
      } else if (field.value !== null) {
        for (const issue of verifyFieldEvidenceBinding({
          field: fieldName,
          claimedValue: field.value,
          quote: ref.source_fragment,
          pageText: source,
        })) reasons.add(issue);
      } else if (!normalizedText(source).includes(normalizedText(ref.source_fragment))) {
        reasons.add("EVIDENCE_QUOTE_MISMATCH");
      }
      if (POSSIBLE_DOCUMENT_INSTRUCTIONS.test(ref.source_fragment)) {
        reasons.add("DOCUMENT_INSTRUCTIONS_SUSPECTED");
      }
    }
  }

  // Line items cannot authorize payment; their evidence is checked only for
  // actual source presence. Reconciliation against the payable total is a
  // separate deterministic step.
  for (const item of invoice.line_items) {
    for (const ref of item.evidence) {
      if (ref.artifact_id !== context.artifactId || ref.page_number > context.pages.length) {
        reasons.add("EVIDENCE_REFERENCE_MISMATCH");
        continue;
      }
      const source = context.pages[ref.page_number - 1]?.text;
      if (source === null || source === undefined) {
        reasons.add("IMAGE_EVIDENCE_NOT_VERIFIED");
      } else if (!normalizedText(source).includes(normalizedText(ref.source_fragment))) {
        reasons.add("EVIDENCE_QUOTE_MISMATCH");
      }
    }
  }

  return {
    state: reasons.size ? "ESCALATE" : "EXTRACTED_UNTRUSTED",
    reasonCodes: [...reasons].sort(),
    extracted: invoice,
    amountCents,
  };
}
