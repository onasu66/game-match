/**
 * End-to-end smoke against a running local API (default http://127.0.0.1:8787).
 */
const BASE = process.env.API_BASE || "http://127.0.0.1:8787";

async function req(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const stamp = Date.now();
  const hostEmail = `host_${stamp}@example.com`;
  const guestEmail = `guest_${stamp}@example.com`;

  // under 18 must fail
  const under = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: `kid_${stamp}@example.com`,
      password: "password123",
      displayName: "Kid",
      birthDate: "2015-01-01",
    }),
  });
  assert(under.status === 403, `expected 403 for under-18, got ${under.status}`);

  const hostReg = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: hostEmail,
      password: "password123",
      displayName: "HostPlayer",
      birthDate: "2000-05-05",
      favoriteGames: ["Valorant"],
    }),
  });
  assert(hostReg.status === 201, `host register failed: ${JSON.stringify(hostReg.json)}`);
  const hostToken = hostReg.json.token as string;

  const guestReg = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: guestEmail,
      password: "password123",
      displayName: "GuestPlayer",
      birthDate: "1998-01-01",
    }),
  });
  assert(guestReg.status === 201, `guest register failed`);
  const guestToken = guestReg.json.token as string;

  const games = await req("/games");
  assert(games.json.games?.length === 6, "expected 6 games");

  const created = await req("/listings", {
    method: "POST",
    headers: { Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify({
      game: "Valorant",
      rankNote: "金〜ダイヤ",
      slots: 5,
      description: "ランク募集",
      voiceOptional: true,
    }),
  });
  assert(created.status === 201, `create listing failed: ${JSON.stringify(created.json)}`);
  const listingId = created.json.listing.id as string;

  const join = await req(`/listings/${listingId}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${guestToken}` },
  });
  assert(join.status === 200, `join failed: ${JSON.stringify(join.json)}`);
  assert(
    join.json.listing.members.length === 2,
    `expected 2 members, got ${join.json.listing.members.length}`,
  );

  const detail = await req(`/listings/${listingId}`, {
    headers: { Authorization: `Bearer ${guestToken}` },
  });
  assert(detail.json.listing.members.some((m: { displayName: string }) => m.displayName === "GuestPlayer"));

  // Non-member cannot get call token
  const outsiderReg = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: `out_${stamp}@example.com`,
      password: "password123",
      displayName: "Outsider",
      birthDate: "1999-06-01",
    }),
  });
  assert(outsiderReg.status === 201, "outsider register failed");
  const outsiderToken = outsiderReg.json.token as string;
  const denied = await req(`/listings/${listingId}/call-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${outsiderToken}` },
  });
  assert(denied.status === 403, `expected 403 for non-member call, got ${denied.status}`);

  const call = await req(`/listings/${listingId}/call-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${guestToken}` },
  });
  if (call.status === 503) {
    console.log("LiveKit secrets not set locally — call-token returned 503 (expected without keys)");
  } else {
    assert(call.status === 200, `call-token failed: ${JSON.stringify(call.json)}`);
    assert(typeof call.json.url === "string" && call.json.url.startsWith("wss://"), "missing LiveKit url");
    assert(typeof call.json.token === "string" && call.json.token.length > 20, "missing LiveKit token");
    assert(call.json.roomName === `listing-${listingId}`, "unexpected room name");
    // Decode JWT payload (no verify) to confirm grants
    const payloadB64 = (call.json.token as string).split(".")[1];
    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    assert(payload.video?.roomJoin === true, "token missing roomJoin");
    assert(payload.video?.room === `listing-${listingId}`, "token room mismatch");
    assert(typeof payload.sub === "string" && payload.sub.length > 0, "token sub missing");
  }

  console.log("SMOKE OK");
  console.log(
    JSON.stringify(
      {
        hostEmail,
        guestEmail,
        listingId,
        members: detail.json.listing.members.map((m: { displayName: string }) => m.displayName),
        callTokenStatus: call.status,
        roomName: call.json.roomName ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
