import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { openLocalDb } from "./local-db.js";

const db = openLocalDb();
const jwtSecret = process.env.JWT_SECRET || "dev-change-me-in-production";
const port = Number(process.env.PORT || 8787);

const app = createApp({
  getDb: () => db,
  getJwtSecret: () => jwtSecret,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`game-match-api listening on http://127.0.0.1:${info.port}`);
  console.log("Auth: email + password (JWT)");
});
