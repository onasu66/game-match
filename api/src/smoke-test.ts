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

  console.log("SMOKE OK");
  console.log(
    JSON.stringify(
      {
        hostEmail,
        guestEmail,
        listingId,
        members: detail.json.listing.members.map((m: { displayName: string }) => m.displayName),
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
