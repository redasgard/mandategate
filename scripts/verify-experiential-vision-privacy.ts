import { loadLocalEnv } from "../src/env/load";
import {
  ExperientialInvoiceVisionGateway,
} from "../src/ai/gateway/experiential-vision";

loadLocalEnv();

// No invoice or image content is transmitted. This is a metadata-only
// privacy and model capability preflight for an authorized environment.
const gateway = new ExperientialInvoiceVisionGateway();
const receipt = await gateway.verifyPrivacyAndModel();

console.log(JSON.stringify({
  privacyPreflight: "PASS",
  ...receipt,
  note: "Verified provider account metadata only. Model serving ZDR headers and real inference are NOT verified by this preflight.",
}, null, 2));
