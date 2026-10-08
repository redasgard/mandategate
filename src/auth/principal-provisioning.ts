import { inArray } from "drizzle-orm";
import { db } from "../db/db";
import { apiPrincipals } from "../db/schema";
import { hashAgentKey } from "./machine";
import { INVOICE_AGENT_SCOPES, TRUSTED_PAYMENT_AGENT_SCOPES } from "./principal-scopes";

type PrincipalKeys = {
  invoiceKey: string | undefined;
  paymentKey: string | undefined;
};

export function validateDemoPrincipalKeys(input: PrincipalKeys) {
  for (const [label, key] of [
    ["DEMO_AGENT_API_KEY", input.invoiceKey],
    ["DEMO_PAYMENT_AGENT_API_KEY", input.paymentKey],
  ] as const) {
    if (!key || key.length < 32 || key.trim() !== key || /\s/.test(key)) {
      throw new Error(`${label} must be configured as a non-whitespace key of at least 32 characters`);
    }
  }
  if (input.invoiceKey === input.paymentKey) {
    throw new Error("Demo invoice and privileged payment keys must be distinct");
  }
}

export async function provisionSeparatedDemoPrincipals(input: {
  organizationId: string;
  invoicePrincipalId: string;
  paymentPrincipalId: string;
  invoiceKey: string;
  paymentKey: string;
}) {
  validateDemoPrincipalKeys(input);
  if (input.invoicePrincipalId === input.paymentPrincipalId) {
    throw new Error("Invoice and payment principal IDs must differ");
  }

  await db.transaction(async (tx) => {
    const existing = await tx.select({
      id: apiPrincipals.id,
      organizationId: apiPrincipals.organizationId,
    }).from(apiPrincipals).where(inArray(apiPrincipals.id, [
      input.invoicePrincipalId,
      input.paymentPrincipalId,
    ]));
    if (existing.some((row) => row.organizationId !== input.organizationId)) {
      throw new Error("Demo principal is owned by another organization");
    }

    await tx.insert(apiPrincipals).values({
      id: input.invoicePrincipalId,
      organizationId: input.organizationId,
      name: "Synthetic Invoice Observer",
      keyHash: hashAgentKey(input.invoiceKey),
      scopes: [...INVOICE_AGENT_SCOPES],
      active: true,
    }).onConflictDoUpdate({
      target: apiPrincipals.id,
      set: {
        name: "Synthetic Invoice Observer",
        keyHash: hashAgentKey(input.invoiceKey),
        scopes: [...INVOICE_AGENT_SCOPES],
        active: true,
      },
    });

    await tx.insert(apiPrincipals).values({
      id: input.paymentPrincipalId,
      organizationId: input.organizationId,
      name: "Synthetic Trusted Payment Submitter",
      keyHash: hashAgentKey(input.paymentKey),
      scopes: [...TRUSTED_PAYMENT_AGENT_SCOPES],
      active: true,
    }).onConflictDoUpdate({
      target: apiPrincipals.id,
      set: {
        name: "Synthetic Trusted Payment Submitter",
        keyHash: hashAgentKey(input.paymentKey),
        scopes: [...TRUSTED_PAYMENT_AGENT_SCOPES],
        active: true,
      },
    });
  });
}
