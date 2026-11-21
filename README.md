# ゲーム通話 — マッチ + LiveKit 通話

Flutter（Android / iOS / Web）クライアントと、マッチ用 API（ローカル Node + SQLite / Cloudflare Worker + D1）です。募集参加後に LiveKit 音声ルームへ入れます（マイク任意）。

## 認証方式

**メールアドレス + パスワード（JWT）**

- 登録時に生年月日必須。計算上 18 歳未満は `403` で拒否
- 年齢確認済みユーザーのみ認証 API / 通話トークンを利用可能
- トークンはクライアントの `SharedPreferences` に保存

## 構成

```
game-match/
  app/     Flutter クライアント（LiveKit クライアント接続）
  api/     マッチ API（Hono）+ LiveKit AccessToken 発行
```

初期タイトル固定: Apex Legends / League of Legends / Overwatch / ストリートファイター / Valorant / Minecraft

非スコープ: モデレーション管理画面、自動マッチ、ネイティブアプリ内課金（IAP）

## 通話の流れ

1. ログイン（18+）→ 募集作成 or 参加
2. 募集詳細で「通話ルームに入る」
3. API `POST /listings/:id/call-token` が `{ url, token, roomName }` を返す
4. アプリは鍵を持たず、受け取った `url` + `token` で LiveKit に接続
5. 入室時はマイク OFF（聞き取り専用可）。ミュート解除 / 退室あり

ルーム名: `listing-<listingId>`  
LiveKit URL（既定）: `wss://tuuwa-pq36hupv.livekit.cloud`

## 課金（ポイント制・プレミアム共存）

**主課金はポイント。Stripe Checkout（Web）。App Store / Google Play のアプリ内課金は後続。**

- ポイントパック: 100（¥120）/ 500（¥480）/ 1000（¥900）
- 消費:
  - 募集作成: 同時公開は無料 1 件。追加は **50 pt**/件（上限 10）。プレミアム中は無料枠 **5** 件
  - 通話開始: 1 日 **1 回**無料。超過は **20 pt**/回
- プレミアム（30 日・¥480）は任意で共存（無料枠拡大 + バッジ）
- UI は専用画面を増やず、既存プロフィールに残高・購入・履歴を配置
- Stripe 未設定時は `POST /billing/mock-purchase`（`product` 指定）が有効

必要な Worker シークレット名（値はリポジトリ・チャットに出さない）:

| 名前 | 必須 | 説明 |
|------|------|------|
| `JWT_SECRET` | 済 | アプリ JWT |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | 通話 | LiveKit |
| `STRIPE_SECRET_KEY` | 本番課金 | Stripe シークレット |
| `STRIPE_WEBHOOK_SECRET` | 本番課金 | Webhook 署名検証 |
| `STRIPE_PRICE_ID` | 任意 | レガシープレミアム用固定 Price |
| `ALLOW_MOCK_PURCHASE` | 任意 | 本番は `0` 推奨 |

## 本番デプロイ（Cloudflare）

- Worker: https://game-match-api.0v09979.workers.dev
- 詳細手順: `api/DEPLOY.md`
- リポジトリ: https://github.com/onasu66/game-match
- 課金スキーマ: `npx wrangler d1 execute game-match-db --remote --file=./migrations/001_billing.sql`
- 評価・通報スキーマ: `npx wrangler d1 execute game-match-db --remote --file=./migrations/002_ratings_reports.sql`
- ポイントスキーマ: `npx wrangler d1 execute game-match-db --remote --file=./migrations/003_points.sql`

必要な Worker シークレット:

| 名前 | 説明 |
|------|------|
| `JWT_SECRET` | アプリ JWT（設定済み想定） |
| `LIVEKIT_API_KEY` | LiveKit API Key（既存 `wake60-calls` と同値を推奨） |
| `LIVEKIT_API_SECRET` | LiveKit API Secret |
| `LIVEKIT_URL` | 任意。未設定時は上記 wss URL |

```bash
cd api
npx wrangler secret put LIVEKIT_API_KEY
npx wrangler secret put LIVEKIT_API_SECRET
npm run cf:deploy
```

アプリから使う例:

```bash
flutter run --dart-define=API_BASE=https://game-match-api.0v09979.workers.dev
```

## API 起動（ローカル）

```bash
cd api
npm install --legacy-peer-deps
# 任意: LiveKit 鍵（値はログに出さない）
export LIVEKIT_API_KEY=...
export LIVEKIT_API_SECRET=...
npm run start          # http://127.0.0.1:8787
npm run test:smoke     # 別ターミナル
```

鍵未設定でもマッチ API のスモークは通る（`call-token` は 503）。

## アプリ起動

```bash
export PATH="/opt/flutter/bin:$PATH"
cd app
flutter pub get

# Web デモ
flutter run -d chrome --web-browser-flag "--disable-web-security" \
  --dart-define=API_BASE=http://127.0.0.1:8787

# Android エミュレータ
flutter run --dart-define=API_BASE=http://10.0.2.2:8787
```

## 受け入れフロー（手動）

1. 年齢確認で「18歳以上」→ 登録（生年月日が 18 未満なら API が拒否）
2. 6 タイトルから募集作成（マイク任意フラグ付き）
3. 別アカウントでログインし、その募集に参加
4. 詳細画面で参加者一覧を確認 →「通話ルームに入る」
5. ミュートのまま参加できること、ミュート解除 / 退室ができること
6. 募集詳細の参加者メニューから評価・通報できること
7. プロフィールに受け取った評価の平均が表示されること

## エンドポイント概要

| Method | Path | 説明 |
|--------|------|------|
| POST | `/auth/register` | 登録（18+） |
| POST | `/auth/login` | ログイン |
| GET | `/auth/me` | 自分 |
| PATCH | `/profile` | 表示名・好きなタイトル |
| GET | `/games` | 固定 6 タイトル |
| GET | `/listings` | 一覧（`?game=`） |
| POST | `/listings` | 作成（無料は同時1件まで） |
| GET | `/listings/:id` | 詳細＋参加者 |
| POST | `/listings/:id/join` | 参加 |
| POST | `/listings/:id/call-token` | LiveKit `url` + `token`（参加者のみ） |
| POST | `/listings/:id/ratings` | 参加者を星1〜5で評価（upsert） |
| POST | `/listings/:id/reports` | 参加者を通報（理由 + 任意コメント） |
| GET | `/ratings/me` | 自分への評価サマリ |
| GET | `/reports/reasons` | 通報理由一覧 |
| GET | `/billing/status` | ポイント残高・パック・消費ルール・履歴 |
| GET | `/billing/history` | ポイント履歴 |
| POST | `/billing/checkout` | Stripe Checkout（`product`: points_* / premium_30d） |
| POST | `/billing/confirm` | Checkout 完了後の付与確認 |
| POST | `/billing/mock-purchase` | 開発用モック購入（同上 product） |
| POST | `/billing/webhook` | Stripe Webhook |
