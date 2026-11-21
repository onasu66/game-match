import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { v4 as uuidv4 } from "uuid";
import { GAMES, isValidGame } from "./games.js";
import {
  hashPassword,
  isAtLeast18,
  publicUser,
  signToken,
  verifyPassword,
  verifyToken,
} from "./auth.js";
import {
  billingStatusPayload,
  createStripeCheckoutSession,
  extendPremiumUntil,
  isPremiumActive,
  maxOpenListingsFor,
  PREMIUM_PRICE_JPY,
  retrieveStripeCheckoutSession,
  verifyStripeWebhookSignature,
  type BillingConfig,
} from "./billing.js";
import {
  createLiveKitAccessToken,
  listingRoomName,
  type LiveKitConfig,
} from "./livekit.js";
import type { ListingRow, MatchDb, MembershipRow, UserRow } from "./types.js";

export type AppEnv = {
  Variables: {
    userId: string;
    db: MatchDb;
    jwtSecret: string;
    livekit: LiveKitConfig | null;
    billing: BillingConfig;
  };
};

export type CreateAppOptions = {
  getDb: (c: { env?: unknown }) => MatchDb;
  getJwtSecret: (c: { env?: unknown }) => string;
  getLiveKitConfig: (c: { env?: unknown }) => LiveKitConfig | null;
  getBillingConfig: (c: { env?: unknown }) => BillingConfig;
};

function parseBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

async function listingDetail(db: MatchDb, listingId: string) {
  const listing = await db.first<ListingRow>(
    "SELECT * FROM listings WHERE id = ?",
    listingId,
  );
  if (!listing) return null;

  const host = await db.first<UserRow>(
    "SELECT * FROM users WHERE id = ?",
    listing.host_id,
  );
  const members = await db.all<
    MembershipRow & {
      display_name: string;
      email: string;
      premium_until: string | null;
    }
  >(
    `SELECT m.listing_id, m.user_id, m.joined_at, u.display_name, u.email, u.premium_until
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.listing_id = ?
     ORDER BY m.joined_at ASC`,
    listingId,
  );
  const memberCount = members.length;

  return {
    id: listing.id,
    hostId: listing.host_id,
    hostDisplayName: host?.display_name ?? "unknown",
    hostIsPremium: isPremiumActive(host?.premium_until),
    game: listing.game,
    rankNote: listing.rank_note,
    slots: listing.slots,
    description: listing.description,
    voiceOptional: listing.voice_optional === 1,
    status: listing.status,
    createdAt: listing.created_at,
    memberCount,
    members: members.map((m) => ({
      userId: m.user_id,
      displayName: m.display_name,
      email: m.email,
      joinedAt: m.joined_at,
      isPremium: isPremiumActive(m.premium_until),
    })),
  };
}

async function grantPremium(opts: {
  db: MatchDb;
  userId: string;
  provider: string;
  providerRef: string;
  amountJpy: number | null;
  stripeCustomerId?: string | null;
}) {
  const { db, userId, provider, providerRef, amountJpy, stripeCustomerId } = opts;
  const existing = await db.first<{ id: string }>(
    "SELECT id FROM purchases WHERE provider_ref = ?",
    providerRef,
  );
  if (existing) {
    const user = await db.first<UserRow>("SELECT * FROM users WHERE id = ?", userId);
    return { alreadyProcessed: true as const, user: user! };
  }

  const user = await db.first<UserRow>("SELECT * FROM users WHERE id = ?", userId);
  if (!user) throw new HTTPException(404, { message: "ユーザーが見つかりません" });

  const premiumUntil = extendPremiumUntil(user.premium_until);
  const createdAt = new Date().toISOString();
  const purchaseId = uuidv4();

  await db.run(
    `INSERT INTO purchases (id, user_id, provider, provider_ref, product, amount_jpy, status, created_at)
     VALUES (?, ?, ?, ?, 'premium_30d', ?, 'completed', ?)`,
    purchaseId,
    userId,
    provider,
    providerRef,
    amountJpy,
    createdAt,
  );

  if (stripeCustomerId) {
    await db.run(
      "UPDATE users SET premium_until = ?, stripe_customer_id = ? WHERE id = ?",
      premiumUntil,
      stripeCustomerId,
      userId,
    );
  } else {
    await db.run(
      "UPDATE users SET premium_until = ? WHERE id = ?",
      premiumUntil,
      userId,
    );
  }

  const updated = await db.first<UserRow>("SELECT * FROM users WHERE id = ?", userId);
  return { alreadyProcessed: false as const, user: updated! };
}

export function createApp(options: CreateAppOptions) {
  const app = new Hono<AppEnv>();

  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    }),
  );

  app.use("*", async (c, next) => {
    c.set("db", options.getDb(c as never));
    c.set("jwtSecret", options.getJwtSecret(c as never));
    c.set("livekit", options.getLiveKitConfig(c as never));
    c.set("billing", options.getBillingConfig(c as never));
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true, service: "game-match-api" }));

  app.get("/games", (c) => c.json({ games: GAMES }));

  app.post("/auth/register", async (c) => {
    const body = await c.req.json<{
      email?: string;
      password?: string;
      displayName?: string;
      birthDate?: string;
      favoriteGames?: string[];
    }>();

    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const displayName = body.displayName?.trim() ?? "";
    const birthDate = body.birthDate?.trim() ?? "";
    const favoriteGames = Array.isArray(body.favoriteGames)
      ? body.favoriteGames.filter(isValidGame)
      : [];

    if (!email || !email.includes("@")) {
      throw new HTTPException(400, { message: "有効なメールアドレスが必要です" });
    }
    if (password.length < 8) {
      throw new HTTPException(400, {
        message: "パスワードは8文字以上にしてください",
      });
    }
    if (displayName.length < 1 || displayName.length > 32) {
      throw new HTTPException(400, { message: "表示名は1〜32文字です" });
    }
    if (!isAtLeast18(birthDate)) {
      throw new HTTPException(403, {
        message: "18歳未満は登録できません",
      });
    }

    const db = c.get("db");
    const existing = await db.first<{ id: string }>(
      "SELECT id FROM users WHERE email = ?",
      email,
    );
    if (existing) {
      throw new HTTPException(409, { message: "このメールは既に登録されています" });
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();
    await db.run(
      `INSERT INTO users (id, email, password_hash, display_name, birth_date, favorite_games, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      email,
      hashPassword(password),
      displayName,
      birthDate,
      JSON.stringify(favoriteGames),
      createdAt,
    );

    const token = await signToken(id, c.get("jwtSecret"));
    const user = await db.first<UserRow>("SELECT * FROM users WHERE id = ?", id);
    return c.json({ token, user: publicUser(user!) }, 201);
  });

  app.post("/auth/login", async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>();
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const db = c.get("db");
    const user = await db.first<UserRow>(
      "SELECT * FROM users WHERE email = ?",
      email,
    );
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HTTPException(401, { message: "メールまたはパスワードが違います" });
    }
    const token = await signToken(user.id, c.get("jwtSecret"));
    return c.json({ token, user: publicUser(user) });
  });

  app.use("/auth/me", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/profile", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/listings", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/listings/*", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/billing/status", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/billing/checkout", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/billing/mock-purchase", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/billing/confirm", async (c, next) => {
    await authenticate(c);
    await next();
  });

  async function authenticate(c: {
    req: { header: (name: string) => string | undefined };
    get: (key: "db" | "jwtSecret" | "userId" | "livekit" | "billing") => unknown;
    set: (key: "userId", value: string) => void;
  }) {
    const token = parseBearer(c.req.header("Authorization"));
    if (!token) throw new HTTPException(401, { message: "認証が必要です" });
    const userId = await verifyToken(token, c.get("jwtSecret") as string);
    if (!userId) throw new HTTPException(401, { message: "トークンが無効です" });
    const user = await (c.get("db") as MatchDb).first<UserRow>(
      "SELECT id, birth_date FROM users WHERE id = ?",
      userId,
    );
    if (!user) throw new HTTPException(401, { message: "ユーザーが見つかりません" });
    if (!isAtLeast18(user.birth_date)) {
      throw new HTTPException(403, {
        message: "年齢確認済みのユーザーのみ利用できます",
      });
    }
    c.set("userId", userId);
  }

  app.get("/auth/me", async (c) => {
    const user = await c.get("db").first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      c.get("userId"),
    );
    return c.json({ user: publicUser(user!) });
  });

  app.patch("/profile", async (c) => {
    const body = await c.req.json<{
      displayName?: string;
      favoriteGames?: string[];
    }>();
    const db = c.get("db");
    const userId = c.get("userId");
    const user = await db.first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      userId,
    );
    if (!user) throw new HTTPException(404, { message: "ユーザーが見つかりません" });

    const displayName =
      body.displayName !== undefined
        ? body.displayName.trim()
        : user.display_name;
    if (displayName.length < 1 || displayName.length > 32) {
      throw new HTTPException(400, { message: "表示名は1〜32文字です" });
    }
    const favoriteGames = Array.isArray(body.favoriteGames)
      ? body.favoriteGames.filter(isValidGame)
      : JSON.parse(user.favorite_games);

    await db.run(
      "UPDATE users SET display_name = ?, favorite_games = ? WHERE id = ?",
      displayName,
      JSON.stringify(favoriteGames),
      userId,
    );
    const updated = await db.first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      userId,
    );
    return c.json({ user: publicUser(updated!) });
  });

  app.get("/listings", async (c) => {
    const game = c.req.query("game");
    const db = c.get("db");
    let rows: ListingRow[];
    if (game) {
      if (!isValidGame(game)) {
        throw new HTTPException(400, { message: "未知のタイトルです" });
      }
      rows = await db.all<ListingRow>(
        `SELECT * FROM listings WHERE status = 'open' AND game = ? ORDER BY created_at DESC`,
        game,
      );
    } else {
      rows = await db.all<ListingRow>(
        `SELECT * FROM listings WHERE status = 'open' ORDER BY created_at DESC`,
      );
    }

    const items = [];
    for (const listing of rows) {
      const detail = await listingDetail(db, listing.id);
      if (detail) items.push(detail);
    }
    return c.json({ listings: items });
  });

  app.post("/listings", async (c) => {
    const body = await c.req.json<{
      game?: string;
      rankNote?: string;
      slots?: number;
      description?: string;
      voiceOptional?: boolean;
    }>();
    const game = body.game ?? "";
    if (!isValidGame(game)) {
      throw new HTTPException(400, {
        message: "初期6タイトルから選んでください",
      });
    }
    const slots = Number(body.slots ?? 0);
    if (!Number.isInteger(slots) || slots < 2 || slots > 10) {
      throw new HTTPException(400, { message: "人数は2〜10にしてください" });
    }
    const rankNote = (body.rankNote ?? "").trim().slice(0, 64);
    const description = (body.description ?? "").trim().slice(0, 500);
    const voiceOptional = body.voiceOptional !== false;
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    const hostId = c.get("userId");
    const db = c.get("db");
    const host = await db.first<UserRow>("SELECT * FROM users WHERE id = ?", hostId);
    if (!host) throw new HTTPException(401, { message: "ユーザーが見つかりません" });
    const premium = isPremiumActive(host.premium_until);
    const maxOpen = maxOpenListingsFor(premium);
    const openRow = await db.first<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM listings WHERE host_id = ? AND status = 'open'`,
      hostId,
    );
    const openCount = Number(openRow?.cnt ?? 0);
    if (openCount >= maxOpen) {
      throw new HTTPException(403, {
        message: premium
          ? `プレミアムでも同時に公開できる募集は${maxOpen}件までです`
          : `無料プランの同時募集は${maxOpen}件までです。プレミアムで最大${maxOpenListingsFor(true)}件まで作成できます`,
      });
    }

    await db.run(
      `INSERT INTO listings
       (id, host_id, game, rank_note, slots, description, voice_optional, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      id,
      hostId,
      game,
      rankNote,
      slots,
      description,
      voiceOptional ? 1 : 0,
      createdAt,
    );
    await db.run(
      `INSERT INTO memberships (listing_id, user_id, joined_at) VALUES (?, ?, ?)`,
      id,
      hostId,
      createdAt,
    );

    const detail = await listingDetail(db, id);
    return c.json({ listing: detail }, 201);
  });

  app.get("/listings/:id", async (c) => {
    const detail = await listingDetail(c.get("db"), c.req.param("id"));
    if (!detail) throw new HTTPException(404, { message: "募集が見つかりません" });
    return c.json({ listing: detail });
  });

  app.post("/listings/:id/join", async (c) => {
    const db = c.get("db");
    const listingId = c.req.param("id");
    const userId = c.get("userId");
    const listing = await db.first<ListingRow>(
      "SELECT * FROM listings WHERE id = ?",
      listingId,
    );
    if (!listing || listing.status !== "open") {
      throw new HTTPException(404, { message: "募集が見つかりません" });
    }
    const existing = await db.first<{ user_id: string }>(
      "SELECT user_id FROM memberships WHERE listing_id = ? AND user_id = ?",
      listingId,
      userId,
    );
    if (existing) {
      const detail = await listingDetail(db, listingId);
      return c.json({ listing: detail, alreadyJoined: true });
    }
    const countRow = await db.first<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM memberships WHERE listing_id = ?",
      listingId,
    );
    const count = Number(countRow?.cnt ?? 0);
    if (count >= listing.slots) {
      throw new HTTPException(409, { message: "定員に達しています" });
    }
    await db.run(
      `INSERT INTO memberships (listing_id, user_id, joined_at) VALUES (?, ?, ?)`,
      listingId,
      userId,
      new Date().toISOString(),
    );
    const detail = await listingDetail(db, listingId);
    return c.json({ listing: detail, alreadyJoined: false });
  });

  /**
   * Issue LiveKit room credentials for a listing the caller has joined.
   * Mic is optional on the client; this token still allows publish so unmute works later.
   */
  app.post("/listings/:id/call-token", async (c) => {
    const livekit = c.get("livekit");
    if (!livekit) {
      throw new HTTPException(503, {
        message:
          "LiveKit が未設定です（LIVEKIT_API_KEY / LIVEKIT_API_SECRET が必要）",
      });
    }

    const db = c.get("db");
    const listingId = c.req.param("id");
    const userId = c.get("userId");
    const listing = await db.first<ListingRow>(
      "SELECT * FROM listings WHERE id = ?",
      listingId,
    );
    if (!listing) {
      throw new HTTPException(404, { message: "募集が見つかりません" });
    }

    const membership = await db.first<{ user_id: string }>(
      "SELECT user_id FROM memberships WHERE listing_id = ? AND user_id = ?",
      listingId,
      userId,
    );
    if (!membership) {
      throw new HTTPException(403, {
        message: "通話に入るには募集への参加が必要です",
      });
    }

    const user = await db.first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      userId,
    );
    if (!user || !isAtLeast18(user.birth_date)) {
      throw new HTTPException(403, {
        message: "年齢確認済みのユーザーのみ通話できます",
      });
    }

    const roomName = listingRoomName(listingId);
    const token = await createLiveKitAccessToken({
      config: livekit,
      identity: userId,
      name: user.display_name,
      roomName,
    });

    return c.json({
      url: livekit.url,
      token,
      roomName,
      identity: userId,
    });
  });

  app.get("/billing/status", async (c) => {
    const user = await c.get("db").first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      c.get("userId"),
    );
    if (!user) throw new HTTPException(404, { message: "ユーザーが見つかりません" });
    const billing = c.get("billing");
    return c.json({
      ...billingStatusPayload(user),
      stripeEnabled: !!billing.stripeSecretKey,
      mockPurchaseAvailable: billing.allowMockPurchase,
      note:
        "Web 決済（Stripe Checkout）。App Store / Google Play のアプリ内課金は後続。",
    });
  });

  app.post("/billing/checkout", async (c) => {
    const billing = c.get("billing");
    const db = c.get("db");
    const user = await db.first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      c.get("userId"),
    );
    if (!user) throw new HTTPException(404, { message: "ユーザーが見つかりません" });

    if (!billing.stripeSecretKey) {
      if (billing.allowMockPurchase) {
        return c.json(
          {
            error:
              "Stripe 未設定のため Checkout は使えません。モック購入（/billing/mock-purchase）を利用してください",
            mockPurchaseAvailable: true,
          },
          503,
        );
      }
      throw new HTTPException(503, {
        message: "Stripe が未設定です（STRIPE_SECRET_KEY が必要）",
      });
    }

    try {
      const session = await createStripeCheckoutSession({
        config: billing,
        userId: user.id,
        email: user.email,
      });
      return c.json({
        url: session.url,
        sessionId: session.id,
        provider: "stripe",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Checkout 作成に失敗しました";
      throw new HTTPException(502, { message: msg });
    }
  });

  /** Local / demo path when Stripe secrets are not configured. */
  app.post("/billing/mock-purchase", async (c) => {
    const billing = c.get("billing");
    if (!billing.allowMockPurchase) {
      throw new HTTPException(403, {
        message: "モック購入は無効です（本番では Stripe Checkout を使ってください）",
      });
    }
    const userId = c.get("userId");
    const result = await grantPremium({
      db: c.get("db"),
      userId,
      provider: "mock",
      providerRef: `mock_${userId}_${Date.now()}`,
      amountJpy: PREMIUM_PRICE_JPY,
    });
    return c.json({
      user: publicUser(result.user),
      ...billingStatusPayload(result.user),
      provider: "mock",
    });
  });

  /** After Stripe redirect: confirm session and grant premium (also covered by webhook). */
  app.post("/billing/confirm", async (c) => {
    const billing = c.get("billing");
    if (!billing.stripeSecretKey) {
      throw new HTTPException(503, { message: "Stripe が未設定です" });
    }
    const body = await c.req.json<{ sessionId?: string }>();
    const sessionId = body.sessionId?.trim() ?? "";
    if (!sessionId) {
      throw new HTTPException(400, { message: "sessionId が必要です" });
    }
    let session;
    try {
      session = await retrieveStripeCheckoutSession(
        billing.stripeSecretKey,
        sessionId,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "session 取得に失敗";
      throw new HTTPException(502, { message: msg });
    }
    if (session.payment_status !== "paid") {
      throw new HTTPException(402, { message: "支払いが完了していません" });
    }
    const userId =
      session.client_reference_id ||
      session.metadata.userId ||
      c.get("userId");
    if (userId !== c.get("userId")) {
      throw new HTTPException(403, { message: "この決済は別ユーザーのものです" });
    }
    const result = await grantPremium({
      db: c.get("db"),
      userId,
      provider: "stripe",
      providerRef: session.id,
      amountJpy: PREMIUM_PRICE_JPY,
      stripeCustomerId: session.customer,
    });
    return c.json({
      user: publicUser(result.user),
      ...billingStatusPayload(result.user),
      alreadyProcessed: result.alreadyProcessed,
      provider: "stripe",
    });
  });

  app.post("/billing/webhook", async (c) => {
    const billing = c.get("billing");
    if (!billing.stripeSecretKey || !billing.stripeWebhookSecret) {
      throw new HTTPException(503, {
        message: "Stripe webhook が未設定です",
      });
    }
    const rawBody = await c.req.text();
    const ok = await verifyStripeWebhookSignature(
      rawBody,
      c.req.header("Stripe-Signature"),
      billing.stripeWebhookSecret,
    );
    if (!ok) {
      throw new HTTPException(400, { message: "署名が無効です" });
    }

    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: {
        object?: {
          id?: string;
          payment_status?: string;
          client_reference_id?: string | null;
          customer?: string | null;
          metadata?: Record<string, string>;
        };
      };
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data?.object;
      const userId =
        session?.client_reference_id || session?.metadata?.userId || "";
      const sessionId = session?.id || "";
      if (
        userId &&
        sessionId &&
        (session?.payment_status === "paid" ||
          session?.payment_status === "no_payment_required" ||
          !session?.payment_status)
      ) {
        await grantPremium({
          db: c.get("db"),
          userId,
          provider: "stripe",
          providerRef: sessionId,
          amountJpy: PREMIUM_PRICE_JPY,
          stripeCustomerId: session?.customer ?? null,
        });
      }
    }

    return c.json({ received: true });
  });

  app.get("/billing/success", (c) => {
    const sessionId = c.req.query("session_id") || "";
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>購入完了</title></head><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1>プレミアム購入を受け付けました</h1><p>アプリに戻ってプロフィールを更新してください。</p><p style="color:#666;font-size:0.9rem">session: ${sessionId.replace(/[<>&"]/g, "")}</p></body></html>`;
    return c.html(html);
  });

  app.get("/billing/cancel", (c) => {
    return c.html(
      `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><title>キャンセル</title></head><body style="font-family:system-ui;padding:2rem"><h1>購入はキャンセルされました</h1><p>アプリに戻って再度お試しください。</p></body></html>`,
    );
  });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error(err);
    return c.json({ error: "内部エラー" }, 500);
  });

  return app;
}
