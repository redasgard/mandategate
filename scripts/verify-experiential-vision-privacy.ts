import { loadLocalEnv } from "../src/env/load";
import {
  ExperientialInvoiceVisionGateway,
  INVOICE_VISION_MODEL,
} from "../src/ai/gateway/experiential-vision";

loadLocalEnv();

// No invoice or image content is transmitted. This is a metadata-only
// privacy and model capability preflight for an authorized environment.
const gateway = new ExperientialInvoiceVisionGateway();
await gateway.verifyPrivacyAndModel();

console.log(JSON.stringify({
  model: INVOICE_VISION_MODEL,
  privacyPreflight: "PASS",
  accountZdr: true,
  noTraining: true,
  promptCaptureDisabled: true,
  note: "Metadata-only preflight. Real signed-in image inference remains separately unverified.",
}, null, 2));
