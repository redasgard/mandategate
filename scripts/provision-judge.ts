import { betterAuth } from "better-auth";
import { loadLocalEnv } from "../src/env/load";
import { DEMO_ORG_ID } from "../src/demo/scenarios";
import { judgeProvisioningAllowed } from "../src/demo/judge-provision-gate";

loadLocalEnv();
// This script never runs in startup/seed. Refuse unapproved or payment-capable
// modes BEFORE opening a shared database connection or creating an account.
if (process.env.JUDGE_ACCOUNT_PROVISION_APPROVED !== "YES")
  throw new Error("JUDGE_PROVISION_APPROVAL_REQUIRED");
if (!judgeProvisioningAllowed(process.env))
  throw new Error("JUDGE_REQUIRES_PAYMENT_DISABLED_NEON_PREVIEW");
const { pool } = await import("../src/db/pool");

const email = process.env.JUDGE_DEMO_EMAIL?.trim().toLowerCase();
const password = process.env.JUDGE_DEMO_PASSWORD;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password || password.length < 24) {
  throw new Error("JUDGE_EMAIL_AND_STRONG_PASSWORD_REQUIRED");
}
if (email === (process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local").toLowerCase())
  throw new Error("JUDGE_MUST_NOT_REUSE_DEVELOPMENT_ADMIN");
if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)
  throw new Error("BETTER_AUTH_SECRET_INVALID");

try {
  const prior = await pool.query('select id from "user" where lower(email)=$1', [email]);
  if (prior.rows.length > 0)
    throw new Error("JUDGE_ACCOUNT_EXISTS_REVIEW_MANUALLY");

  const oneTimeAuth = betterAuth({
    database: pool,
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      minPasswordLength: 24,
    },
  });
  await oneTimeAuth.api.signUpEmail({
    body: { name: "MandateGate Judge", email, password },
  });
  const created = await pool.query('select id from "user" where lower(email)=$1', [email]);
  if (created.rows.length !== 1)
    throw new Error("JUDGE_SIGNUP_NOT_PERSISTED");

  // Scope is exactly the synthetic organization, with no ADMIN membership.
  // No role upgrade, account promotion, or existing-member overwrite.
  await pool.query([
    "insert into organization_admin_memberships",
    "(user_id,organization_id,role,active) values ($1,$2,'REVIEWER',true)",
    "on conflict (user_id,organization_id) do nothing",
  ].join(" "), [created.rows[0].id, DEMO_ORG_ID]);
  const membership = await pool.query([
    "select role,active from organization_admin_memberships",
    "where organization_id=$1 and user_id=$2",
  ].join(" "), [DEMO_ORG_ID, created.rows[0].id]);
  if (membership.rows.length !== 1 ||
      membership.rows[0].role !== "REVIEWER" ||
      membership.rows[0].active !== true) {
    throw new Error("JUDGE_MEMBERSHIP_INVALID");
  }
  console.log("JUDGE_REVIEWER_PROVISIONED_NO_FINANCIAL_SCOPE");
  console.log("No password or session token is printed or stored in Git");
} finally {
  await pool.end();
}
