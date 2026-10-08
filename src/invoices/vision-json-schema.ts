// Strict JSON schema for GLM-5.3 Flash, mirrored against invoiceExtractionSchema.
// Objects require every key; the nullable value fields represent missing facts.
const evidence = {
  type: "object",
  additionalProperties: false,
  properties: {
    artifact_id: { type: "string" },
    page_number: { type: "integer", minimum: 1, maximum: 20 },
    source_fragment: { type: "string" },
  },
  required: ["artifact_id", "page_number", "source_fragment"],
};

const field = {
  type: "object",
  additionalProperties: false,
  properties: {
    value: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "array", items: evidence },
  },
  required: ["value", "confidence", "evidence"],
};

const lineItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    quantity_decimal: { type: ["string", "null"] },
    unit_price_decimal: { type: ["string", "null"] },
    line_total_decimal: { type: ["string", "null"] },
    evidence: { type: "array", items: evidence },
  },
  required: [
    "description",
    "quantity_decimal",
    "unit_price_decimal",
    "line_total_decimal",
    "evidence",
  ],
};

const FIELDS = [
  "vendor_name",
  "invoice_number",
  "invoice_date",
  "due_date",
  "currency",
  "total_amount_decimal",
  "invoice_payment_destination",
] as const;

export const INVOICE_VISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries([
    ...FIELDS.map((name) => [name, field]),
    ["line_items", { type: "array", items: lineItem }],
    ["observed_instructions", { type: "array", items: { type: "string" } }],
  ]),
  required: [...FIELDS, "line_items", "observed_instructions"],
} as const;

export const INVOICE_VISION_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "mandategate_invoice_observation_v1",
    strict: true,
    schema: INVOICE_VISION_JSON_SCHEMA,
  },
} as const;
