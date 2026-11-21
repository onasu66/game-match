import { SignJWT } from "jose";

const encoder = new TextEncoder();

export type LiveKitConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

export function listingRoomName(listingId: string): string {
  return `listing-${listingId}`;
}

/**
 * Mint a LiveKit AccessToken (HS256) for room join.
 * Grants publish + subscribe so mic can stay off until the user unmutes.
 */
export async function createLiveKitAccessToken(opts: {
  config: LiveKitConfig;
  identity: string;
  name: string;
  roomName: string;
  ttlSeconds?: number;
}): Promise<string> {
  const ttl = opts.ttlSeconds ?? 60 * 60 * 6;
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    name: opts.name,
    video: {
      roomJoin: true,
      room: opts.roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(opts.config.apiKey)
    .setSubject(opts.identity)
    .setNotBefore(now - 10)
    .setExpirationTime(now + ttl)
    .sign(encoder.encode(opts.config.apiSecret));
}

export function readLiveKitConfigFromEnv(env: {
  LIVEKIT_URL?: string;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
}): LiveKitConfig | null {
  const apiKey = env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = env.LIVEKIT_API_SECRET?.trim() ?? "";
  if (!apiKey || !apiSecret) return null;
  const url =
    env.LIVEKIT_URL?.trim() || "wss://tuuwa-pq36hupv.livekit.cloud";
  return { url, apiKey, apiSecret };
}
