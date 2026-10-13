"use client";

export type AdvisoryFailure={
  title:string;
  explanation:string;
  resolution:string;
  preflightBlocked:boolean;
};

const failures:Record<string,AdvisoryFailure>={
  EXPERIENTIAL_ACCOUNT_ZDR_REQUIRED:{
    title:"AI observation blocked: full zero-data retention is not enabled",
    explanation:"The connected Experiential Labs account did not report full Zero Data Retention (ZDR). MandateGate requires it before submitting invoice content to GLM.",
    resolution:"Ask your Experiential Labs administrator to enable full account-level ZDR. Then use the privacy preflight page to check again.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_ACCOUNT_ZDR_PARTIAL:{
    title:"AI observation blocked: zero-data retention is only partial",
    explanation:"Experiential Labs reported that the account's ZDR configuration is partial. MandateGate requires full coverage before submitting invoice content.",
    resolution:"Have the provider administrator resolve partial ZDR coverage and rerun the privacy preflight.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_NO_TRAINING_POLICY_REQUIRED:{
    title:"AI observation blocked: provider privacy policy is incomplete",
    explanation:"The required zero-retention and no-training provider policies could not both be confirmed.",
    resolution:"Configure the Experiential Labs organization to enforce provider ZDR and no-training, then retry the privacy check.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_PROMPT_CAPTURE_MUST_BE_OFF:{
    title:"AI observation blocked: prompt-content logging is enabled or unverified",
    explanation:"MandateGate could not confirm that prompt-content capture is disabled.",
    resolution:"Disable prompt-content capture in the provider organization settings and rerun the check.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_FLASH_MODEL_UNAVAILABLE:{
    title:"AI observation blocked: the required model is unavailable",
    explanation:"The connected provider account does not advertise an acceptable GLM-5.3 Flash route.",
    resolution:"Confirm model access in Experiential Labs and retry the privacy preflight.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_FLASH_ZDR_ROUTE_UNAVAILABLE:{
    title:"AI observation blocked: the model's ZDR capability is unverified",
    explanation:"The required GLM model route did not advertise a supported zero-retention capability.",
    resolution:"Use a provider route that explicitly supports ZDR and rerun the check.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_API_KEY_REQUIRED:{
    title:"AI observation unavailable: provider credentials are missing",
    explanation:"The server has no Experiential Labs API credential configured.",
    resolution:"Configure the API credential in the server's secret settings. Do not paste credentials into this page.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_PREFLIGHT_UNAVAILABLE:{
    title:"AI privacy preflight unavailable",
    explanation:"MandateGate could not reach the provider's account-metadata service to confirm privacy settings.",
    resolution:"Check provider availability and server connectivity, then retry. Privacy protections remain enforced.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_PREFLIGHT_REFUSED:{
    title:"AI privacy preflight refused by the provider",
    explanation:"The connected provider did not accept a required metadata request, so its privacy guarantees remain unverified.",
    resolution:"Check the server credential's account permissions and provider status, then retry.",
    preflightBlocked:true,
  },
  EXPERIENTIAL_ORG_ID_UNVERIFIED:{
    title:"AI privacy preflight blocked: organization identity is unverified",
    explanation:"MandateGate could not validate the connected provider organization identifier.",
    resolution:"Check the Experiential Labs account linkage and rerun the preflight.",
    preflightBlocked:true,
  },
};
export function explainAdvisoryFailure(code:string):AdvisoryFailure{
  return failures[code]??{
    title:"AI observation could not be completed",
    explanation:"MandateGate stopped the optional AI operation. The technical code below identifies the failure. The request may have reached the provider if this happened after privacy preflight.",
    resolution:"Inspect the technical code and retry after resolving the provider or processing issue. You can continue non-AI invoice review.",
    preflightBlocked:false,
  };
}
export function AdvisoryErrorDetails({code,metadataOnly=false}:{code:string;metadataOnly?:boolean}){
  const info=explainAdvisoryFailure(code);
  return <section role="alert" className="advisory-error">
    <h3>{info.title}</h3>
    <p>{info.explanation}</p>
    <p><strong>Next step:</strong> {info.resolution}</p>
    <p className="muted">{metadataOnly?
      "This metadata-only check did not send invoice content or invoke the model.":
      info.preflightBlocked?
        "Blocked at privacy preflight. No invoice image was sent to the model and no payment was authorized.":
        "The AI request did not complete. Transmission status may be unknown. This action cannot authorize a payment."}
    </p>
    <details><summary>Technical details</summary><code>{code}</code></details>
  </section>;
}
