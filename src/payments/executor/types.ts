export type DecisionOutcome = "ALLOW" | "APPROVED" | "ESCALATE" | "DENY";

export type ExecutionStatus =
  | "READY"
  | "SUBMITTING"
  | "EXECUTING"
  | "PAID"
  | "PAYMENT_FAILED"
  | "PAYMENT_BLOCKED"
  | "PAYMENT_HELD"
  | "PAYMENT_UNCLAIMED"
  | "PAYMENT_RETURNED"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_REVERSED"
  | "PAYMENT_STATUS_UNKNOWN"
  | "PAYMENT_UNKNOWN"
  | "PAYMENT_UNKNOWN_MANUAL_RECONCILIATION";

export type AuthoritativePayment = {
  requestId: string;
  logicalPaymentId: string;
  amountCents: number;
  currency: string;
  requestedDestination: string;
  currentTrustedDestination: string;
  decisionOutcome: DecisionOutcome;
  invoiceNumber: string;
};

export type ExecutionRecord = {
  id: string;
  paymentRequestId: string;
  logicalPaymentId: string;
  status: ExecutionStatus;
  paypalRequestId: string;
  senderBatchId: string;
  senderItemId: string;
  paypalPayoutBatchId: string | null;
  paypalPayoutItemId: string | null;
  rawPaypalStatus: string | null;
  claimedAt: Date | null;
  createdAt: Date;
  submittedAt: Date | null;
  lastReconciledAt: Date | null;
  outcomeUnknownSince: Date | null;
};

export type PayoutSubmission = {
  paypalRequestId: string;
  senderBatchId: string;
  senderItemId: string;
  receiver: string;
  amountCents: number;
  currency: string;
  note: string;
};

export type PayoutSubmissionResult = { payoutBatchId: string };

export type PayoutItemSnapshot = {
  payoutItemId: string;
  payoutBatchId: string;
  transactionStatus: string;
};

export type RemoteStatusApplyResult = {
  execution: ExecutionRecord;
  applied: boolean;
};

export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    public readonly outcome: "DEFINITE_FAILURE" | "UNKNOWN",
    public readonly status?: number,
    public readonly debugId?: string,
  ) {
    super(message);
    this.name = "PaymentGatewayError";
  }
}

export interface PaymentGateway {
  createSinglePayout(input: PayoutSubmission): Promise<PayoutSubmissionResult>;
  getBatchItem(payoutBatchId: string): Promise<PayoutItemSnapshot>;
  getPayoutItem(payoutItemId: string): Promise<PayoutItemSnapshot>;
}

export interface ExecutionStore {
  getAuthoritativePayment(requestId: string): Promise<AuthoritativePayment | null>;
  getOrCreateExecution(payment: AuthoritativePayment): Promise<ExecutionRecord>;
  getExecution(logicalPaymentId: string): Promise<ExecutionRecord>;
  tryClaim(logicalPaymentId: string, allowed: ExecutionStatus[]): Promise<ExecutionRecord | null>;
  markSubmitted(logicalPaymentId: string, payoutBatchId: string, now: Date): Promise<ExecutionRecord>;
  markFailed(logicalPaymentId: string, rawStatus: string, now: Date): Promise<ExecutionRecord>;
  markBlocked(logicalPaymentId: string, reason: string, now: Date): Promise<ExecutionRecord>;
  markUnknown(logicalPaymentId: string, now: Date): Promise<ExecutionRecord>;
  markManualReconciliation(logicalPaymentId: string, now: Date): Promise<ExecutionRecord>;
  applyRemoteStatus(logicalPaymentId: string, snapshot: PayoutItemSnapshot, mappedStatus: ExecutionStatus, now: Date): Promise<RemoteStatusApplyResult>;
  appendEvent(logicalPaymentId: string, eventType: string, payload?: Record<string, unknown>, eventId?: string): Promise<void>;
}
