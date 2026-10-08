import { invoiceDecimalToCents } from "./normalize";

export const EVIDENCE_MAX_PAGE_CHARACTERS = 200_000;

export type InvoiceEvidenceField =
  | "vendor_name" | "invoice_number" | "invoice_date" | "due_date"
  | "currency" | "total_amount_decimal" | "invoice_payment_destination";

function collapsed(value: string) {
  // Preserve visible characters and digit identity. Normalize whitespace
  // commonly inserted by a deterministic PDF text extractor only.
  return value.replace(/\s+/g, " ").trim();
}

const TOTAL_LABEL_PATTERN = /(?:^|[^\w])(?:grand\s+total|total\s+(?:amount\s+)?due|amount\s+due|balance\s+due|total\s+payable|total)\s*(?:[:=#-]\s*)?(?:(?:USD|EUR|GBP)\s*)?(?:[$€£]\s*)?(\d[\d,]*\.\d{2})(?![\d.])/gi;
const INVOICE_LABEL_PATTERN = /\binvoice(?:\s*(?:number|no\.?|#|id))?\s*(?:[:=#-]\s*)?([A-Za-z0-9][A-Za-z0-9._/-]{0,119})\b/gi;
const DATE_LABELS = {
  invoice_date: /\b(?:invoice\s+date|date\s+issued|date)\s*(?:[:=-]\s*)?(\d{4}-\d{2}-\d{2})\b/gi,
  due_date: /\b(?:due\s+date|date\s+due|due)\s*(?:[:=-]\s*)?(\d{4}-\d{2}-\d{2})\b/gi,
} as const;

function finalTotalCents(source: string): number[] {
  const found: number[] = [];
  for (const match of source.matchAll(TOTAL_LABEL_PATTERN)) {
    const amount = invoiceDecimalToCents(match[1].replaceAll(",", ""));
    if (amount !== null) found.push(amount);
  }
  return found;
}

function invoiceIdentifiers(source: string): string[] {
  const unqualified = [...source.matchAll(INVOICE_LABEL_PATTERN)].map((match) => match[1]);
  // "Invoice Date" and other headings are not invoice-number evidence.
  return unqualified.filter((id) => !/^(date|due|total|amount|terms|address|items)$/i.test(id));
}

/**
 * Checks a model-selected value against the actual page text and a labeled
 * exact quote. The text must come from an independent, bounded parser.
 * This does NOT establish issuer authenticity or permission to pay.
 */
export function verifyFieldEvidenceBinding(input: {
  field: InvoiceEvidenceField;
  claimedValue: string;
  quote: string;
  pageText: string;
}): string[] {
  const source = collapsed(input.pageText);
  const quote = collapsed(input.quote);
  const value = collapsed(input.claimedValue);
  const issues: string[] = [];

  if (!quote || source.length > EVIDENCE_MAX_PAGE_CHARACTERS) {
    return ["EVIDENCE_PAGE_OR_QUOTE_UNSUPPORTED"];
  }
  if (!source.includes(quote)) return ["EVIDENCE_QUOTE_MISMATCH"];

  switch (input.field) {
    case "total_amount_decimal": {
      const amount = invoiceDecimalToCents(value);
      const quotedTotals = finalTotalCents(quote);
      const pageTotals = [...new Set(finalTotalCents(source))];
      if (amount === null || quotedTotals.length !== 1 || quotedTotals[0] !== amount) {
        issues.push("TOTAL_VALUE_NOT_BOUND_TO_FINAL_LABEL");
      }
      if (pageTotals.length !== 1) issues.push("FINAL_TOTAL_AMBIGUOUS_OR_ABSENT");
      if (pageTotals.length === 1 && pageTotals[0] !== amount) {
        issues.push("FINAL_TOTAL_CONTRADICTS_MODEL");
      }
      return issues;
    }
    case "invoice_number": {
      const ids = [...new Set(invoiceIdentifiers(quote))];
      if (ids.length !== 1 || ids[0] !== value) {
        issues.push("INVOICE_NUMBER_NOT_BOUND_TO_INVOICE_LABEL");
      }
      const pageInvoiceIds = [...new Set(invoiceIdentifiers(source))];
      if (pageInvoiceIds.length !== 1 || pageInvoiceIds[0] !== value) {
        issues.push("INVOICE_NUMBER_AMBIGUOUS_OR_CONTRADICTED");
      }
      return issues;
    }
    case "currency": {
      const explicitCurrencies = quote.match(/\b[A-Z]{3}\b/g) ?? [];
      if (!explicitCurrencies.includes(value)) {
        issues.push("CURRENCY_NOT_SOURCE_GROUNDED");
      }
      return issues;
    }
    case "invoice_date":
    case "due_date": {
      const matches = [...quote.matchAll(DATE_LABELS[input.field])].map((m) => m[1]);
      if (matches.length !== 1 || matches[0] !== value) {
        issues.push("DATE_NOT_BOUND_TO_CORRECT_LABEL");
      }
      return issues;
    }
    case "vendor_name":
    case "invoice_payment_destination":
      if (!quote.includes(value)) issues.push("FIELD_VALUE_NOT_IN_SOURCE_QUOTE");
      return issues;
  }
}
