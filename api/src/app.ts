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
  FREE_CALLS_PER_DAY,
  getPointPack,
  HARD_MAX_OPEN_LISTINGS,
  isBillableProductId,
  isPremiumActive,
  maxOpenListingsFor,
  POINTS_COST_CALL,
  POINTS_COST_EXTRA_LISTING,
  pointsBalanceOf,
  PREMIUM_PRICE_JPY,
  retrieveStripeCheckoutSession,
  utcDayKey,
  verifyStripeWebhookSignature,
  type BillableProductId,
  type BillingConfig,
} from "./billing.js";
import {
  createLiveKitAccessToken,
  listingRoomName,
  type LiveKitConfig,
} from "./livekit.js";
import type {
  ListingRow,
  MatchDb,
  MembershipRow,
  PointLedgerRow,
  RatingRow,
  UserRow,
} from "./types.js";
import { isValidReportReason, REPORT_REASONS } from "./types.js";

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

async function ratingSummaryForUser(db: MatchDb, userId: string) {
  const row = await db.first<{ cnt: number; total: number | null }>(
    `SELECT COUNT(*) as cnt, SUM(score) as total FROM ratings WHERE to_user_id = ?`,
    userId,
  );
  const count = Number(row?.cnt ?? 0);
  const total = Number(row?.total ?? 0);
  const averageScore = count > 0 ? Math.round((total / count) * 10) / 10 : null;
  return { averageScore, count };
}

async function myRatingsForListing(
  db: MatchDb,
  listingId: string,
  fromUserId: string,
) {
  const rows = await db.all<Pick<RatingRow, "to_user_id" | "score">>(
    `SELECT to_user_id, score FROM ratings
     WHERE listing_id = ? AND from_user_id = ?`,
    listingId,
    fromUserId,
  );
  return rows.map((r) => ({ toUserId: r.to_user_id, score: r.score }));
}

async function assertListingMember(
  db: MatchDb,
  listingId: string,
  userId: string,
) {
  const membership = await db.first<{ user_id: string }>(
    "SELECT user_id FROM memberships WHERE listing_id = ? AND user_id = ?",
    listingId,
    userId,
  );
  if (!membership) {
    throw new HTTPException(403, {
      message: "この募集の参加者のみ操作できます",
    });
  }
}

async function applyPointDelta(opts: {
  db: MatchDb;
  userId: string;
  delta: number;
  reason: string;
  refId?: string | null;
}) {
  const { db, userId, delta, reason, refId } = opts;
  const user = await db.first<UserRow>("SELECT * FROM users WHERE id = ?", userId);
  if (!user) throw new HTTPException(404, { message: "ユーザーが見つかりません" });
  const current = pointsBalanceOf(user);
  const next = current + delta;
  if (next < 0) {
    throw new HTTPException(402, {
      message: `ポイントが不足しています（残高 ${current} / 必要 ${Math.abs(delta)}）`,
    });
  }
  const createdAt = new Date().toISOString();
  const ledgerId = uuidv4();
  await db.run(
    "UPDATE users SET points_balance = ? WHERE id = ?",
    next,
    userId,
  );
  await db.run(
    `INSERT INTO point_ledger (id, user_id, delta, balance_after, reason, ref_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ledgerId,
    userId,
    delta,
    next,
    reason,
    refId ?? null,
    createdAt,
  );
  const updated = await db.first<UserRow>("SELECT * FROM users WHERE id = ?", userId);
  return { user: updated!, balance: next, ledgerId };
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

async function grantPointsPurchase(opts: {
  db: MatchDb;
  userId: string;
  provider: string;
  providerRef: string;
  product: string;
  amountJpy: number;
  points: number;
  stripeCustomerId?: string | null;
}) {
  const {
    db,
    userId,
    provider,
    providerRef,
    product,
    amountJpy,
    points,
    stripeCustomerId,
  } = opts;
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

  const createdAt = new Date().toISOString();
  const purchaseId = uuidv4();
  await db.run(
    `INSERT INTO purchases (id, user_id, provider, provider_ref, product, amount_jpy, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)`,
    purchaseId,
    userId,
    provider,
    providerRef,
    product,
    amountJpy,
    createdAt,
  );

  if (stripeCustomerId) {
    await db.run(
      "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
      stripeCustomerId,
      userId,
    );
  }

  const credited = await applyPointDelta({
    db,
    userId,
    delta: points,
    reason: `purchase_${product}`,
    refId: purchaseId,
  });
  return { alreadyProcessed: false as const, user: credited.user };
}

async function fulfillCheckoutPurchase(opts: {
  db: MatchDb;
  userId: string;
  provider: string;
  providerRef: string;
  product: string;
  stripeCustomerId?: string | null;
}) {
  const { db, userId, provider, providerRef, product, stripeCustomerId } = opts;
  if (product === "premium_30d") {
    return grantPremium({
      db,
      userId,
      provider,
      providerRef,
      amountJpy: PREMIUM_PRICE_JPY,
      stripeCustomerId,
    });
  }
  const pack = getPointPack(product);
  if (!pack) {
    throw new HTTPException(400, { message: `未知の商品です: ${product}` });
  }
  return grantPointsPurchase({
    db,
    userId,
    provider,
    providerRef,
    product: pack.id,
    amountJpy: pack.priceJpy,
    points: pack.points,
    stripeCustomerId,
  });
}

async function recentPointLedger(db: MatchDb, userId: string, limit = 30) {
  const rows = await db.all<PointLedgerRow>(
    `SELECT * FROM point_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    userId,
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    delta: r.delta,
    balanceAfter: r.balance_after,
    reason: r.reason,
    refId: r.ref_id,
    createdAt: r.created_at,
  }));
}

async function countFreeCallsUsedToday(db: MatchDb, userId: string, now = new Date()) {
  const day = utcDayKey(now);
  const start = `${day}T00:00:00.000Z`;
  const end = `${day}T23:59:59.999Z`;
  const row = await db.first<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM point_ledger
     WHERE user_id = ? AND reason = 'call_free' AND created_at >= ? AND created_at <= ?`,
    userId,
    start,
    end,
  );
  return Number(row?.cnt ?? 0);
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
  app.use("/billing/history", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/ratings/*", async (c, next) => {
    await authenticate(c);
    await next();
  });
  app.use("/reports/*", async (c, next) => {
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
    const freeQuota = maxOpenListingsFor(premium);
    const openRow = await db.first<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM listings WHERE host_id = ? AND status = 'open'`,
      hostId,
    );
    const openCount = Number(openRow?.cnt ?? 0);
    if (openCount >= HARD_MAX_OPEN_LISTINGS) {
      throw new HTTPException(403, {
        message: `同時に公開できる募集は最大${HARD_MAX_OPEN_LISTINGS}件までです`,
      });
    }

    let pointsSpent = 0;
    if (openCount >= freeQuota) {
      const balance = pointsBalanceOf(host);
      if (balance < POINTS_COST_EXTRA_LISTING) {
        throw new HTTPException(402, {
          message: premium
            ? `同時募集の無料枠（${freeQuota}件）を使い切りました。追加は${POINTS_COST_EXTRA_LISTING}pt必要です（残高${balance}）`
            : `無料の同時募集は${freeQuota}件までです。追加は${POINTS_COST_EXTRA_LISTING}pt、またはプレミアムで枠拡大（残高${balance}）`,
        });
      }
      await applyPointDelta({
        db,
        userId: hostId,
        delta: -POINTS_COST_EXTRA_LISTING,
        reason: "spend_extra_listing",
        refId: id,
      });
      pointsSpent = POINTS_COST_EXTRA_LISTING;
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
    const updatedHost = await db.first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      hostId,
    );
    return c.json(
      {
        listing: detail,
        pointsSpent,
        pointsBalance: pointsBalanceOf(updatedHost ?? host),
      },
      201,
    );
  });

  app.get("/listings/:id", async (c) => {
    const db = c.get("db");
    const listingId = c.req.param("id");
    const detail = await listingDetail(db, listingId);
    if (!detail) throw new HTTPException(404, { message: "募集が見つかりません" });
    const myRatings = await myRatingsForListing(db, listingId, c.get("userId"));
    return c.json({ listing: { ...detail, myRatings } });
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

    const livekit = c.get("livekit");
    if (!livekit) {
      throw new HTTPException(503, {
        message:
          "LiveKit が未設定です（LIVEKIT_API_KEY / LIVEKIT_API_SECRET が必要）",
      });
    }

    const freeUsed = await countFreeCallsUsedToday(db, userId);
    const usedFreeQuota = freeUsed < FREE_CALLS_PER_DAY;
    let pointsSpent = 0;
    if (!usedFreeQuota) {
      const balance = pointsBalanceOf(user);
      if (balance < POINTS_COST_CALL) {
        throw new HTTPException(402, {
          message: `本日の無料通話（${FREE_CALLS_PER_DAY}回）を使い切りました。追加は${POINTS_COST_CALL}pt必要です（残高${balance}）`,
        });
      }
      pointsSpent = POINTS_COST_CALL;
    }

    const roomName = listingRoomName(listingId);
    const token = await createLiveKitAccessToken({
      config: livekit,
      identity: userId,
      name: user.display_name,
      roomName,
    });

    if (usedFreeQuota) {
      await applyPointDelta({
        db,
        userId,
        delta: 0,
        reason: "call_free",
        refId: listingId,
      });
    } else {
      await applyPointDelta({
        db,
        userId,
        delta: -POINTS_COST_CALL,
        reason: "spend_call",
        refId: listingId,
      });
    }

    const updatedUser = await db.first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      userId,
    );
    return c.json({
      url: livekit.url,
      token,
      roomName,
      identity: userId,
      pointsSpent,
      usedFreeQuota,
      pointsBalance: pointsBalanceOf(updatedUser ?? user),
      freeCallsRemainingToday: Math.max(
        0,
        FREE_CALLS_PER_DAY - freeUsed - (usedFreeQuota ? 1 : 0),
      ),
    });
  });

  /** Rate another member of a listing (1–5 stars). Upserts per listing pair. */
  app.post("/listings/:id/ratings", async (c) => {
    const db = c.get("db");
    const listingId = c.req.param("id");
    const fromUserId = c.get("userId");
    const body = await c.req.json<{ toUserId?: string; score?: number }>();
    const toUserId = body.toUserId?.trim() ?? "";
    const score = Number(body.score);

    if (!toUserId) {
      throw new HTTPException(400, { message: "評価対象が必要です" });
    }
    if (toUserId === fromUserId) {
      throw new HTTPException(400, { message: "自分自身は評価できません" });
    }
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new HTTPException(400, { message: "評価は1〜5にしてください" });
    }

    const listing = await db.first<ListingRow>(
      "SELECT * FROM listings WHERE id = ?",
      listingId,
    );
    if (!listing) {
      throw new HTTPException(404, { message: "募集が見つかりません" });
    }

    await assertListingMember(db, listingId, fromUserId);
    await assertListingMember(db, listingId, toUserId);

    const existing = await db.first<RatingRow>(
      `SELECT * FROM ratings
       WHERE listing_id = ? AND from_user_id = ? AND to_user_id = ?`,
      listingId,
      fromUserId,
      toUserId,
    );
    const createdAt = new Date().toISOString();
    if (existing) {
      await db.run(
        "UPDATE ratings SET score = ?, created_at = ? WHERE id = ?",
        score,
        createdAt,
        existing.id,
      );
      return c.json({
        rating: {
          id: existing.id,
          listingId,
          fromUserId,
          toUserId,
          score,
          createdAt,
          updated: true,
        },
      });
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO ratings (id, listing_id, from_user_id, to_user_id, score, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      listingId,
      fromUserId,
      toUserId,
      score,
      createdAt,
    );
    return c.json(
      {
        rating: {
          id,
          listingId,
          fromUserId,
          toUserId,
          score,
          createdAt,
          updated: false,
        },
      },
      201,
    );
  });

  /** Report another member from a listing context. */
  app.post("/listings/:id/reports", async (c) => {
    const db = c.get("db");
    const listingId = c.req.param("id");
    const reporterId = c.get("userId");
    const body = await c.req.json<{
      reportedUserId?: string;
      reason?: string;
      comment?: string;
    }>();
    const reportedUserId = body.reportedUserId?.trim() ?? "";
    const reason = body.reason?.trim() ?? "";
    const comment = (body.comment ?? "").trim().slice(0, 500);

    if (!reportedUserId) {
      throw new HTTPException(400, { message: "通報対象が必要です" });
    }
    if (reportedUserId === reporterId) {
      throw new HTTPException(400, { message: "自分自身は通報できません" });
    }
    if (!isValidReportReason(reason)) {
      throw new HTTPException(400, {
        message: `理由は次から選んでください: ${REPORT_REASONS.join(", ")}`,
      });
    }

    const listing = await db.first<ListingRow>(
      "SELECT * FROM listings WHERE id = ?",
      listingId,
    );
    if (!listing) {
      throw new HTTPException(404, { message: "募集が見つかりません" });
    }

    await assertListingMember(db, listingId, reporterId);
    const targetMember = await db.first<{ user_id: string }>(
      "SELECT user_id FROM memberships WHERE listing_id = ? AND user_id = ?",
      listingId,
      reportedUserId,
    );
    if (!targetMember) {
      throw new HTTPException(400, {
        message: "この募集の参加者のみ通報できます",
      });
    }

    const existing = await db.first<{ id: string }>(
      `SELECT id FROM reports
       WHERE listing_id = ? AND reporter_id = ? AND reported_user_id = ?`,
      listingId,
      reporterId,
      reportedUserId,
    );
    if (existing) {
      throw new HTTPException(409, {
        message: "この募集では既に通報済みです",
      });
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();
    await db.run(
      `INSERT INTO reports
       (id, listing_id, reporter_id, reported_user_id, reason, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      listingId,
      reporterId,
      reportedUserId,
      reason,
      comment,
      createdAt,
    );
    return c.json(
      {
        report: {
          id,
          listingId,
          reporterId,
          reportedUserId,
          reason,
          comment,
          createdAt,
        },
      },
      201,
    );
  });

  app.get("/ratings/me", async (c) => {
    const summary = await ratingSummaryForUser(c.get("db"), c.get("userId"));
    return c.json({ summary });
  });

  app.get("/reports/reasons", (c) => {
    return c.json({
      reasons: REPORT_REASONS.map((id) => ({
        id,
        label:
          id === "harassment"
            ? "ハラスメント"
            : id === "cheating"
              ? "チート疑惑"
              : id === "spam"
                ? "スパム"
                : id === "inappropriate"
                  ? "不適切行為"
                  : "その他",
      })),
    });
  });

  app.get("/billing/status", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const user = await db.first<UserRow>(
      "SELECT * FROM users WHERE id = ?",
      userId,
    );
    if (!user) throw new HTTPException(404, { message: "ユーザーが見つかりません" });
    const billing = c.get("billing");
    const history = await recentPointLedger(db, userId, 20);
    const freeCallsUsedToday = await countFreeCallsUsedToday(db, userId);
    return c.json({
      ...billingStatusPayload(user),
      history,
      freeCallsUsedToday,
      freeCallsRemainingToday: Math.max(0, FREE_CALLS_PER_DAY - freeCallsUsedToday),
      stripeEnabled: !!billing.stripeSecretKey,
      mockPurchaseAvailable: billing.allowMockPurchase,
      note:
        "ポイント制が主課金。Stripe Checkout（Web）。プレミアムは共存。アプリ内課金は後続。",
    });
  });

  app.get("/billing/history", async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const history = await recentPointLedger(db, userId, 50);
    const user = await db.first<UserRow>("SELECT * FROM users WHERE id = ?", userId);
    if (!user) throw new HTTPException(404, { message: "ユーザーが見つかりません" });
    return c.json({
      pointsBalance: pointsBalanceOf(user),
      history,
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

    const body = await c.req.json<{ product?: string }>().catch(() => ({} as { product?: string }));
    const productRaw = (body.product ?? "points_100").trim();
    if (!isBillableProductId(productRaw)) {
      throw new HTTPException(400, {
        message:
          "product は points_100 / points_500 / points_1000 / premium_30d のいずれかです",
      });
    }
    const product: BillableProductId = productRaw;

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
        product,
      });
      return c.json({
        url: session.url,
        sessionId: session.id,
        provider: "stripe",
        product,
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
    const body = await c.req.json<{ product?: string }>().catch(() => ({} as { product?: string }));
    const productRaw = (body.product ?? "points_100").trim();
    if (!isBillableProductId(productRaw)) {
      throw new HTTPException(400, {
        message:
          "product は points_100 / points_500 / points_1000 / premium_30d のいずれかです",
      });
    }
    const userId = c.get("userId");
    const result = await fulfillCheckoutPurchase({
      db: c.get("db"),
      userId,
      provider: "mock",
      providerRef: `mock_${productRaw}_${userId}_${Date.now()}`,
      product: productRaw,
    });
    const history = await recentPointLedger(c.get("db"), userId, 20);
    return c.json({
      user: publicUser(result.user),
      ...billingStatusPayload(result.user),
      history,
      provider: "mock",
      product: productRaw,
    });
  });

  /** After Stripe redirect: confirm session and grant product (also covered by webhook). */
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
    const product = session.metadata.product || "premium_30d";
    const result = await fulfillCheckoutPurchase({
      db: c.get("db"),
      userId,
      provider: "stripe",
      providerRef: session.id,
      product,
      stripeCustomerId: session.customer,
    });
    const history = await recentPointLedger(c.get("db"), userId, 20);
    return c.json({
      user: publicUser(result.user),
      ...billingStatusPayload(result.user),
      history,
      alreadyProcessed: result.alreadyProcessed,
      provider: "stripe",
      product,
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
      const product = session?.metadata?.product || "premium_30d";
      if (
        userId &&
        sessionId &&
        (session?.payment_status === "paid" ||
          session?.payment_status === "no_payment_required" ||
          !session?.payment_status)
      ) {
        try {
          await fulfillCheckoutPurchase({
            db: c.get("db"),
            userId,
            provider: "stripe",
            providerRef: sessionId,
            product,
            stripeCustomerId: session?.customer ?? null,
          });
        } catch (e) {
          console.error("webhook fulfill failed", e);
        }
      }
    }

    return c.json({ received: true });
  });

  app.get("/billing/success", (c) => {
    const sessionId = c.req.query("session_id") || "";
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>購入完了</title></head><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1>購入を受け付けました</h1><p>アプリに戻ってプロフィールを更新してください。ポイント残高が反映されます。</p><p style="color:#666;font-size:0.9rem">session: ${sessionId.replace(/[<>&"]/g, "")}</p></body></html>`;
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
