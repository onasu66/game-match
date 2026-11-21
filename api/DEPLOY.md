# Cloudflare Workers デプロイ手順

LiveKit 鍵は触らない。マッチ API 専用 Worker。

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

# 4) デプロイ
npx wrangler deploy

# 5) 動作確認
curl -s https://<worker-host>/health
curl -s https://<worker-host>/games
```

## ローカル

```bash
npm run start          # SQLite on :8787
npm run test:smoke
```

## 現在のデプロイ

- URL: https://game-match-api.0v09979.workers.dev
- D1: `game-match-db`（database_id は wrangler.toml 参照）
- JWT_SECRET: Worker secret として設定済み（値はリポジトリに含めない）
