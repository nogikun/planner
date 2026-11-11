# 日次プランナー

1日の予定を時間割にして、実績の記録や振り返りができるプランナーです。ブラウザ画面と CLI に加え、Claude Code と相談しながら予定を組む `planner` スキルを備えています。

## はじめる

Node.js 24 を用意してください。CLI には Node.js 22.18 以降が必要です。

```bash
cd skills/planner/tools
npm install
npm run dev
```

表示された URL（通常は <http://localhost:5173>）をブラウザで開きます。終了するときは `Ctrl+C` を押します。

## Claude Code で使う

このリポジトリで Claude Code を起動し、「今日の予定を組んで」「振り返りしたい」のように伝えます。`.claude/skills/planner` はスキル本体へのリンクです。予定の提案を相談し、合意した内容をプランナーに反映できます。

`.claude/settings.json` のフックは、セッション開始時と予定に関する入力時に、保存済みの予定があれば Claude に状況を渡します。

## CLI とデータ

リポジトリのルートから、次のように実行できます。

```bash
node skills/planner/tools/cli.ts brief       # 今日の予定と空き時間
node skills/planner/tools/cli.ts show today  # 今日の予定を JSON で表示
node skills/planner/tools/cli.ts where       # データの保存先を表示
```

予定は既定で `~/.planner/store.json` に保存され、画面と CLI で共有されます。保存先を変えるには、画面のサーバーと CLI の両方で同じ `PLANNER_DATA` 環境変数を指定してください。CLI の変更は開いている画面にも反映されます。

詳しくは [スキルの使い方](skills/planner/SKILL.md)、[CLI リファレンス](skills/planner/references/cli.md)、[セットアップとトラブルシューティング](skills/planner/references/setup.md) を参照してください。

## 開発

`skills/planner/tools` で実行します。

```bash
npm test        # テスト
npm run lint    # 静的解析
npm run build   # ビルド
```

任意で `nix develop` を使うと、mise・direnv・Task を含む開発環境を利用できます。Node.js は別途用意してください。
