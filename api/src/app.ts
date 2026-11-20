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
import type { ListingRow, MatchDb, MembershipRow, UserRow } from "./types.js";

export type AppEnv = {
  Variables: {
    userId: string;
    db: MatchDb;
    jwtSecret: string;
  };
};

export type CreateAppOptions = {
  getDb: (c: { env?: unknown }) => MatchDb;
  getJwtSecret: (c: { env?: unknown }) => string;
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
    MembershipRow & { display_name: string; email: string }
  >(
    `SELECT m.listing_id, m.user_id, m.joined_at, u.display_name, u.email
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
    })),
  };
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

  async function authenticate(c: {
    req: { header: (name: string) => string | undefined };
    get: (key: "db" | "jwtSecret" | "userId") => unknown;
    set: (key: "userId", value: string) => void;
  }) {
    const token = parseBearer(c.req.header("Authorization"));
    if (!token) throw new HTTPException(401, { message: "認証が必要です" });
    const userId = await verifyToken(token, c.get("jwtSecret") as string);
    if (!userId) throw new HTTPException(401, { message: "トークンが無効です" });
    const user = await (c.get("db") as MatchDb).first<UserRow>(
      "SELECT id FROM users WHERE id = ?",
      userId,
    );
    if (!user) throw new HTTPException(401, { message: "ユーザーが見つかりません" });
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

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error(err);
    return c.json({ error: "内部エラー" }, 500);
  });

  return app;
}
