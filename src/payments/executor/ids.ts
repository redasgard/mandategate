import { createHash } from "node:crypto";

function digest(seed: string) {
  return createHash("sha256").update(seed).digest("hex");
}

export function derivePayPalIds(logicalPaymentId: string) {
  const d = digest(`mandategate:${logicalPaymentId}`);
  const uuid = `${d.slice(0, 8)}-${d.slice(8, 12)}-5${d.slice(13, 16)}-a${d.slice(17, 20)}-${d.slice(20, 32)}`;
  return {
    paypalRequestId: uuid,
    senderBatchId: `mg-batch-${d.slice(0, 40)}`,
    senderItemId: `mg-item-${d.slice(24, 64)}`,
  };
}
