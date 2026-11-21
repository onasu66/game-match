import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { isPremiumActive, maxOpenListingsFor } from "./billing.js";

const encoder = new TextEncoder();

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function signToken(
  userId: string,
  secret: string,
): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(encoder.encode(secret));
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    if (typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** Birth date YYYY-MM-DD must be at least 18 years ago. */
export function isAtLeast18(birthDate: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [y, m, d] = birthDate.split("-").map(Number);
  const birth = new Date(Date.UTC(y, m - 1, d));
  if (
    birth.getUTCFullYear() !== y ||
    birth.getUTCMonth() !== m - 1 ||
    birth.getUTCDate() !== d
  ) {
    return false;
  }
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()),
  );
  return birth.getTime() <= cutoff.getTime();
}

export function publicUser(row: {
  id: string;
  email: string;
  display_name: string;
  birth_date: string;
  favorite_games: string;
  created_at: string;
  premium_until?: string | null;
}) {
  let favoriteGames: string[] = [];
  try {
    favoriteGames = JSON.parse(row.favorite_games);
  } catch {
    favoriteGames = [];
  }
  const premiumUntil = row.premium_until ?? null;
  const isPremium = isPremiumActive(premiumUntil);
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    birthDate: row.birth_date,
    favoriteGames,
    createdAt: row.created_at,
    ageVerified: true,
    isPremium,
    premiumUntil,
    plan: isPremium ? ("premium" as const) : ("free" as const),
    maxOpenListings: maxOpenListingsFor(isPremium),
  };
}
