import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "../src/db/pool";
import { listRecentDecisions, getDecisionDetail } from "../src/db/views";
import { readDashboardSummary } from "../src/db/dashboard-overview";

// A dedicated Better Auth user avoids the seeded demo admin's other memberships
// and lets every count be asserted exactly instead of relying on >= 1.
const actorId = randomUUID();
const ownOrg = "dashboard_own_" + randomUUID();
const foreignOrg = "dashboard_foreign_" + randomUUID();
const ownVendor = "dashboard_vendor_" + randomUUID();
const foreignVendor = "dashboard_vendor_" + randomUUID();
const recordIds: string[] = [];
const recordByInvoice = new Map<string, string>();
const foreignPendingIds: string[] = [];

type TestRecord = {
  org: "own" | "foreign";
  invoice: string;
  status: "ESCALATED" | "DENIED" | "ALLOWED";
  cents: number;
  currency?: string;
  execution?: "PAID" | "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION";
  priorMonth?: boolean;
  daysAhead?: number;
};

async function insertRecord(row: TestRecord) {
  const id = randomUUID();
  const logicalId = randomUUID();
  recordIds.push(id);
  recordByInvoice.set(row.invoice, id);
  const organizationId = row.org === "own" ? ownOrg : foreignOrg;
  const vendorId = row.org === "own" ? ownVendor : foreignVendor;
  await pool.query([
    "insert into payment_requests",
    "(id,logical_payment_id,organization_id,vendor_id,invoice_number,amount_cents,",
    "currency,requested_destination,status,source,created_at)",
    "values($1,$2,$3,$4,$5,$6,$7,'synthetic@mandategate.test',$8,'demo_fixture',",
    "now() + $9::int * interval '1 day')",
  ].join(" "), [
    id, logicalId, organizationId, vendorId, row.invoice,
    row.cents, row.currency ?? "USD", row.status, row.daysAhead ?? 0,
  ]);
  const outcome = row.status === "ESCALATED" ? "ESCALATE" :
    row.status === "DENIED" ? "DENY" : "ALLOW";
  await pool.query(
    "insert into payment_decisions (id,payment_request_id,outcome,reason_codes,evidence) " +
    "values($1,$2,$3,'[]'::jsonb,'[]'::jsonb)",
    [randomUUID(), id, outcome],
  );
  if (row.execution) {
    // Test fixtures only: no gateway/API invocation and no actual transfer.
    const submitted = row.priorMonth
      ? "(date_trunc('month', now() at time zone 'UTC') at time zone 'UTC') - interval '1 second'"
      : "now()";
    await pool.query([
      "insert into payment_executions",
      "(id,payment_request_id,logical_payment_id,status,paypal_request_id,",
      "sender_batch_id,sender_item_id,submitted_at)",
      `values($1,$2,$3,$4,$5,$6,$7,${submitted})`,
    ].join(" "), [
      randomUUID(), id, logicalId, row.execution,
      "test_req_" + randomUUID(), "test_batch_" + randomUUID(),
      "test_item_" + randomUUID(),
    ]);
  }
  return id;
}

const emptyDashboard = {
  pendingReview: 0,
  denied: 0,
  payoutUnknown: 0,
  paidThisMonth: [],
  pendingInvoices: [],
};

beforeAll(async () => {
  await pool.query(
    'insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") ' +
    "values($1,'Dashboard synthetic reviewer',$2,false,now(),now())",
    [actorId, `dashboard-${actorId}@mandategate.test`],
  );
  await pool.query(
    "insert into organizations(id,name) values($1,'Dashboard owned test'),($2,'Dashboard foreign test')",
    [ownOrg, foreignOrg],
  );
  await pool.query(
    "insert into organization_admin_memberships(user_id,organization_id,role,active) " +
    "values($1,$2,'ADMIN',true)",
    [actorId, ownOrg],
  );
  await pool.query(
    "insert into vendors(id,organization_id,name,normal_max_amount_cents) " +
    "values($1,$2,'Owned synthetic vendor',999999),($3,$4,'Foreign synthetic vendor',999999)",
    [ownVendor, ownOrg, foreignVendor, foreignOrg],
  );

  // The foreign invoices MUST dominate an unfiltered top-six result.
  // This detects a missing tenant predicate even with LIMIT 6.
  await insertRecord({ org: "own", invoice: "OWN-PENDING", status: "ESCALATED", cents: 101, daysAhead: 20 });
  for (let i = 0; i < 7; i++) {
    foreignPendingIds.push(await insertRecord({
      org: "foreign", invoice: `FOREIGN-PENDING-${i}`,
      status: "ESCALATED", cents: 201 + i, daysAhead: 30,
    }));
  }
  await insertRecord({ org: "own", invoice: "OWN-DENIED", status: "DENIED", cents: 302 });
  await insertRecord({ org: "foreign", invoice: "FOREIGN-DENIED", status: "DENIED", cents: 402 });
  await insertRecord({
    org: "own", invoice: "OWN-UNKNOWN", status: "ALLOWED", cents: 503,
    execution: "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION",
  });
  await insertRecord({
    org: "foreign", invoice: "FOREIGN-UNKNOWN", status: "ALLOWED", cents: 603,
    execution: "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION",
  });
  await insertRecord({ org: "own", invoice: "OWN-PAID-USD", status: "ALLOWED", cents: 1201, execution: "PAID" });
  await insertRecord({ org: "foreign", invoice: "FOREIGN-PAID-USD", status: "ALLOWED", cents: 900001, execution: "PAID" });
  await insertRecord({
    org: "own", invoice: "OWN-PAID-EUR", status: "ALLOWED", cents: 3405,
    currency: "EUR", execution: "PAID",
  });
  await insertRecord({
    org: "foreign", invoice: "FOREIGN-PAID-EUR", status: "ALLOWED", cents: 900003,
    currency: "EUR", execution: "PAID",
  });
  await insertRecord({
    org: "own", invoice: "OWN-OLD-PAID", status: "ALLOWED", cents: 9000,
    execution: "PAID", priorMonth: true,
  });
});

afterAll(async () => {
  try {
    await pool.query("delete from payment_executions where payment_request_id=any($1::text[])", [recordIds]);
    await pool.query("delete from payment_decisions where payment_request_id=any($1::text[])", [recordIds]);
    await pool.query("delete from payment_requests where id=any($1::text[])", [recordIds]);
    await pool.query("delete from vendors where id=any($1::text[])", [[ownVendor, foreignVendor]]);
    await pool.query("delete from organization_admin_memberships where user_id=$1", [actorId]);
    await pool.query("delete from organizations where id=any($1::text[])", [[ownOrg, foreignOrg]]);
    await pool.query('delete from "user" where id=$1', [actorId]);
  } finally {
    await pool.end();
  }
});

describe("PostgreSQL dashboard financial data authorization", () => {
  it("shows only the owned rows even when the top six unscoped rows are foreign", async () => {
    const unscoped = await pool.query(
      "select id from payment_requests where organization_id=any($1::text[]) " +
      "and status='ESCALATED' order by created_at desc,id desc limit 6",
      [[ownOrg, foreignOrg]],
    );
    expect(unscoped.rows).toHaveLength(6);
    expect(unscoped.rows.every(r => foreignPendingIds.includes(r.id))).toBe(true);
    const summary = await readDashboardSummary(actorId);
    expect(summary.pendingInvoices).toEqual([{
      id: recordByInvoice.get("OWN-PENDING"), invoice: "OWN-PENDING",
      vendor: "Owned synthetic vendor", cents: 101, currency: "USD", reasons: [],
    }]);
    expect(summary.pendingInvoices.every(x => !foreignPendingIds.includes(x.id))).toBe(true);
    const decisions = await listRecentDecisions(actorId, 100);
    expect(decisions.some(x => x.requestId === recordByInvoice.get("OWN-PENDING"))).toBe(true);
    expect(decisions.some(x => foreignPendingIds.includes(x.requestId))).toBe(false);
    expect(await getDecisionDetail(recordByInvoice.get("OWN-PENDING")!, actorId))
      .toMatchObject({ invoiceNumber: "OWN-PENDING" });
    expect(await getDecisionDetail(foreignPendingIds[0], actorId)).toBeNull();
  });

  it("excludes foreign aggregates and previous-month payouts exactly", async () => {
    const summary = await readDashboardSummary(actorId);
    expect(summary.pendingReview).toBe(1);
    expect(summary.denied).toBe(1);
    expect(summary.payoutUnknown).toBe(1);
    expect(summary.paidThisMonth).toEqual([
      { currency: "EUR", cents: "3405", count: 1 },
      { currency: "USD", cents: "1201", count: 1 },
    ]);
  });

  it("returns no financial data for nonmember or REVIEWER role", async () => {
    expect(await readDashboardSummary("no-member-" + randomUUID())).toEqual(emptyDashboard);
    await pool.query(
      "update organization_admin_memberships set role='REVIEWER' where user_id=$1 and organization_id=$2",
      [actorId, ownOrg],
    );
    try {
      expect(await readDashboardSummary(actorId)).toEqual(emptyDashboard);
      expect(await getDecisionDetail(recordByInvoice.get("OWN-PENDING")!, actorId)).toBeNull();
    } finally {
      await pool.query(
        "update organization_admin_memberships set role='ADMIN' where user_id=$1 and organization_id=$2",
        [actorId, ownOrg],
      );
    }
  });

  it("updates all projections when second-organization privileges change", async () => {
    const baseline = await readDashboardSummary(actorId);
    expect(baseline.pendingReview).toBe(1);
    expect(baseline.denied).toBe(1);
    expect(baseline.payoutUnknown).toBe(1);

    await pool.query(
      "insert into organization_admin_memberships(user_id,organization_id,role,active) " +
      "values($1,$2,'REVIEWER',true)",
      [actorId, foreignOrg],
    );
    try {
      // Having a membership is not enough. Only current, active ADMIN works.
      expect(await readDashboardSummary(actorId)).toEqual(baseline);
      expect(await getDecisionDetail(foreignPendingIds[0], actorId)).toBeNull();
      await pool.query(
        "update organization_admin_memberships set role='ADMIN' " +
        "where user_id=$1 and organization_id=$2",
        [actorId, foreignOrg],
      );
      const both = await readDashboardSummary(actorId);
      expect(both.pendingReview).toBe(8);
      expect(both.denied).toBe(2);
      expect(both.payoutUnknown).toBe(2);
      expect(both.paidThisMonth).toEqual([
        { currency: "EUR", cents: "903408", count: 2 },
        { currency: "USD", cents: "901202", count: 2 },
      ]);
      expect(both.pendingInvoices).toHaveLength(6);
      expect(both.pendingInvoices.every(x => foreignPendingIds.includes(x.id))).toBe(true);
      expect(await getDecisionDetail(foreignPendingIds[0], actorId))
        .toMatchObject({requestId: foreignPendingIds[0]});

      await pool.query(
        "update organization_admin_memberships set active=false " +
        "where user_id=$1 and organization_id=$2",
        [actorId, foreignOrg],
      );
      expect(await readDashboardSummary(actorId)).toEqual(baseline);
      expect(await getDecisionDetail(foreignPendingIds[0], actorId)).toBeNull();
    } finally {
      await pool.query(
        "delete from organization_admin_memberships where user_id=$1 and organization_id=$2",
        [actorId, foreignOrg],
      );
    }
  });

  it("treats injection-shaped actor identity only as a bound value", async () => {
    const attacker = actorId + "' OR m.active=true OR 'x'='x";
    expect(await readDashboardSummary(attacker)).toEqual(emptyDashboard);
    expect(await getDecisionDetail(foreignPendingIds[0], attacker)).toBeNull();
    expect(await listRecentDecisions(attacker, 100)).toEqual([]);
  });

  it("kills four executable SQL authorization mutants against real PostgreSQL", async () => {
    const originalQuery = pool.query.bind(pool) as unknown as
      (statement: string, parameters?: unknown[]) => Promise<{rows: unknown[]}>;
    const mutants = [
      {name:"organization correlation",needle:"m.organization_id=pr.organization_id",
        substitute:"m.organization_id=m.organization_id",membership:"ADMIN"},
      {name:"actor binding",needle:"m.user_id=$1",
        substitute:"m.user_id=m.user_id and $1::text is not null",membership:"ADMIN"},
      {name:"ADMIN role",needle:"m.role='ADMIN'",
        substitute:"m.role=m.role",membership:"REVIEWER"},
      {name:"active membership",needle:"m.active=true",
        substitute:"m.active=m.active",membership:"INACTIVE"},
    ] as const;
    for (const mutant of mutants) {
      if(mutant.membership==="REVIEWER") {
        await pool.query(
          "update organization_admin_memberships set role='REVIEWER' where user_id=$1 and organization_id=$2",
          [actorId,ownOrg],
        );
      }
      if(mutant.membership==="INACTIVE") {
        await pool.query(
          "update organization_admin_memberships set active=false where user_id=$1 and organization_id=$2",
          [actorId,ownOrg],
        );
      }
      try {
        const queriedActor=mutant.name==="actor binding" ? "no-member-"+randomUUID() : actorId;
        const baseline=await readDashboardSummary(queriedActor);
        expect(baseline.pendingReview).toBe(mutant.name==="actor binding" ? 0 : mutant.membership==="ADMIN" ? 1 : 0);
        let changed = 0;
        const spy = vi.spyOn(pool, "query").mockImplementation(
          ((statement:string,parameters?:unknown[]) => {
            if (typeof statement !== "string" || !statement.includes("organization_admin_memberships"))
              return originalQuery(statement,parameters);
            if (!statement.includes(mutant.needle))
              throw Error("MUTATION_ANCHOR_NOT_IN_SQL: "+mutant.name);
            changed++;
            return originalQuery(statement.replace(mutant.needle,mutant.substitute),parameters);
          }) as typeof pool.query,
        );
        try {
          const result=await readDashboardSummary(queriedActor);
          expect(changed,mutant.name+" mutated queries").toBe(3);
          expect(result,mutant.name+" is a surviving SQL mutant").not.toEqual(baseline);
        } finally {
          spy.mockRestore();
        }
      } finally {
        if(mutant.membership==="REVIEWER") {
          await pool.query(
            "update organization_admin_memberships set role='ADMIN' where user_id=$1 and organization_id=$2",
            [actorId,ownOrg],
          );
        }
        if(mutant.membership==="INACTIVE") {
          await pool.query(
            "update organization_admin_memberships set active=true where user_id=$1 and organization_id=$2",
            [actorId,ownOrg],
          );
        }
      }
    }
  });

  it("removes every aggregate and invoice from an already authenticated user after revocation", async () => {
    expect((await readDashboardSummary(actorId)).pendingReview).toBe(1);
    await pool.query(
      "update organization_admin_memberships set active=false where user_id=$1 and organization_id=$2",
      [actorId, ownOrg],
    );
    try {
      expect(await readDashboardSummary(actorId)).toEqual(emptyDashboard);
      expect(await listRecentDecisions(actorId, 100)).toEqual([]);
      expect(await getDecisionDetail(recordByInvoice.get("OWN-PENDING")!, actorId)).toBeNull();
    } finally {
      await pool.query(
        "update organization_admin_memberships set active=true where user_id=$1 and organization_id=$2",
        [actorId, ownOrg],
      );
    }
    expect((await readDashboardSummary(actorId)).pendingReview).toBe(1);
  });
});
