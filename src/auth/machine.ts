import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import { apiPrincipals } from "../db/schema";
import { isValidSeparatedMachineScopes } from "./principal-scopes";

export type AgentPrincipal = {
  id: string;
  organizationId: string;
  scopes: string[];
};

function keyHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function authenticateAgent(
  authorization: string | null,
  requiredScope: string,
): Promise<AgentPrincipal | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const rawKey = authorization.slice("Bearer ".length).trim();
  if (!rawKey) return null;

  const [principal] = await db
    .select({
      id: apiPrincipals.id,
      organizationId: apiPrincipals.organizationId,
      scopes: apiPrincipals.scopes,
      active: apiPrincipals.active,
    })
    .from(apiPrincipals)
    .where(eq(apiPrincipals.keyHash, keyHash(rawKey)))
    .limit(1);

  if (!principal?.active || !isValidSeparatedMachineScopes(principal.scopes) || !principal.scopes.includes(requiredScope)) return null;
  return principal;
}

export function hashAgentKey(value: string) {
  return keyHash(value);
}
