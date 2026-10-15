import { loadLocalEnv } from "../src/env/load";
loadLocalEnv();

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const email = process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local";
if (email !== "admin@mandategate.local") throw Error("Only the synthetic demo admin can be recovered");
const password = required("DEMO_ADMIN_PASSWORD");
const invoiceKey = required("DEMO_AGENT_API_KEY");
const paymentKey = required("DEMO_PAYMENT_AGENT_API_KEY");
if (password.length < 16) throw Error("Demo password must be >=16 characters");

const [{ hashPassword }, { auth }, { pool }, { provisionSeparatedDemoPrincipals }] = await Promise.all([
  import("better-auth/crypto"),
  import("../src/auth/auth"),
  import("../src/db/pool"),
  import("../src/auth/principal-provisioning"),
]);
try {
  const user = await pool.query('select id from "user" where email=$1', [email]);
  if (user.rowCount !== 1) throw Error("Synthetic admin user missing or duplicated");
  const account = await pool.query(
    'select id from account where "userId"=$1 and "providerId"=$2',
    [user.rows[0].id, "credential"],
  );
  if (account.rowCount !== 1) throw Error("Expected exactly one credential account");
  const hash = await hashPassword(password);
  await pool.query('update account set password=$1, "updatedAt"=now() where id=$2', [hash,account.rows[0].id]);
  await provisionSeparatedDemoPrincipals({
    organizationId:"org_demo",
    invoicePrincipalId:"principal_demo_ops",
    paymentPrincipalId:"principal_demo_payments",
    invoiceKey,
    paymentKey,
  });
  await auth.api.signInEmail({body:{email,password,rememberMe:false}});
  console.log("Synthetic demo admin sign-in verified; separated API principals configured");
} finally {
  await pool.end();
}
