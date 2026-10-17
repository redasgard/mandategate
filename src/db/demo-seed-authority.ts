import { db } from "./db";
import {
  organizations, vendors, vendorDestinations, policies,
} from "./schema";

/**
 * First-install-only synthetic fixture bootstrap. Startup is NOT an
 * administrative trust reset: a revoked recipient, disabled policy, edited
 * vendor threshold, or renamed organization must remain unchanged.
 *
 * Demo data is fixture data, not proof of an authenticated external issuer.
 */
export async function ensureDemoAuthorityFixture(input: {
  organizationId: string;
  vendorId: string;
  destinationId: string;
  policyId: string;
  receiver: string;
}) {
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id: input.organizationId, name: "MandateGate Demo Org",
    }).onConflictDoNothing();

    await tx.insert(vendors).values({
      id: input.vendorId, organizationId: input.organizationId,
      name: "Northstar Components", normalMaxAmountCents: 250_000,
    }).onConflictDoNothing();

    await tx.insert(vendorDestinations).values({
      id: input.destinationId, vendorId: input.vendorId,
      destination: input.receiver, trusted: true,
    }).onConflictDoNothing();

    await tx.insert(policies).values({
      id: input.policyId, organizationId: input.organizationId,
      name: "Demo AP authority", autoPayMaxAmountCents: 300_000,
      active: true,
    }).onConflictDoNothing();
  });
}
