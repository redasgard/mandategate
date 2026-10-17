import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks=vi.hoisted(()=>({
  session:vi.fn(), scenarios:vi.fn(), evidence:vi.fn(),
}));
vi.mock("next/headers",()=>({headers:async()=>new Headers()}));
vi.mock("next/navigation",()=>({
  redirect:(path:string)=>{throw new Error("REDIRECT:"+path);},
  notFound:()=>{throw new Error("NOT_FOUND");},
}));
vi.mock("../src/auth/auth",()=>({
  auth:{api:{getSession:mocks.session}},
}));
vi.mock("../src/demo/scenarios",()=>({demoPreviewEnabled:()=>true}));
vi.mock("../src/demo/scenarios-store",()=>({
  listDemoScenarios:mocks.scenarios,
  DemoScenarioError:class DemoScenarioError extends Error {
    constructor(public httpStatus:number=404){super("DEMO_SCENARIO_ERROR");}
  },
}));
vi.mock("../src/demo/evidence",()=>({readDemoEvidence:mocks.evidence}));
vi.mock("../app/demo/load-button",()=>({
  LoadDemoScenarios:()=>"SAFE_DEMO_REPLAY_CONTROL",
}));
import DemoPage from "../app/demo/page";

const cases=[
  {id:"normal",title:"Normal vendor invoice",invoiceNumber:"DEMO-NORMAL-2026",
    amountCents:120000,expectedOutcome:"ALLOW",outcome:"ALLOW",
    explanation:"Known vendor under active policy",status:"READY",
    reasonCodes:["WITHIN_TRUSTED_BASELINE"],requestId:"11111111-1111-4111-8111-111111111111",hasExecution:false},
  {id:"anomaly",title:"Unusual vendor amount",invoiceNumber:"DEMO-ANOMALY-2026",
    amountCents:280000,expectedOutcome:"ESCALATE",outcome:"ESCALATE",
    explanation:"Above normal baseline",status:"ESCALATED",
    reasonCodes:["AMOUNT_OUTSIDE_VENDOR_BASELINE"],requestId:"22222222-2222-4222-8222-222222222222",hasExecution:false},
  {id:"substitution",title:"Changed invoice destination",invoiceNumber:"DEMO-SUBSTITUTION-2026",
    amountCents:120000,expectedOutcome:"DENY",outcome:"DENY",
    explanation:"Destination not trusted",status:"DENIED",
    reasonCodes:["DESTINATION_MISMATCH"],requestId:"33333333-3333-4333-8333-333333333333",hasExecution:false},
];
beforeEach(()=>{
  mocks.session.mockReset();
  mocks.scenarios.mockReset();
  mocks.evidence.mockReset();
  mocks.session.mockResolvedValue({user:{id:"demo-admin"}});
  mocks.scenarios.mockResolvedValue(cases);
  mocks.evidence.mockResolvedValue({findings:[],invoiceExecutionRows:0});
});
const render=async()=>renderToStaticMarkup(await DemoPage());

describe("judge-facing safe replay guide",()=>{
  it("shows three distinct proof paths without claiming that historical PayPal was invoice-derived",async()=>{
    const html=await render();
    expect(html).toContain("Three decisions. Zero payouts.");
    expect(html).toContain("Guided judge demonstration");
    expect(html).toContain('id="demo-ai-observations"');
    expect(html).toContain('id="demo-decisions"');
    expect(html).toContain('id="demo-payment-boundary"');
    expect(html).toContain("The historical direct PayPal Sandbox payout was a different workflow");
    expect(html).toContain("SAFE_DEMO_REPLAY_CONTROL");
    expect(mocks.scenarios).toHaveBeenCalledWith("demo-admin");
    expect(mocks.evidence).toHaveBeenCalledWith("demo-admin");
  });
  it("shows actual deterministic reason codes and source-linked evidence separately",async()=>{
    const html=await render();
    for(const reason of ["WITHIN_TRUSTED_BASELINE","AMOUNT_OUTSIDE_VENDOR_BASELINE","DESTINATION_MISMATCH"])
      expect(html).toContain(reason);
    expect(html).toContain("/payments/11111111-1111-4111-8111-111111111111");
    expect(html).toContain("No payment execution record for this synthetic request");
    expect(html).not.toContain("Sandbox payout successful");
  });
  it("halts replay if an execution record appears for any demo request",async()=>{
    mocks.scenarios.mockResolvedValue(cases.map((s,i)=>({...s,hasExecution:i===0})));
    const html=await render();
    expect(html).toContain("Replay halted: unexpected financial state");
    expect(html).toContain("inconsistent");
    expect(html).not.toContain("SAFE_DEMO_REPLAY_CONTROL");
  });
  it("halts replay if the actual outcome deviates from deterministic expectations",async()=>{
    mocks.scenarios.mockResolvedValue(cases.map((s,i)=>({...s,outcome:i===1?"ALLOW":s.outcome})));
    const html=await render();
    expect(html).toContain("Replay halted: unexpected financial state");
    expect(html).toContain("Actual decision differs");
    expect(html).not.toContain("SAFE_DEMO_REPLAY_CONTROL");
  });
});
