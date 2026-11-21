/** Points-first billing + legacy premium. Stripe Checkout (Web). Native IAP is out of scope. */

export const FREE_MAX_OPEN_LISTINGS = 1;
export const PREMIUM_MAX_OPEN_LISTINGS = 5;
export const HARD_MAX_OPEN_LISTINGS = 10;
export const PREMIUM_DURATION_DAYS = 30;
/** JPY — legacy premium Checkout when STRIPE_PRICE_ID is unset. */
export const PREMIUM_PRICE_JPY = 480;
export const PREMIUM_PRODUCT_NAME = "ゲーム通話 プレミアム（30日）";

/** Extra open listing beyond free/premium quota. */
export const POINTS_COST_EXTRA_LISTING = 50;
/** Call start after the daily free quota. */
export const POINTS_COST_CALL = 20;
/** Free call-token issuances per UTC calendar day. */
export const FREE_CALLS_PER_DAY = 1;

export type PointPackId = "points_100" | "points_500" | "points_1000";
export type BillableProductId = PointPackId | "premium_30d";

export type PointPack = {
  id: PointPackId;
  points: number;
  priceJpy: number;
  name: string;
  description: string;
};

export const POINT_PACKS: PointPack[] = [
  {
    id: "points_100",
    points: 100,
    priceJpy: 120,
    name: "ポイント 100",
    description: "追加募集・通話に使えるポイント 100",
  },
  {
    id: "points_500",
    points: 500,
    priceJpy: 480,
    name: "ポイント 500",
    description: "追加募集・通話に使えるポイント 500",
  },
  {
    id: "points_1000",
    points: 1000,
    priceJpy: 900,
    name: "ポイント 1000",
    description: "追加募集・通話に使えるポイント 1000",
  },
];

export type BillingConfig = {
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  /** Optional Stripe Price ID for legacy premium only. */
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

export function pointsBalanceOf(user: {
  points_balance?: number | null;
}): number {
  const n = Number(user.points_balance ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function getPointPack(id: string): PointPack | null {
  return POINT_PACKS.find((p) => p.id === id) ?? null;
}

export function isBillableProductId(id: string): id is BillableProductId {
  return id === "premium_30d" || !!getPointPack(id);
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

/** UTC YYYY-MM-DD for daily free-call window. */
export function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function consumptionRulesPayload() {
  return {
    model: "points_primary" as const,
    coexistence:
      "ポイントが主課金。プレミアム（30日）は共存し、同時募集の無料枠を広げる。",
    freeOpenListings: FREE_MAX_OPEN_LISTINGS,
    premiumOpenListings: PREMIUM_MAX_OPEN_LISTINGS,
    hardMaxOpenListings: HARD_MAX_OPEN_LISTINGS,
    extraListingCostPoints: POINTS_COST_EXTRA_LISTING,
    freeCallsPerDay: FREE_CALLS_PER_DAY,
    callCostPoints: POINTS_COST_CALL,
    rulesJa: [
      `募集作成: 無料で同時 ${FREE_MAX_OPEN_LISTINGS} 件。それ以上は ${POINTS_COST_EXTRA_LISTING} pt/件（上限 ${HARD_MAX_OPEN_LISTINGS}）。`,
      `プレミアム中は同時募集の無料枠が ${PREMIUM_MAX_OPEN_LISTINGS} 件（ポイント不要）。枠超過分は同じく ${POINTS_COST_EXTRA_LISTING} pt。`,
      `通話開始: 1日あたり無料 ${FREE_CALLS_PER_DAY} 回。超過は ${POINTS_COST_CALL} pt/回。`,
    ],
  };
}

export function billingStatusPayload(user: {
  premium_until?: string | null;
  points_balance?: number | null;
}) {
  const premiumUntil = user.premium_until ?? null;
  const isPremium = isPremiumActive(premiumUntil);
  const pointsBalance = pointsBalanceOf(user);
  return {
    isPremium,
    premiumUntil,
    plan: isPremium ? ("premium" as const) : ("free" as const),
    maxOpenListings: maxOpenListingsFor(isPremium),
    freeMaxOpenListings: FREE_MAX_OPEN_LISTINGS,
    premiumMaxOpenListings: PREMIUM_MAX_OPEN_LISTINGS,
    hardMaxOpenListings: HARD_MAX_OPEN_LISTINGS,
    premiumDurationDays: PREMIUM_DURATION_DAYS,
    premiumPriceJpy: PREMIUM_PRICE_JPY,
    productName: PREMIUM_PRODUCT_NAME,
    pointsBalance,
    packs: POINT_PACKS.map((p) => ({
      id: p.id,
      points: p.points,
      priceJpy: p.priceJpy,
      name: p.name,
      description: p.description,
    })),
    costs: {
      extraListing: POINTS_COST_EXTRA_LISTING,
      call: POINTS_COST_CALL,
      freeCallsPerDay: FREE_CALLS_PER_DAY,
    },
    consumption: consumptionRulesPayload(),
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
  product: BillableProductId;
}): Promise<{ id: string; url: string }> {
  const { config, userId, email, product } = opts;
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
    "metadata[product]": product,
    "line_items[0][quantity]": "1",
  };

  if (product === "premium_30d") {
    if (config.stripePriceId) {
      params["line_items[0][price]"] = config.stripePriceId;
    } else {
      params["line_items[0][price_data][currency]"] = "jpy";
      params["line_items[0][price_data][unit_amount]"] = String(PREMIUM_PRICE_JPY);
      params["line_items[0][price_data][product_data][name]"] =
        PREMIUM_PRODUCT_NAME;
      params["line_items[0][price_data][product_data][description]"] =
        `同時募集 ${PREMIUM_MAX_OPEN_LISTINGS} 件まで + プレミアムバッジ（${PREMIUM_DURATION_DAYS}日間）`;
    }
  } else {
    const pack = getPointPack(product)!;
    params["line_items[0][price_data][currency]"] = "jpy";
    params["line_items[0][price_data][unit_amount]"] = String(pack.priceJpy);
    params["line_items[0][price_data][product_data][name]"] = pack.name;
    params["line_items[0][price_data][product_data][description]"] =
      pack.description;
    params["metadata[points]"] = String(pack.points);
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
