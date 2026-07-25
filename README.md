# Diffender

ローカルの Git リポジトリ／worktree にある未コミット変更を、ひとつの受信箱で確認するための Electron デスクトップアプリです。差分を表示し、保存済みの ChatGPT 認証を使う Codex CLI に読み取り専用レビューを依頼し、目的単位のグループ・リスク・指摘を確認して承認できます。確認後は、未承認項目と自分のメモを既存または新規の Codex タスクへ引き渡せます。

> 現在は MVP（`0.1.0`）です。Diffender 自身はコミット、push、PR 作成を行いません。「フィードバックを送る」を明示的に実行した場合だけ、紐付けた Codex タスクが対象プロジェクト内を変更します。承認はローカル記録であり、Git やホスティングサービスの承認とは別物です。

## MVP でできること

- 複数のローカル Git リポジトリまたは個別 worktree を登録・削除
- ブランチ、HEAD、変更有無を Git から再取得
- 未コミット差分とファイルごとの追加／削除行数を表示
- `codex exec` を `read-only`、`ephemeral`、ユーザー設定分離、JSON Schema 指定で起動
- レビュー結果を目的単位にグループ化し、リスクと指摘を表示
- AI の要約・意図・指摘・提案を日本語で生成
- 確認ポイントごとに自分のメモを保存
- Git の内部ヘッダーを省いた、変更行中心の差分表示
- 言い切りの一言要約、ファイル・チャンク・追加／削除行、承認進捗を固定ヘッダーに表示
- 要約と目的別グループへ移動でき、現在位置を示すレビュー目次
- グループ単位で承認／承認解除
- 承認結果、指摘、自分のメモから日本語の修正指示を生成してコピー
- 対象プロジェクト用の Codex タスクを新規作成
- 既存の Codex App / CLI タスクを選択、またはタスク ID で紐付け
- Codex App Server 経由で修正指示を直接送信し、開始・完了を表示
- Codex / Claude Code のプロジェクト設定と CLI を検出し、実装先を自動判定または手動指定
- Claude Code の直近プロジェクトセッションへ修正指示を直接送信
- レビュー済み画面の右下に、コピーと送信を常時使える固定アクションパネル
- 差分 hash によるレビューキャッシュ
- グループ fingerprint による「別の差分への承認持ち越し」防止
- 進捗、失敗、再試行を UI に表示

## 必要なもの

- Windows（MVP の配布設定は Windows 向け）
- Node.js と `pnpm`
- Git
- Codex CLI
- Codex CLI の **ChatGPT ログイン**

Codex CLI はアプリの内部に組み込まず、端末で既に保存されている認証を利用します。ChatGPT ログインでの利用は、契約中の ChatGPT プランに設定された Codex 利用上限の対象です。

API key 認証は従量課金になり得るため、MVP ではレビューに使用しません。アプリは Codex 子プロセスから `OPENAI_API_KEY` と `CODEX_API_KEY` を取り除き、ChatGPT 以外の認証方式では警告して実行を止めます。アプリ内で API key を入力・保存する機能もありません。

## 開発版を起動する

```powershell
pnpm install
pnpm start
```

最初に Codex CLI の状態を確認します。未インストールまたは未ログインの場合は、通常の端末で `codex login` を実行してください。ログイン後はアプリ上部の「更新」を押すと、Git 情報と一緒に Codex の状態も再確認します。

Windows の npm グローバルインストールでは、拡張子なしの `codex` shim を Electron から直接実行できません。そのため Diffender は `@openai/codex/bin/codex.js` と外部の `node.exe` を検出し、`shell: false` のまま起動します。特殊な配置の場合は、`DIFFENDER_CODEX_PATH` に `codex.exe` または `codex.js` の絶対パスを指定できます。

レビュー実行時は `--ignore-user-config` を指定します。ChatGPT の保存済み認証は引き続き利用されますが、ユーザー設定の MCP server、hook、その他の Codex 設定をレビュー専用プロセスへ持ち込みません。これにより、Serena などが対象リポジトリへメタデータを生成して差分を変えることを防ぎます。

主なコマンド:

```powershell
pnpm typecheck   # TypeScript の静的検査
pnpm test        # Vitest を一度実行
pnpm test:watch  # Vitest の watch mode
pnpm package     # unpacked application を作成
pnpm make        # Windows ZIP 配布物を作成
```

## 基本的な使い方

1. 「プロジェクト追加」から既存の Git リポジトリまたは worktree のルートを選びます。
2. Inbox で変更のあるプロジェクトを選択します。
3. 「更新」で現在の Git 状態と差分を取り直します。これは AI レビューを消費しません。
4. 差分を確認し、必要なときだけ「AIレビュー」を実行します。
5. 目的別の変更、リスク、確認ポイントを確認します。
6. 各確認ポイントに必要な判断や対応方針をメモします。
7. 内容に納得したグループを承認します。
8. 右下の「修正指示」で実装先を確認します。Codexタスクの紐付け、`CLAUDE.md` / `.claude`、`AGENTS.md` / `.codex`、CLI導入状態から候補を表示し、必要なら手動で切り替えます。
9. Codexを使う場合は既存タスクを選ぶか、「新規タスク」を押します。別フォルダで開始した既存タスクも表示できます。Claude Codeは対象フォルダの直近セッションを継続します。
10. 必要に応じて「クリップボードにコピー」で内容を確認します。
11. 「フィードバックを送る」を押すと、確認後に選択した実装エージェントで修正が始まります。完了表示後に「更新」し、変更を再レビューします。

新規タスクは Codex App Server の `thread/start` で作成し、登録プロジェクトを作業フォルダとして保存します。既存タスクへ送る場合も、その turn では登録プロジェクトを作業フォルダとして上書きします。詳しい流れは [Codexタスク連携](docs/codex-handoff.md) を参照してください。

Claude Code は `--continue --print --permission-mode acceptEdits` で、登録プロジェクトの直近セッションを継続します。`--dangerously-skip-permissions` は使用せず、`ANTHROPIC_API_KEY` と `ANTHROPIC_AUTH_TOKEN` は子プロセスへ引き継ぎません。判定の限界と切替方法は [実装エージェント判定](docs/implementation-agents.md) を参照してください。

登録した worktree は独立した項目として扱います。同じ repository に属する別 worktree を自動列挙する機能は、MVP の対象外です。

## データの扱い

| データ | 所有する場所／処理 |
| --- | --- |
| 登録プロジェクト、レビュー結果、承認 | Electron の user data 配下にあるローカル JSON 状態 |
| Git 読み取り、差分生成 | Electron main process |
| Codex CLI / App Server 起動、schema 検証、タスク連携 | Electron main process |
| 表示状態 | sandboxed renderer |
| 認証情報 | Codex CLI が管理。Diffender は保存しない |

状態は `${app.getPath("userData")}/diffender-state.json` に保存します。実際の絶対 path は OS と Electron の設定で変わります。状態ファイルは同じ directory の一時ファイルへ書き、`fsync` 後に置換します。MVP は単一ユーザー／単一アプリインスタンスを想定した JSON store で、SQLite は将来の移行候補に留まります。

## セキュリティ上の前提

- renderer は Node.js API に直接アクセスできません。
- preload が公開する IPC は許可された操作だけです。
- Git と Codex は `shell: false` で起動し、ユーザー入力を shell 文字列として展開しません。
- AIレビューは登録リポジトリを作業ディレクトリにした `read-only` / `ephemeral` session です。
- 直接送信する実装 turn は登録リポジトリだけを書き込み可能にし、network access を無効化します。承認要求が必要な操作は自動許可しません。
- レビュー対象のコードや差分は信頼できない入力です。Codex の返答も JSON Schema とアプリ側検証を通すまで信頼しません。
- 「承認」は安全性の保証ではありません。高リスク変更はテストと人手確認が必要です。

詳細は [Security](docs/security.md) を参照してください。

## 現在の制約

- 未コミットの working tree / index 差分を対象とするローカルレビューです。
- binary file は内容レビューできず、変更の存在だけを扱います。
- untracked text は 1 file 512 KiB、合計 2 MiB までです。symlink、NUL を含む file、上限を超えた file は省略します。
- 巨大差分、submodule、特殊な Git 構成では情報が省略されることがあります。
- リポジトリの再帰探索や worktree の一括登録はありません。
- レビューのスケジューリング、履歴検索、共有、クラウド同期はありません。
- Codex App Server は Codex CLI の実験的インターフェースです。CLI 更新で protocol が変わった場合は連携機能が一時的に利用できない可能性があります。
- 実装中のタスクへの追加送信、送信キュー、途中の対話承認は未実装です。タスクが実行中の場合は完了後に再送してください。
- cache key はレビュー生成形式のバージョンと現在の `diffHash` を組み合わせます。生成形式を変えた場合は旧 cache を現在のレビューとして再利用しません。
- 状態 JSON の version field はありますが、自動 migration、backup / recovery UI、署名／暗号化は未実装です。
- MVP の配布物は Windows ZIP のみです。installer、自動 update、code signing、macOS/Linux 配布は未整備です。

## ドキュメント

- [製品仕様](docs/product-spec.md)
- [アーキテクチャ](docs/architecture.md)
- [開発ガイド](docs/development.md)
- [セキュリティ](docs/security.md)
- [レビューパイプライン](docs/review-pipeline.md)
- [Codexタスク連携](docs/codex-handoff.md)
- [実装エージェント判定](docs/implementation-agents.md)
- [実装計画](docs/implementation-plan.md)
- [ロードマップ](docs/roadmap.md)

## ライセンス

このリポジトリには、現時点で明示的なライセンスが設定されていません。
