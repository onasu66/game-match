# ゲーム通話 — マッチ体験 MVP

Flutter（Android / iOS / Web）クライアントと、マッチ用簡易 API（ローカル Node + SQLite / Cloudflare Worker + D1 対応）です。

## 認証方式

**メールアドレス + パスワード（JWT）**

- 登録時に生年月日必須。計算上 18 歳未満は `403` で拒否
- トークンはクライアントの `SharedPreferences` に保存

## 構成

```
game-match/
  app/     Flutter クライアント
  api/     マッチ API（Hono）
```

初期タイトル固定: Apex Legends / League of Legends / Overwatch / ストリートファイター / Valorant / Minecraft

非スコープ: LiveKit 通話接続、評価・通報、自動マッチ

## 本番デプロイ（Cloudflare）

- Worker: https://game-match-api.0v09979.workers.dev
- 詳細手順: `api/DEPLOY.md`
- リポジトリ: https://github.com/onasu66/game-match

アプリから使う例:

```bash
flutter run --dart-define=API_BASE=https://game-match-api.0v09979.workers.dev
```

## API 起動（ローカル）

```bash
cd api
npm install
npm run start          # http://127.0.0.1:8787
npm run test:smoke     # 別ターミナルで受け入れスモーク
```

Cloudflare Worker + D1 へデプロイする場合:

```bash
cd api
# wrangler.toml の database_id を実 D1 に差し替え
npx wrangler d1 execute game-match-db --file=./schema.sql
npm run cf:deploy
```

既存通話 Worker の LiveKit 鍵は触りません（本 API は独立）。

## アプリ起動

```bash
export PATH="/opt/flutter/bin:$PATH"   # この VM の場合
cd app
flutter pub get

# Web（この VM でのデモ向け）
flutter run -d chrome --web-browser-flag "--disable-web-security" \
  --dart-define=API_BASE=http://127.0.0.1:8787

# Android 実機/エミュレータ
# エミュレータなら API_BASE=http://10.0.2.2:8787
flutter run --dart-define=API_BASE=http://10.0.2.2:8787
```

## 受け入れフロー（手動）

1. 年齢確認で「18歳以上」→ 登録（生年月日が 18 未満なら API が拒否）
2. 6 タイトルから募集作成（マイク任意フラグ付き）
3. 別アカウントでログインし、その募集に参加
4. 詳細画面で参加者一覧を確認

## エンドポイント概要

| Method | Path | 説明 |
|--------|------|------|
| POST | `/auth/register` | 登録（18+） |
| POST | `/auth/login` | ログイン |
| GET | `/auth/me` | 自分 |
| PATCH | `/profile` | 表示名・好きなタイトル |
| GET | `/games` | 固定 6 タイトル |
| GET | `/listings` | 一覧（`?game=`） |
| POST | `/listings` | 作成 |
| GET | `/listings/:id` | 詳細＋参加者 |
| POST | `/listings/:id/join` | 参加 |
