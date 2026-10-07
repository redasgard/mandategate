export type DecisionOutcome = "ALLOW" | "ESCALATE" | "DENY";

export type DecisionContext = {
  amountCents: number;
  currency: string;
  requestedDestination: string;
  trustedDestination: string;
  vendorNormalMaxAmountCents: number;
  policyAutoPayMaxAmountCents: number;
};

export type DecisionEvidence = {
  code: string;
  source: string;
  observed: string | number;
  expected?: string | number;
};

export type PaymentDecision = {
  outcome: DecisionOutcome;
  reasonCodes: string[];
  evidence: DecisionEvidence[];
};

export function evaluatePayment(context: DecisionContext): PaymentDecision {
  if (context.requestedDestination !== context.trustedDestination) {
    return {
      outcome: "DENY",
      reasonCodes: ["DESTINATION_MISMATCH"],
      evidence: [
        {
          code: "DESTINATION_MISMATCH",
          source: "vendor.trusted_destination",
          observed: context.requestedDestination,
          expected: context.trustedDestination,
        },
      ],
    };
  }

  const reasons: string[] = [];
  const evidence: DecisionEvidence[] = [];

  if (context.amountCents > context.vendorNormalMaxAmountCents) {
    reasons.push("AMOUNT_OUTSIDE_VENDOR_BASELINE");
    evidence.push({
      code: "AMOUNT_OUTSIDE_VENDOR_BASELINE",
      source: "vendor.normal_max_amount_cents",
      observed: context.amountCents,
      expected: context.vendorNormalMaxAmountCents,
    });
  }

  if (context.amountCents > context.policyAutoPayMaxAmountCents) {
    reasons.push("POLICY_AUTO_PAY_LIMIT_EXCEEDED");
    evidence.push({
      code: "POLICY_AUTO_PAY_LIMIT_EXCEEDED",
      source: "policy.auto_pay_max_amount_cents",
      observed: context.amountCents,
      expected: context.policyAutoPayMaxAmountCents,
    });
  }

  if (reasons.length > 0) {
    return { outcome: "ESCALATE", reasonCodes: reasons, evidence };
  }

  return {
    outcome: "ALLOW",
    reasonCodes: ["WITHIN_TRUSTED_BASELINE"],
    evidence: [
      {
        code: "WITHIN_TRUSTED_BASELINE",
        source: "deterministic_policy",
        observed: context.amountCents,
        expected: Math.min(
          context.vendorNormalMaxAmountCents,
          context.policyAutoPayMaxAmountCents,
        ),
      },
    ],
  };
}
