import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();
const { requireStagingDatabaseTarget, verifyStagingDatabaseIdentity } =
  await import("../src/staging/database-guard");
const isolatedStage = requireStagingDatabaseTarget(process.env);

const [{ db }, { pool }, schema, { provisionSeparatedDemoPrincipals, validateDemoPrincipalKeys }] = await Promise.all([
  import("../src/db/db"),
  import("../src/db/pool"),
  import("../src/db/schema"),
  import("../src/auth/principal-provisioning"),
]);

if (isolatedStage) await verifyStagingDatabaseIdentity(pool);

const organizationId = "org_demo";
const vendorId = "vendor_northstar";
const policyId = "policy_demo_default";
const principalId = "principal_demo_ops";
const paymentPrincipalId = "principal_demo_payments";
const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local";
const configuredPassword = process.env.DEMO_ADMIN_PASSWORD;
const configuredAgentKey = process.env.DEMO_AGENT_API_KEY;
const configuredPaymentKey = process.env.DEMO_PAYMENT_AGENT_API_KEY;
// Validate both keys before any demo state is changed.
validateDemoPrincipalKeys({ invoiceKey: configuredAgentKey, paymentKey: configuredPaymentKey });
const trustedDestination = process.env.DEMO_PAYPAL_RECEIVER_EMAIL ?? "ap@northstar.example";
const usingSandboxReceiver = Boolean(process.env.DEMO_PAYPAL_RECEIVER_EMAIL);

await db
  .insert(schema.organizations)
  .values({ id: organizationId, name: "MandateGate Demo Org" })
  .onConflictDoUpdate({ target: schema.organizations.id, set: { name: "MandateGate Demo Org" } });

await db
  .insert(schema.vendors)
  .values({
    id: vendorId,
    organizationId,
    name: "Northstar Components",
    normalMaxAmountCents: 250_000,
  })
  .onConflictDoUpdate({
    target: schema.vendors.id,
    set: { name: "Northstar Components", normalMaxAmountCents: 250_000 },
  });

await db
  .insert(schema.vendorDestinations)
  .values({
    id: "dest_northstar_primary",
    vendorId,
    destination: trustedDestination,
    trusted: true,
  })
  .onConflictDoUpdate({
    target: schema.vendorDestinations.id,
    set: { destination: trustedDestination, trusted: true },
  });

await db
  .insert(schema.policies)
  .values({
    id: policyId,
    organizationId,
    name: "Demo AP authority",
    autoPayMaxAmountCents: 300_000,
    active: true,
  })
  .onConflictDoUpdate({
    target: schema.policies.id,
    set: { name: "Demo AP authority", autoPayMaxAmountCents: 300_000, active: true },
  });

const [existingAdmin] = await pool.query(
  'select id from "user" where email = $1 limit 1',
  [adminEmail],
).then((result) => result.rows);

if (!existingAdmin) {
  const password = configuredPassword ?? randomBytes(18).toString("base64url");
  const seedAuth = betterAuth({
    database: pool,
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    emailAndPassword: { enabled: true, disableSignUp: false, minPasswordLength: 12 },
  });

  await seedAuth.api.signUpEmail({
    body: { name: "Demo Admin", email: adminEmail, password },
  });
  console.log(`demo admin created: ${adminEmail}`);
  console.log("demo admin credential material is intentionally not logged");
} else {
  console.log(`demo admin exists: ${adminEmail}`);
}


// The demo-only known issuer channel is seeded independently of any invoice.
// Never infer these references from GLM output or fields inside the document.
const [verifiedDemoAdmin] = (await pool.query(
  'select id from "user" where email = $1 limit 1',
  [adminEmail],
)).rows;
if (!verifiedDemoAdmin) throw new Error("DEMO_ADMIN_NOT_PROVISIONED");
await pool.query(
  [
    "insert into organization_admin_memberships",
    "(user_id, organization_id, role, active) values ($1, $2, 'ADMIN', true)",
    "on conflict (user_id, organization_id) do nothing",
  ].join(" "),
  [verifiedDemoAdmin.id, organizationId],
);
await pool.query(
  [
    "insert into vendor_origin_channels",
    "(id, organization_id, vendor_id, kind, enrolled_evidence_sha256)",
    "values ($1, $2, $3, 'SYNTHETIC_FIXTURE', $4)",
    "on conflict (id) do nothing",
  ].join(" "),
  [
    "origin_channel_demo_synthetic_northstar",
    organizationId,
    vendorId,
    (await import("node:crypto")).createHash("sha256")
      .update("mandategate/synthetic-fixture/northstar/v1")
      .digest("hex"),
  ],
);

await provisionSeparatedDemoPrincipals({
  organizationId,
  invoicePrincipalId: principalId,
  paymentPrincipalId,
  invoiceKey: configuredAgentKey!,
  paymentKey: configuredPaymentKey!,
});
console.log("demo invoice and privileged payment principal roles synchronized (keys not logged)");

console.log(usingSandboxReceiver ? "sandbox receiver fixture enabled" : "synthetic receiver fixture enabled");
console.log(JSON.stringify({
  allow: { vendorId, invoiceNumber: "NS-1001", amountCents: 120000, currency: "USD", paymentDestination: usingSandboxReceiver ? "[configured sandbox receiver]" : trustedDestination },
  escalate: { vendorId, invoiceNumber: "NS-1002", amountCents: 280000, currency: "USD", paymentDestination: usingSandboxReceiver ? "[configured sandbox receiver]" : trustedDestination },
  deny: { vendorId, invoiceNumber: "NS-1003", amountCents: 120000, currency: "USD", paymentDestination: "[changed destination fixture]" }
}, null, 2));

await pool.end();
