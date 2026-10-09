import { describe, expect, it } from "vitest";
import { GATE_H_DATABASE_HOST, GATE_H_DATABASE_NAME, GATE_H_DATABASE_USER,
  requireStagingDatabaseTarget, verifyStagingDatabaseIdentity
} from "../src/staging/database-guard";

const valid:NodeJS.ProcessEnv={
  ...process.env,
  MANDATEGATE_STAGING:"1",
  DATABASE_URL:`postgresql://${GATE_H_DATABASE_USER}:temporary-test-only@${GATE_H_DATABASE_HOST}/${GATE_H_DATABASE_NAME}`,
  BETTER_AUTH_URL:"https://mandategate-gate-h-staging.onrender.com",
  BETTER_AUTH_SECRET:"a".repeat(64),
  DEMO_ADMIN_EMAIL:"staging-review@example.test",
  DEMO_ADMIN_PASSWORD:"test-not-a-live-secret",
  DEMO_AGENT_API_KEY:"b".repeat(64),
  DEMO_PAYMENT_AGENT_API_KEY:"c".repeat(64),
  PAYPAL_BASE_URL:"https://api-m.sandbox.paypal.com",
  RUN_SLICE2_SANDBOX_PROOF:"0",
  RUN_DEMO_CREDENTIAL_ROTATION:"0",
};
describe("Render staging isolated DB check",()=>{
  it("leaves the existing stable service unaffected",()=>{
    expect(requireStagingDatabaseTarget({...valid,MANDATEGATE_STAGING:"0"})).toBe(false);
  });
  it("accepts only the dedicated database host, user and db name",()=>{
    expect(requireStagingDatabaseTarget(valid)).toBe(true);
    for (const bad of [
      {DATABASE_URL:undefined},
      {DATABASE_URL:"invalid"},
      {DATABASE_URL:"postgresql://other:pass@localhost/stable"},
      {DATABASE_URL:`postgresql://${GATE_H_DATABASE_USER}:pass@${GATE_H_DATABASE_HOST}/wrong`},
      {DATABASE_URL:`postgresql://other:pass@${GATE_H_DATABASE_HOST}/${GATE_H_DATABASE_NAME}`},
      {BETTER_AUTH_URL:"https://mandategate-web.onrender.com"},
      {BETTER_AUTH_SECRET:"short"},
      {DEMO_ADMIN_PASSWORD:undefined},
      {DEMO_AGENT_API_KEY:undefined},
      {DEMO_PAYMENT_AGENT_API_KEY:valid.DEMO_AGENT_API_KEY},
      {PAYPAL_BASE_URL:"https://api-m.paypal.com"},
      {RUN_SLICE2_SANDBOX_PROOF:"1"},
    ]) {
      expect(()=>requireStagingDatabaseTarget({...valid,...bad})).toThrow();
    }
  });
  it("confirms actual connected database using a read-only query",async()=>{
    const calls:string[]=[];
    const actual=await verifyStagingDatabaseIdentity({query:async(sql)=>{
      calls.push(sql);
      return {rows:[{database_name:GATE_H_DATABASE_NAME}]};
    }});
    expect(actual).toBe(GATE_H_DATABASE_NAME);
    expect(calls).toEqual(["select current_database() as database_name"]);
  });
  it("fails closed on wrong DB or connection errors without leaking secrets",async()=>{
    await expect(verifyStagingDatabaseIdentity({query:async()=>({
      rows:[{database_name:"mandategate_sandbox_db"}],
    })})).rejects.toThrow("STAGING_CONNECTED_DATABASE_MISMATCH");
    await expect(verifyStagingDatabaseIdentity({query:async()=>{
      throw new Error("credential contents must stay hidden");
    }})).rejects.toThrow("STAGING_DATABASE_CONNECTION_FAILED");
  });
});
