import { loadLocalEnv } from "../src/env/load";

loadLocalEnv();

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is required for credential rotation`);
  return value;
}

const adminEmail = process.env.DEMO_ADMIN_EMAIL ?? "admin@mandategate.local";
const previousAdminPassword = required("DEMO_ADMIN_PREVIOUS_PASSWORD", process.env.DEMO_ADMIN_PREVIOUS_PASSWORD);
const newAdminPassword = required("DEMO_ADMIN_PASSWORD", process.env.DEMO_ADMIN_PASSWORD);
const previousAgentKey = required("DEMO_AGENT_PREVIOUS_API_KEY", process.env.DEMO_AGENT_PREVIOUS_API_KEY);
const newAgentKey = required("DEMO_AGENT_API_KEY", process.env.DEMO_AGENT_API_KEY);

if (previousAdminPassword === newAdminPassword) {
  throw new Error("DEMO_ADMIN_PASSWORD must differ from the previous password");
}
if (previousAgentKey === newAgentKey) {
  throw new Error("DEMO_AGENT_API_KEY must differ from the previous key");
}

const [{ auth }, { authenticateAgent }, { pool }] = await Promise.all([
  import("../src/auth/auth"),
  import("../src/auth/machine"),
  import("../src/db/pool"),
]);

async function canSignIn(password: string) {
  try {
    await auth.api.signInEmail({
      body: { email: adminEmail, password, rememberMe: false },
    });
    return true;
  } catch {
    return false;
  }
}

async function rotateAdminPassword() {
  const oldWorks = await canSignIn(previousAdminPassword);
  const newWorks = await canSignIn(newAdminPassword);

  if (!oldWorks && newWorks) return;

  if (!oldWorks) {
    throw new Error("previous admin credential does not authenticate and new credential is not active");
  }

  const signedIn = await auth.api.signInEmail({
    returnHeaders: true,
    body: { email: adminEmail, password: previousAdminPassword, rememberMe: false },
  });

  const getSetCookie = (signedIn.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const setCookies = getSetCookie ? getSetCookie.call(signedIn.headers) : [];
  const cookieHeader = setCookies.map((value) => value.split(";", 1)[0]).join("; ");
  if (!cookieHeader) throw new Error("admin credential rotation could not obtain a session cookie");

  await auth.api.changePassword({
    body: {
      currentPassword: previousAdminPassword,
      newPassword: newAdminPassword,
      revokeOtherSessions: true,
    },
    headers: new Headers({ cookie: cookieHeader }),
  });
}

await rotateAdminPassword();

const [oldAdminWorks, newAdminWorks, oldAgent, newAgent] = await Promise.all([
  canSignIn(previousAdminPassword),
  canSignIn(newAdminPassword),
  authenticateAgent(`Bearer ${previousAgentKey}`, "invoice:submit"),
  authenticateAgent(`Bearer ${newAgentKey}`, "invoice:submit"),
]);

if (oldAdminWorks) throw new Error("previous admin password still authenticates after rotation");
if (!newAdminWorks) throw new Error("new admin password does not authenticate after rotation");
if (oldAgent) throw new Error("previous demo agent key still authenticates after rotation");
if (!newAgent) throw new Error("new demo agent key does not authenticate after rotation");

console.log(JSON.stringify({
  credentialRotationVerified: true,
  previousAdminCredentialRejected: true,
  newAdminCredentialAccepted: true,
  previousAgentCredentialRejected: true,
  newAgentCredentialAccepted: true,
}, null, 2));

await pool.end();
