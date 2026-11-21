# Cloudflare Workers デプロイ手順

マッチ API 専用 Worker（LiveKit + 課金）。

## 前提

1. Cloudflare アカウントで `npx wrangler login`（または `CLOUDFLARE_API_TOKEN` を環境に設定。値はチャットに貼らない）
2. Node 20+ / このディレクトリで `npm install`

## 手順

```bash
cd api
npm install

# 1) D1 作成（出力の database_id を wrangler.toml に反映）
npx wrangler d1 create game-match-db

# 2) スキーマ適用（リモート）
npx wrangler d1 execute game-match-db --remote --file=./schema.sql

# 3) JWT 秘密鍵（対話入力。値をログに出さない）
npx wrangler secret put JWT_SECRET

# 3b) LiveKit（既存 Worker `wake60-calls` と同じ鍵を推奨。値をログに出さない）
npx wrangler secret put LIVEKIT_API_KEY
npx wrangler secret put LIVEKIT_API_SECRET
# 任意（未設定時は wss://tuuwa-pq36hupv.livekit.cloud）
# npx wrangler secret put LIVEKIT_URL

# 3c) 課金スキーマ（既存 D1 向け。新規は schema.sql に含まれる）
npx wrangler d1 execute game-match-db --remote --file=./migrations/001_billing.sql

# 3c2) 評価・通報スキーマ（既存 D1 向け。新規は schema.sql に含まれる）
npx wrangler d1 execute game-match-db --remote --file=./migrations/002_ratings_reports.sql

# 3d) Stripe（Web Checkout。値をログに出さない）
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# 任意: 固定 Price を使う場合
# npx wrangler secret put STRIPE_PRICE_ID
# 本番ではモック購入を切る
npx wrangler secret put ALLOW_MOCK_PURCHASE
# → 値に 0 を入力

# 4) デプロイ
npx wrangler deploy

# 5) 動作確認
curl -s https://<worker-host>/health
curl -s https://<worker-host>/games
# 参加済みユーザーの Bearer で:
# curl -s -X POST https://<worker-host>/listings/<id>/call-token -H "Authorization: Bearer <jwt>"
```

Webhook エンドポイント（Stripe Dashboard で設定）:

`https://<worker-host>/billing/webhook`  
イベント: `checkout.session.completed`

## ローカル

```bash
# LiveKit 付きで試す場合（値はシェル履歴に残るので注意）
export LIVEKIT_API_KEY=...
export LIVEKIT_API_SECRET=...
# export LIVEKIT_URL=wss://tuuwa-pq36hupv.livekit.cloud

npm run start          # SQLite on :8787（Stripe 未設定時はモック購入可）
npm run test:smoke
```

## 現在のデプロイ

- URL: https://game-match-api.0v09979.workers.dev
- D1: `game-match-db`（database_id は wrangler.toml 参照）
- JWT_SECRET: Worker secret として設定済み（値はリポジトリに含めない）
- LIVEKIT_API_KEY / LIVEKIT_API_SECRET: デプロイ時に設定が必要（未設定だと `POST .../call-token` が 503）
- 課金シークレット（要設定）: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`（未設定時はモック購入）
