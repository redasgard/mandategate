import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool";
import { authenticateAgent, hashAgentKey } from "../src/auth/machine";
import {
  provisionSeparatedDemoPrincipals,
  validateDemoPrincipalKeys,
} from "../src/auth/principal-provisioning";
import { isValidSeparatedMachineScopes } from "../src/auth/principal-scopes";

const organizationId = "scope_test_" + randomUUID();
const secondOrganizationId = "scope_test_" + randomUUID();
const invoicePrincipalId = "scope_invoice_" + randomUUID();
const paymentPrincipalId = "scope_payment_" + randomUUID();
const legacyKey = "mg_legacy_ci_" + randomUUID();
const invoiceKey = "mg_invoice_ci_" + randomUUID();
const paymentKey = "mg_payment_ci_" + randomUUID();

const input = {
  organizationId,
  invoicePrincipalId,
  paymentPrincipalId,
  invoiceKey,
  paymentKey,
};

const auth = async (key: string, requiredScope: string) =>
  authenticateAgent(`Bearer ${key}`, requiredScope);

beforeAll(async () => {
  await pool.query(
    "insert into organizations (id, name) values ($1, 'Scope test'), ($2, 'Other scope test')",
    [organizationId, secondOrganizationId],
  );
  await pool.query(
    [
      "insert into api_principals (id, organization_id, name, key_hash, scopes, active)",
      "values ($1, $2, 'Legacy Shared Invoice Principal', $3, $4::jsonb, true)",
    ].join(" "),
    [
      invoicePrincipalId,
      organizationId,
      hashAgentKey(legacyKey),
      JSON.stringify(["invoice:submit", "payment:read"]),
    ],
  );
});

afterAll(async () => {
  await pool.query("delete from api_principals where id = any($1::text[])", [[invoicePrincipalId, paymentPrincipalId]]);
  await pool.query("delete from organizations where id = any($1::text[])", [[organizationId, secondOrganizationId]]);
  await pool.end();
});

describe("Gate A: machine principal authority separation", () => {
  it("rejects legacy shared invoice scope even before migration", async () => {
    expect(isValidSeparatedMachineScopes(["invoice:submit", "payment:read"])).toBe(false);
    expect(await auth(legacyKey, "payment:submit")).toBeNull();
    expect(await auth(legacyKey, "invoice:upload")).toBeNull();
    expect(await auth(legacyKey, "payment:read")).toBeNull();
  });

  it("migrates the legacy principal and installs a distinct privileged key atomically", async () => {
    await provisionSeparatedDemoPrincipals(input);
    const { rows } = await pool.query(
      "select id, key_hash, scopes from api_principals where organization_id = $1 order by id",
      [organizationId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === invoicePrincipalId)).toMatchObject({
      key_hash: hashAgentKey(invoiceKey),
      scopes: ["invoice:upload", "invoice:analyze", "invoice:read"],
    });
    expect(rows.find((r) => r.id === paymentPrincipalId)).toMatchObject({
      key_hash: hashAgentKey(paymentKey),
      scopes: ["payment:submit", "payment:read"],
    });
    expect(await auth(legacyKey, "payment:submit")).toBeNull();
    expect(await auth(legacyKey, "invoice:upload")).toBeNull();
  });

  it("allows each role only its permitted API capability", async () => {
    for (const scope of ["invoice:upload", "invoice:analyze", "invoice:read"]) {
      expect(await auth(invoiceKey, scope)).toMatchObject({ organizationId });
      expect(await auth(paymentKey, scope)).toBeNull();
    }
    for (const scope of ["payment:submit", "payment:read"]) {
      expect(await auth(invoiceKey, scope)).toBeNull();
      expect(await auth(paymentKey, scope)).toMatchObject({ organizationId });
    }
    expect(await auth(invoiceKey, "invoice:submit")).toBeNull();
  });

  it("cannot provision dual-role keys or unsafe key lengths", async () => {
    expect(() => validateDemoPrincipalKeys({
      invoiceKey,
      paymentKey: invoiceKey,
    })).toThrow(/distinct/);
    expect(() => validateDemoPrincipalKeys({
      invoiceKey: "short",
      paymentKey,
    })).toThrow(/DEMO_AGENT_API_KEY/);
    expect(() => validateDemoPrincipalKeys({
      invoiceKey,
      paymentKey: " with space " + paymentKey,
    })).toThrow(/DEMO_PAYMENT_AGENT_API_KEY/);
    await expect(provisionSeparatedDemoPrincipals({
      ...input,
      paymentKey: invoiceKey,
    })).rejects.toThrow(/distinct/);
  });

  it("rejects mixed payment and invoice privileges in PostgreSQL", async () => {
    await expect(pool.query(
      "update api_principals set scopes = $2::jsonb where id = $1",
      [
        invoicePrincipalId,
        JSON.stringify(["invoice:analyze", "payment:submit"]),
      ],
    )).rejects.toMatchObject({ code: "23514" });
    expect(await auth(invoiceKey, "payment:submit")).toBeNull();
  });

  it("rejects attempted organization reassignment of an existing principal", async () => {
    await expect(provisionSeparatedDemoPrincipals({
      ...input,
      organizationId: secondOrganizationId,
    })).rejects.toThrow(/another organization/);
    expect(await auth(paymentKey, "payment:submit")).toMatchObject({ organizationId });
  });

  it("reseeding is idempotent and retains the exact separated authority matrix", async () => {
    await provisionSeparatedDemoPrincipals(input);
    const { rows } = await pool.query(
      "select count(*)::int as count from api_principals where organization_id = $1",
      [organizationId],
    );
    expect(rows[0].count).toBe(2);
    expect(await auth(invoiceKey, "payment:submit")).toBeNull();
    expect(await auth(paymentKey, "invoice:analyze")).toBeNull();
  });
});
