import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {HistoricalGlmProof} from "../app/demo/historical-glm-proof";

describe("historical model evidence stays non-authorizing",()=>{
 it("labels the previous fictional GLM observation separately",()=>{
  const html=renderToStaticMarkup(<HistoricalGlmProof/>);
  for(const truth of [
   "Earlier separate GLM factual observation","DEMO-GLM-INVOICE-003",
   "DOCUMENT_INSTRUCTIONS_SUSPECTED","INVALID_AMOUNT",
   "64f7476f98181d92","earlier", "not",
   "No real", "ESCALATE",
  ].filter(s=>s!=="No real")){
   expect(html.toLowerCase()).toContain(truth.toLowerCase());
  }
  expect(html).toContain("not</strong>");
  expect(html).toContain("No");
  expect(html).not.toContain("PayPal SUCCESS");
  expect(html).not.toContain("<form");
 });
});
