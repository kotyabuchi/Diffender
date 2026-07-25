# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスです。
より詳細な寄稿ガイドは [AGENTS.md](AGENTS.md) を参照してください（両者は同じ不変条件を共有します）。

## プロダクトの意図

Diffender は AI 生成コードのレビュー労力を減らすための Electron デスクトップアプリ。
ローカルの Git リポジトリ／worktree の未コミット変更を確認し、保存済み ChatGPT 認証の
Codex CLI に読み取り専用レビューを依頼し、目的別グループ・リスク・指摘を承認する。

**このアプリはまず読み取り専用のレビュー面である。** 登録リポジトリを stage / revert /
commit する等の変更操作は、将来別途「明示的に確認された機能」として設計する。現状は
`0.1.0` MVP。Diffender 自身は commit / push / PR を行わず、「フィードバックを送る」を
明示実行したときだけ、紐付けた実装エージェントが対象プロジェクトを変更する。

## コマンド

```powershell
pnpm install
pnpm start        # development build + Electron 起動
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest を一度実行
pnpm test:watch   # Vitest watch mode
pnpm package      # unpacked application を作成
pnpm make         # MakerZIP で Windows ZIP artifact を作成
```

変更を提出する前の最小確認:

1. `pnpm typecheck`
2. `pnpm test`
3. Electron / Forge / preload / packaging に関わる変更では `pnpm package`
4. renderer 変更では empty / populated / loading / error / stale / approval の各状態を目視確認
5. renderer コードが Node.js に直接アクセスしていないか再確認

## アーキテクチャ境界

- `src/main/**` — filesystem、Git、Codex CLI プロセス、永続化、リポジトリ検証、Electron IPC handler を所有する。
- `src/main.ts` — Electron lifecycle / composition root。
- `src/preload.ts` — `contextBridge` 経由で narrow な型付き API のみ公開する。汎用 IPC を渡さない。
- `src/renderer/**` — 非特権の React アプリ。**Node.js / Electron main-process モジュールを import してはいけない。**
- `src/shared/contracts.ts` — IPC payload と domain 型の唯一の共有契約（source of truth）。
- renderer 入力は信頼しない。project ID、path、review ID、group ID は main で再検証する。

### 主要モジュール（`src/main/`）

| ファイル | 責務 |
| --- | --- |
| `git.ts` | repository 検証 / status / diff 収集 |
| `diff.ts` | patch parser / deterministic diff hash / group fingerprint |
| `codex.ts` | Codex status / child process / 出力パース |
| `codex-app-server.ts` | Codex App Server 経由のタスク連携（`thread/start`, `turn/start`） |
| `claude.ts` | Claude Code CLI の継続実行連携 |
| `implementation-agent.ts` | 実装先エージェント（Codex / Claude Code）の判定 |
| `review-service.ts` | project / review / cache / approval のオーケストレーション |
| `schema.ts` | review JSON Schema の materialization |
| `store.ts` | atomic JSON store |
| `ipc.ts` | allow-list された IPC handler |

## セキュリティ不変条件（厳守）

- executable は argument 配列と `shell: false` で spawn する。ユーザー入力を shell 文字列に展開しない。
- Codex レビューは `--sandbox read-only` / `--ephemeral` / `--ignore-user-config` で実行する。
- Codex child の環境から `CODEX_API_KEY` と `OPENAI_API_KEY` を除去する。API key 認証は拒否する。
- Codex 認証 token を read / copy / expose / persist しない。Diffender は認証情報を保存しない。
- `contextIsolation: true` / `sandbox: true` / `nodeIntegration: false` を維持する。
- リモート renderer コンテンツを読み込まない。
- 直接送信する実装 turn は登録リポジトリのみ書き込み可能にし、network access を無効化。承認要求が必要な操作を自動許可しない。
- Claude Code は `--continue --print --permission-mode acceptEdits` で継続する。`--dangerously-skip-permissions` は使わず、`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` を子プロセスに渡さない。
- 登録リポジトリは、将来の要件が明示的に変えない限り読み取り専用。

### Windows での Codex 起動

拡張子なしの npm shim は Electron から直接起動できない。検出した `@openai/codex/bin/codex.js`
を外部の `node.exe` で `shell: false` のまま実行する。特殊配置は `DIFFENDER_CODEX_PATH`
（`codex.exe` または `codex.js` の絶対パス）で指定できる。

## レビュー・キャッシュ不変条件

- Git 内容が source of truth。AI 要約は advisory（参考）に過ぎない。
- Git refresh と Codex run を同じ操作にしない（refresh は AI レビューを消費しない）。
- AI レビューは exact な deterministic diff hash に対してのみキャッシュする。
- cache key は review contract version と現在の `diffHash` を組み合わせる。prompt / schema / fingerprint algorithm を変えたら contract version を更新し、旧 cache を無効化する。
- approval は group fingerprint に束縛する。fingerprint が変われば approval を自動無効化する。
- untracked file を無言で省かない。未対応の binary / 上限超過 file は明示的に報告する。
- Codex 出力は JSON parse だけでなく shape と値域も検証してから信頼する。

## State

- state 変更は main process に限定する。
- memory state を更新後、temporary file → `fsync` → replace の順で `${userData}/diffender-state.json` に保存する。
- state schema に version を持たせ、parse できない state を無言で上書きしない。credential / 不要な raw output を保存しない。

## コードスタイル

- global mutable state より、明示的な依存を持つ小さな module を優先する。
- IPC handler は薄く保ち、振る舞いは testable な service に委譲する。
- exhaustive union を使い `any` を避ける。
- 性能に効く renderer コードでは barrel export を避ける。
- 大きい diff 行は分離し、無関係な UI 状態で再レンダーされないようにする。

## IPC を追加するとき

1. `src/shared/contracts.ts` に domain operation と型を追加。
2. main handler で payload と state 関係を検証。
3. preload に必要最小限の wrapper を追加。
4. renderer は wrapper だけを呼ぶ。
5. success / 不正 payload / 存在しない ID / handler failure を test。
6. `docs/security.md` の threat model に新しい権限がないか確認。

汎用 filesystem access、任意 command、任意 channel、任意 URL open を追加してはいけない。

## テスト

- Vitest。実 Codex を使う test は通常 suite から分離し明示的 opt-in にする。既定の CI / local test で ChatGPT 利用枠を消費しない。
- `turn/start` は利用枠を消費し project を変更し得るため、自動 test で実行しない（`thread/list` の read-only smoke は消費しない）。
- process adapter は fake / fixture に差し替え可能な境界に保つ。

## 技術スタック

Electron 43 / React 19 / TypeScript / Vite（Electron Forge + Vite plugin）/ Vitest。配布は
Windows ZIP のみ（installer / 自動 update / code signing / macOS・Linux は MVP 対象外）。

## ドキュメント

- [製品仕様](docs/product-spec.md) / [アーキテクチャ](docs/architecture.md) / [開発ガイド](docs/development.md)
- [セキュリティ](docs/security.md) / [レビューパイプライン](docs/review-pipeline.md)
- [Codexタスク連携](docs/codex-handoff.md) / [実装エージェント判定](docs/implementation-agents.md)
- [実装計画](docs/implementation-plan.md) / [ロードマップ](docs/roadmap.md)
