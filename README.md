# miniapp-temp
ミニアプリ開発用テンプレート

## セットアップ手順
### 1. Nix をインストールする
```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```
> **Determinate Systems 版を推奨。** `nix-command` と `flakes` が最初から有効なため、追加設定不要。

## 日次プランナー（試作: `dev/`）
Vite + React + TypeScript。データはブラウザの localStorage に保存（JSON でバックアップ／読み込み可能）。

```bash
cd dev && npm install && npm run dev   # http://localhost:5173
npm test                               # 時間計算・差分・後続ずらし・CSV のテスト
```

- 時刻計算・集計は `dev/src/core.ts`（UI 非依存）。
- AI やブラウザ自動操作からは `window.planner` を使う（`getDay`, `listDays`, `addActivity`, `updateActivity`, `removeActivity`, `shiftFollowing`, `setRecurrence`, `listRules`, `setRange`, `setStatus`, `exportCSV`）。時刻は `"HH:MM"` 文字列で渡せる。
