/** Premium plan + Stripe Checkout (Web). Native IAP is out of scope for this MVP. */

export const FREE_MAX_OPEN_LISTINGS = 1;
export const PREMIUM_MAX_OPEN_LISTINGS = 5;
export const PREMIUM_DURATION_DAYS = 30;
/** JPY — Stripe Checkout `price_data` when STRIPE_PRICE_ID is unset. */
export const PREMIUM_PRICE_JPY = 480;
export const PREMIUM_PRODUCT_NAME = "ゲーム通話 プレミアム（30日）";

export type BillingConfig = {
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  /** Optional Stripe Price ID. When null, Checkout uses inline price_data. */
  stripePriceId: string | null;
  successUrl: string;
  cancelUrl: string;
  /** When true (default without Stripe key), POST /billing/mock-purchase works. */
  allowMockPurchase: boolean;
};

export type BillingEnvLike = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  BILLING_SUCCESS_URL?: string;
  BILLING_CANCEL_URL?: string;
  ALLOW_MOCK_PURCHASE?: string;
  /** Worker public URL used to build default success/cancel when unset. */
  BILLING_PUBLIC_BASE?: string;
};

export function readBillingConfigFromEnv(env: BillingEnvLike): BillingConfig {
  const stripeSecretKey = env.STRIPE_SECRET_KEY?.trim() || null;
  const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  const stripePriceId = env.STRIPE_PRICE_ID?.trim() || null;
  const publicBase = (env.BILLING_PUBLIC_BASE || "").replace(/\/$/, "");
  const successUrl =
    env.BILLING_SUCCESS_URL?.trim() ||
    (publicBase
      ? `${publicBase}/billing/success?session_id={CHECKOUT_SESSION_ID}`
      : "https://game-match-api.0v09979.workers.dev/billing/success?session_id={CHECKOUT_SESSION_ID}");
  const cancelUrl =
    env.BILLING_CANCEL_URL?.trim() ||
    (publicBase
      ? `${publicBase}/billing/cancel`
      : "https://game-match-api.0v09979.workers.dev/billing/cancel");

  const mockFlag = env.ALLOW_MOCK_PURCHASE?.trim().toLowerCase();
  const allowMockPurchase =
    mockFlag === "1" ||
    mockFlag === "true" ||
    (mockFlag !== "0" && mockFlag !== "false" && !stripeSecretKey);

  return {
    stripeSecretKey,
    stripeWebhookSecret,
    stripePriceId,
    successUrl,
    cancelUrl,
    allowMockPurchase,
  };
}

export function isPremiumActive(
  premiumUntil: string | null | undefined,
  now = new Date(),
): boolean {
  if (!premiumUntil) return false;
  const until = Date.parse(premiumUntil);
  if (Number.isNaN(until)) return false;
  return until > now.getTime();
}

export function maxOpenListingsFor(premium: boolean): number {
  return premium ? PREMIUM_MAX_OPEN_LISTINGS : FREE_MAX_OPEN_LISTINGS;
}

export function extendPremiumUntil(
  currentUntil: string | null | undefined,
  now = new Date(),
): string {
  const baseMs = isPremiumActive(currentUntil, now)
    ? Date.parse(currentUntil!)
    : now.getTime();
  const next = new Date(baseMs + PREMIUM_DURATION_DAYS * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export function billingStatusPayload(user: {
  premium_until?: string | null;
}) {
  const premiumUntil = user.premium_until ?? null;
  const isPremium = isPremiumActive(premiumUntil);
  return {
    isPremium,
    premiumUntil,
    plan: isPremium ? ("premium" as const) : ("free" as const),
    maxOpenListings: maxOpenListingsFor(isPremium),
    freeMaxOpenListings: FREE_MAX_OPEN_LISTINGS,
    premiumMaxOpenListings: PREMIUM_MAX_OPEN_LISTINGS,
    premiumDurationDays: PREMIUM_DURATION_DAYS,
    premiumPriceJpy: PREMIUM_PRICE_JPY,
    productName: PREMIUM_PRODUCT_NAME,
  };
}

function formBody(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export async function createStripeCheckoutSession(opts: {
  config: BillingConfig;
  userId: string;
  email: string;
}): Promise<{ id: string; url: string }> {
  const { config, userId, email } = opts;
  if (!config.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }

  const params: Record<string, string> = {
    mode: "payment",
    success_url: config.successUrl,
    cancel_url: config.cancelUrl,
    client_reference_id: userId,
    customer_email: email,
    "metadata[userId]": userId,
    "metadata[product]": "premium_30d",
    "line_items[0][quantity]": "1",
  };

  if (config.stripePriceId) {
    params["line_items[0][price]"] = config.stripePriceId;
  } else {
    params["line_items[0][price_data][currency]"] = "jpy";
    params["line_items[0][price_data][unit_amount]"] = String(PREMIUM_PRICE_JPY);
    params["line_items[0][price_data][product_data][name]"] = PREMIUM_PRODUCT_NAME;
    params["line_items[0][price_data][product_data][description]"] =
      `同時募集 ${PREMIUM_MAX_OPEN_LISTINGS} 件まで + プレミアムバッジ（${PREMIUM_DURATION_DAYS}日間）`;
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody(params),
  });
  const json = (await res.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.id || !json.url) {
    throw new Error(json.error?.message || `Stripe Checkout 作成に失敗 (${res.status})`);
  }
  return { id: json.id, url: json.url };
}

export async function retrieveStripeCheckoutSession(
  secretKey: string,
  sessionId: string,
): Promise<{
  id: string;
  payment_status: string;
  client_reference_id: string | null;
  customer: string | null;
  metadata: Record<string, string>;
}> {
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
    },
  );
  const json = (await res.json()) as {
    id?: string;
    payment_status?: string;
    client_reference_id?: string | null;
    customer?: string | null;
    metadata?: Record<string, string>;
    error?: { message?: string };
  };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || `Stripe session 取得に失敗 (${res.status})`);
  }
  return {
    id: json.id,
    payment_status: json.payment_status || "unpaid",
    client_reference_id: json.client_reference_id ?? null,
    customer: json.customer ?? null,
    metadata: json.metadata || {},
  };
}

/** Verify Stripe-Signature header (v1). */
export async function verifyStripeWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string,
  toleranceSec = 300,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k.trim(), v?.trim() ?? ""];
    }),
  );
  const timestamp = parts.t;
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > toleranceSec) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${rawBody}`),
  );
  const expected = [...new Uint8Array(signed)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return mismatch === 0;
}
