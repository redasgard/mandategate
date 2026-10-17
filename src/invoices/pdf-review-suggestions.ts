import { verifyFieldEvidenceBinding } from "./semantic-evidence";
import { invoiceDecimalToCents } from "./normalize";

export const PDF_REVIEW_FIELDS = [
  "vendor_name", "invoice_number", "currency",
  "total_amount_decimal", "invoice_payment_destination",
] as const;
export type PdfReviewField = (typeof PDF_REVIEW_FIELDS)[number];
export type PdfReviewFact = {
  value: string;
  sourceFragment: string;
  pageNumber: number;
};
export type PdfReviewPage = {
  pageNumber: number;
  text: string;
  textSha256: string;
};
export type UnverifiedPdfSuggestions = {
  state: "SUGGESTED_UNVERIFIED";
  fields: Partial<Record<PdfReviewField, PdfReviewFact>>;
  missing: PdfReviewField[];
  warnings: string[];
  issuerAuthenticated: false;
  paymentAuthorized: false;
};

const missingResult = (warning: string): UnverifiedPdfSuggestions => ({
  state: "SUGGESTED_UNVERIFIED", fields: {},
  missing: [...PDF_REVIEW_FIELDS], warnings: [warning],
  issuerAuthenticated: false, paymentAuthorized: false,
});

/**
 * Pure, browser-safe reviewer convenience, not an invoice extractor with
 * authority. Reads only independently parsed PDF page text. Never uses GLM,
 * uploads a document, changes stored claims, or approves an invoice.
 *
 * Ambiguous values are intentionally left blank. The admin still compares
 * the original PDF and explicitly reviews every fact in the T2 workflow.
 */
export function suggestUnverifiedPdfReviewFacts(
  pages: PdfReviewPage[],
): UnverifiedPdfSuggestions {
  if (pages.length < 1 || pages.length > 20)
    return missingResult("PARSER_PAGES_UNAVAILABLE");
  let characters = 0;
  for (const [index, page] of pages.entries()) {
    if (page.pageNumber !== index + 1 || typeof page.text !== "string" ||
        page.text.length < 1 || page.text.length > 100_000 ||
        !/^[a-f0-9]{64}$/.test(page.textSha256)) {
      return missingResult("PARSER_PAGES_INCOMPLETE");
    }
    characters += page.text.length;
    if (characters > 250_000) return missingResult("PARSER_TEXT_TOO_LARGE");
  }

  const allText = pages.map(page => page.text).join(" ");
  const fields: Partial<Record<PdfReviewField, PdfReviewFact>> = {};
  const warnings: string[] = [];

  function unique(
    field: PdfReviewField,
    regex: RegExp,
    valueFromMatch: (match: RegExpMatchArray) => string | null,
  ) {
    const candidates: PdfReviewFact[] = [];
    for (const page of pages) {
      for (const match of page.text.matchAll(regex)) {
        const value = valueFromMatch(match);
        const sourceFragment = match[0].trim();
        if (!value || !sourceFragment || value.length > 320) continue;
        if (verifyFieldEvidenceBinding({
          field, claimedValue: value, quote: sourceFragment,
          pageText: page.text,
        }).length > 0) continue;
        if (verifyFieldEvidenceBinding({
          field, claimedValue: value, quote: sourceFragment,
          pageText: allText,
        }).length > 0) continue;
        candidates.push({value, sourceFragment, pageNumber: page.pageNumber});
      }
    }
    const identities = new Set(candidates.map(item => item.value));
    if (identities.size === 1) {
      fields[field] = candidates[0];
    } else if (identities.size > 1) {
      warnings.push("AMBIGUOUS_" + field.toUpperCase());
    }
  }

  // Header-only heuristic: the first printed vendor-like string preceding the
  // FIRST "Invoice" token. It is a human-readable suggestion, not T3 identity.
  const header = pages[0].text.match(
    /^([A-Za-z][A-Za-z0-9 &.,'()-]{2,79}?)\s+Invoice\b/i,
  );
  if (header) {
    const value = header[1].trim();
    if (value && !/\b(?:invoice|transfer|ignore|approve)\b/i.test(value) &&
        verifyFieldEvidenceBinding({
          field: "vendor_name", claimedValue: value,
          quote: value, pageText: allText,
        }).length === 0) {
      fields.vendor_name = {
        value, sourceFragment: value, pageNumber: 1,
      };
    }
  }

  unique(
    "invoice_number",
    /\binvoice(?:\s*(?:number|no\.?|#|id))?\s*(?:[:=#-]\s*)?([A-Za-z0-9][A-Za-z0-9._/-]{0,119})\b/gi,
    match => /^(?:date|due|total|amount|terms|address|items)$/i.test(match[1])
      ? null : match[1],
  );
  unique(
    "currency",
    /\b(?:USD|EUR|GBP)\b/g,
    match => match[0],
  );
  unique(
    "total_amount_decimal",
    /\b(?:grand\s+total|total\s+(?:amount\s+)?due|amount\s+due|balance\s+due|total)\s*(?:[:=#-]\s*)?(?:(?:USD|EUR|GBP)\s*)?(?:[$€£]\s*)?(\d[\d,]*\.\d{2})(?![\d.])/gi,
    match => {
      const value = match[1].replaceAll(",", "");
      return invoiceDecimalToCents(value) === null ? null : value;
    },
  );
  unique(
    "invoice_payment_destination",
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    match => match[0],
  );

  const missing = PDF_REVIEW_FIELDS.filter(field => !fields[field]);
  return {
    state: "SUGGESTED_UNVERIFIED",
    fields, missing, warnings,
    issuerAuthenticated: false, paymentAuthorized: false,
  };
}

export function mergeSuggestionsWithoutOverwritingReview(
  existing: Record<PdfReviewField, PdfReviewFact>,
  proposal: UnverifiedPdfSuggestions,
): Record<PdfReviewField, PdfReviewFact> {
  return Object.fromEntries(PDF_REVIEW_FIELDS.map(field => {
    const current = existing[field];
    const alreadyReviewed = Boolean(current.value.trim() || current.sourceFragment.trim());
    return [field, alreadyReviewed ? current : proposal.fields[field] ?? current];
  })) as Record<PdfReviewField, PdfReviewFact>;
}
