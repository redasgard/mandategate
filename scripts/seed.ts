import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();

const [{ db }, { pool }, schema, { hashAgentKey }] = await Promise.all([
  import("../src/db/db"),
  import("../src/db/pool"),
  import("../src/db/schema"),
  import("../src/auth/machine"),
]);

const organizationId = "org_demo";
const vendorId = "vendor_northstar";
const policyId = "policy_demo_default";
const principalId = "principal_demo_ops";
const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local";
const configuredPassword = process.env.DEMO_ADMIN_PASSWORD;
const configuredAgentKey = process.env.DEMO_AGENT_API_KEY;
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

const [existingPrincipal] = await db
  .select({ id: schema.apiPrincipals.id })
  .from(schema.apiPrincipals)
  .where(eq(schema.apiPrincipals.id, principalId))
  .limit(1);

if (!existingPrincipal) {
  const rawKey = configuredAgentKey ?? `mg_demo_${randomBytes(24).toString("base64url")}`;
  await db.insert(schema.apiPrincipals).values({
    id: principalId,
    organizationId,
    name: "Synthetic Operations Agent",
    keyHash: hashAgentKey(rawKey),
    scopes: ["invoice:submit", "payment:read"],
    active: true,
  });
  console.log("demo agent principal created; API key material is intentionally not logged");
} else if (configuredAgentKey) {
  await db
    .update(schema.apiPrincipals)
    .set({ keyHash: hashAgentKey(configuredAgentKey), active: true })
    .where(eq(schema.apiPrincipals.id, principalId));
  console.log("demo agent API key synchronized from environment");
} else {
  console.log("demo agent exists; API key unchanged");
}

console.log(usingSandboxReceiver ? "sandbox receiver fixture enabled" : "synthetic receiver fixture enabled");
console.log(JSON.stringify({
  allow: { vendorId, invoiceNumber: "NS-1001", amountCents: 120000, currency: "USD", paymentDestination: usingSandboxReceiver ? "[configured sandbox receiver]" : trustedDestination },
  escalate: { vendorId, invoiceNumber: "NS-1002", amountCents: 280000, currency: "USD", paymentDestination: usingSandboxReceiver ? "[configured sandbox receiver]" : trustedDestination },
  deny: { vendorId, invoiceNumber: "NS-1003", amountCents: 120000, currency: "USD", paymentDestination: "[changed destination fixture]" }
}, null, 2));

await pool.end();
