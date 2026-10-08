import { PaymentGatewayError } from "../executor/types";
import type { PaymentGateway, PayoutItemSnapshot, PayoutSubmission, PayoutSubmissionResult } from "../executor/types";

export type PayPalWebhookHeaders = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
};

type TokenCache = { token: string; expiresAtMs: number } | null;
type FetchLike = typeof fetch;

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseBatchIdFromLinks(body: any, baseUrl: string) {
  const links = Array.isArray(body?.links) ? body.links : [];
  for (const link of links) {
    if (typeof link?.href !== "string") continue;
    try {
      const url = new URL(link.href);
      if (url.origin !== new URL(baseUrl).origin) continue;
      const match = url.pathname.match(/\/v1\/payments\/payouts\/([^/]+)$/);
      if (match) return decodeURIComponent(match[1]);
    } catch {}
  }
  return null;
}

function formatCents(cents: number) {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error("amountCents must be a positive integer");
  return (cents / 100).toFixed(2);
}

export class PayPalPayoutsClient implements PaymentGateway {
  private tokenCache: TokenCache = null;

  constructor(
    private readonly config: {
      baseUrl: string;
      clientId: string;
      clientSecret: string;
      webhookId?: string;
      fetchImpl?: FetchLike;
      now?: () => number;
    },
  ) {
    const url = new URL(config.baseUrl);
    if (url.protocol !== "https:") throw new Error("PAYPAL_BASE_URL must use HTTPS");
    if (url.hostname !== "api-m.sandbox.paypal.com") {
      throw new Error("MandateGate hackathon build only permits the PayPal Sandbox API host");
    }
  }

  static fromEnv() {
    return new PayPalPayoutsClient({
      baseUrl: process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com",
      clientId: required("PAYPAL_CLIENT_ID", process.env.PAYPAL_CLIENT_ID),
      clientSecret: required("PAYPAL_CLIENT_SECRET", process.env.PAYPAL_CLIENT_SECRET),
      webhookId: process.env.PAYPAL_WEBHOOK_ID,
    });
  }

  private get fetchImpl() { return this.config.fetchImpl ?? fetch; }
  private get now() { return this.config.now?.() ?? Date.now(); }

  private async accessToken() {
    if (this.tokenCache && this.tokenCache.expiresAtMs - 60_000 > this.now) return this.tokenCache.token;
    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    const response = await this.fetchImpl(`${this.config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const body = await response.json().catch(() => ({})) as any;
    if (!response.ok || typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
      throw new PaymentGatewayError(`PAYPAL_OAUTH_${response.status}`, "DEFINITE_FAILURE", response.status, body?.debug_id);
    }
    this.tokenCache = { token: body.access_token, expiresAtMs: this.now + Math.max(1, body.expires_in) * 1000 };
    return body.access_token;
  }

  private async api(path: string, init: RequestInit = {}) {
    const token = await this.accessToken();
    const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({})) as any;
    return { response, body };
  }

  async createSinglePayout(input: PayoutSubmission): Promise<PayoutSubmissionResult> {
    let lastDebugId: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { response, body } = await this.api("/v1/payments/payouts", {
          method: "POST",
          headers: { "PayPal-Request-Id": input.paypalRequestId },
          body: JSON.stringify({
            sender_batch_header: {
              sender_batch_id: input.senderBatchId,
              email_subject: "MandateGate authorized payout",
            },
            items: [{
              recipient_type: "EMAIL",
              amount: { value: formatCents(input.amountCents), currency: input.currency },
              receiver: input.receiver,
              note: input.note.slice(0, 1000),
              sender_item_id: input.senderItemId,
            }],
          }),
        });
        lastDebugId = body?.debug_id;
        if (response.ok && typeof body?.batch_header?.payout_batch_id === "string") {
          return { payoutBatchId: body.batch_header.payout_batch_id };
        }

        if (body?.name === "BATCH_ALREADY_EXISTS") {
          const duplicateBatchId = parseBatchIdFromLinks(body, this.config.baseUrl);
          if (duplicateBatchId) return { payoutBatchId: duplicateBatchId };
        }

        if (response.status === 429 || response.status >= 500) {
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
            continue;
          }
          throw new PaymentGatewayError(`PAYPAL_TRANSIENT_${response.status}`, "UNKNOWN", response.status, body?.debug_id);
        }
        throw new PaymentGatewayError(body?.name ?? `PAYPAL_PAYOUT_${response.status}`, "DEFINITE_FAILURE", response.status, body?.debug_id);
      } catch (error) {
        if (error instanceof PaymentGatewayError) throw error;
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
          continue;
        }
        throw new PaymentGatewayError("PAYPAL_NETWORK_OUTCOME_UNKNOWN", "UNKNOWN", undefined, lastDebugId);
      }
    }
    throw new PaymentGatewayError("PAYPAL_NETWORK_OUTCOME_UNKNOWN", "UNKNOWN", undefined, lastDebugId);
  }

  async getBatchItem(payoutBatchId: string): Promise<PayoutItemSnapshot> {
    const { response, body } = await this.api(`/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}?page_size=1&total_required=true`);
    if (!response.ok) throw new PaymentGatewayError(`PAYPAL_BATCH_LOOKUP_${response.status}`, "UNKNOWN", response.status, body?.debug_id);
    const item = body?.items?.[0];
    if (!item?.payout_item_id || !item?.transaction_status) {
      throw new PaymentGatewayError("PAYPAL_BATCH_ITEM_NOT_READY", "UNKNOWN");
    }
    return { payoutItemId: item.payout_item_id, payoutBatchId, transactionStatus: item.transaction_status };
  }

  async getPayoutItem(payoutItemId: string): Promise<PayoutItemSnapshot> {
    const { response, body } = await this.api(`/v1/payments/payouts-item/${encodeURIComponent(payoutItemId)}`);
    if (!response.ok || !body?.payout_batch_id || !body?.transaction_status) {
      throw new PaymentGatewayError(`PAYPAL_ITEM_LOOKUP_${response.status}`, "UNKNOWN", response.status, body?.debug_id);
    }
    return { payoutItemId, payoutBatchId: body.payout_batch_id, transactionStatus: body.transaction_status };
  }

  async verifyWebhook(headers: PayPalWebhookHeaders, webhookEvent: unknown) {
    const webhookId = required("PAYPAL_WEBHOOK_ID", this.config.webhookId);
    const { response, body } = await this.api("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers.authAlgo,
        cert_url: headers.certUrl,
        transmission_id: headers.transmissionId,
        transmission_sig: headers.transmissionSig,
        transmission_time: headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      }),
    });
    return response.ok && body?.verification_status === "SUCCESS";
  }

  async getAvailableBalance(currency: string) {
    const { response, body } = await this.api(`/v1/reporting/balances?currency_code=${encodeURIComponent(currency)}`);
    if (!response.ok) throw new PaymentGatewayError(`PAYPAL_BALANCE_${response.status}`, "UNKNOWN", response.status, body?.debug_id);
    const available = body?.balances?.find((b: any) => b?.available_balance?.currency_code === currency)?.available_balance;
    if (!available || typeof available.value !== "string") return null;
    return { value: available.value, currency, asOfTime: body?.as_of_time ?? null };
  }
}
