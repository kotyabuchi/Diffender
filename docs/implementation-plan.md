# 実装計画

## 1. 目的と前提

この計画は Diffender MVP を、process boundary、データ整合性、UI の順に安全に組み立てるための file-level plan です。現在のリポジトリに実装済みの項目と、MVP を堅牢にするための検証項目、post-MVP 候補を区別します。

前提:

- Electron 43 + Forge 7 / Vite + React 19 + TypeScript
- main process が Git、Codex、filesystem、canonical state を所有
- renderer は sandboxed UI
- ChatGPT login の Codex CLI だけを使用
- Git refresh と AI review は別操作
- MVP store は atomic JSON。SQLite は未実装
- repository / worktree はユーザーが個別に登録

### 現在の到達点

Phase 0〜6、Codexタスク連携、Claude Code判定・送信の実装はlanding済みです。`pnpm typecheck`、7 test files / 22 testsは成功しています。Phase 7のclean-profile ZIP smoke testと、各phaseに記載した網羅的acceptance testはrelease gateであり、すべて実施済みではありません。

既知の post-MVP hardening:

- state version の runtime validation、migration、backup / recovery
- prompt / schema contract version を含む cache invalidation
- Codex result の path membership、文字列長、配列数、ID uniqueness validation
- navigation、new-window、permission request の明示的 deny handler
- Git integration / renderer automation と署名済み release

## 2. Phase 0 — Foundation と shared contract

### 対象 files

| File | 実装内容 |
| --- | --- |
| `package.json` | start、typecheck、test、package、make scripts と dependency |
| `forge.config.ts` | Vite build、Windows MakerZIP、ASAR、Electron fuses |
| `vite.main.config.ts` | main process bundle |
| `vite.preload.config.ts` | preload bundle |
| `vite.renderer.config.ts` | React renderer bundle |
| `tsconfig.json` | strict TypeScript と main / preload / renderer 共通設定 |
| `index.html` | local renderer entry と Content Security Policy |
| `src/shared/contracts.ts` | domain types、IPC API、channel allow-list |

### Acceptance criteria

- `pnpm typecheck` が成功する。
- main、preload、renderer の entry が Forge から解決できる。
- renderer HTML が remote script を許可しない。
- IPC 契約に汎用 command / filesystem API がない。
- `RiskLevel`、`ReviewStatus`、project / snapshot / group / finding の型が UI と main で共有される。

## 3. Phase 1 — Local state と project registry

### 対象 files

| File | 実装内容 |
| --- | --- |
| `src/main/store.ts` | generic `AtomicJsonStore`、temporary write、replace、serialized write queue |
| `src/main/review-service.ts` | `AppState`、default state、project registry、snapshot / approval mutation |
| `src/main/ipc.ts` | native directory picker を起点とする add / remove handler |
| `src/main.ts` | user data path と `diffender-state.json`、service composition |

### Acceptance criteria

- 初回起動時に空 state から開始できる。
- project を追加し restart 後に復元できる。
- 同じ canonical path を二重登録しない。
- remove は registry だけを変更し repository を削除しない。
- write failure で最後の正常 JSON を破壊しない。
- credential、API key、environment 全体を state に保存しない。

### Tests

- round-trip serialization
- atomic replace failure
- corrupt JSON
- unsupported schema version
- concurrent mutation の直列化
- duplicate path と Unicode path

## 4. Phase 2 — Git inspection

### 対象 files

| File | 実装内容 |
| --- | --- |
| `src/main/git.ts` | repository probe、branch / HEAD / status、tracked / untracked diff、process limit |
| `src/main/diff.ts` | patch parser、untracked patch、diff hash、group fingerprint |
| `src/main/review-service.ts` | project refresh と current diff / snapshot の orchestration |
| `tests/diff.test.ts` | parser、hash、fingerprint の unit test |

### Acceptance criteria

- 通常 repository と linked worktree を個別に登録できる。
- clean / staged / unstaged / untracked を区別せず「現在の変更」として取得できる。
- detached HEAD と unborn HEAD で crash しない。
- binary file は本文を text として扱わない。
- path を command string に連結しない。
- Git refresh は Codex process を起動しない。
- diff が既存 snapshot と違えば project が `stale` になる。

### Tests

- temporary Git repository を使う integration test
- rename、delete、binary、space / Unicode path
- Git not found、not a repository、timeout、non-zero exit
- large output guard

## 5. Phase 3 — Codex status と review adapter

### 対象 files

| File | 実装内容 |
| --- | --- |
| `src/main/codex.ts` | status probe、environment sanitization、`codex exec`、lifecycle、runtime parse |
| `src/main/schema.ts` | packaged schema を user data 配下へ materialize |
| `resources/review-output.schema.json` | Codex structured output の JSON Schema |
| `src/main/review-service.ts` | auth policy、prompt、Codex result から snapshot への変換 |
| `src/main/codex-app-server.ts` | thread 一覧／作成／resume、実装 turn 送信、完了通知 |
| `src/main/claude.ts` | Claude Code CLI検出、直近session継続、実装進捗 |
| `src/main/implementation-agent.ts` | project markerとCLI状態による実装先判定 |
| `tests/codex.test.ts` | structured result の accept / reject test |

### Acceptance criteria

- Codex 未導入、未ログイン、ChatGPT login、API key auth を区別する。
- API key auth の場合、child review を起動しない。
- ChatGPT credential をアプリ state や log に保存しない。
- Codex child は `shell: false` かつ read-only / ephemeral である。
- invalid JSON、schema mismatch、diff 外 path を snapshot として保存しない。
- cancel / timeout 後に partial result を採用しない。

### Tests

- fake executable / process adapter による status fixture
- API key env stripping
- ChatGPT / API key / unknown auth output fixture
- success、non-zero exit、timeout、abort、oversize output
- malformed / semantically invalid structured output

実 Codex を使う smoke test は opt-in とし、通常の unit test で利用枠を消費しません。

## 6. Phase 4 — Review orchestration、cache、approval

### 対象 files

| File | 実装内容 |
| --- | --- |
| `src/main/review-service.ts` | run coordinator、progress、cache、race check、approval |
| `src/main/diff.ts` | deterministic diff hash と group fingerprint |
| `src/main/store.ts` | snapshot / approval の serialized persistence |
| `src/main/ipc.ts` | run / current / cancel / approve handler と入力型検査 |
| `src/shared/contracts.ts` | `ReviewProgressEvent` と review API |

### Acceptance criteria

- 同じ diff の review は cache から返り Codex を再起動しない。
- diff / schema contract の変更は cache miss になる。
- 同一 project に並行 review が二重起動しない。
- 実行中に diff が変われば result は current 扱いにならない。
- approval は restart 後も同じ fingerprint にだけ残る。
- renderer が偽の ID / snapshot を送っても別 group を承認できない。
- state 保存成功後にだけ `complete` を通知する。

### Tests

- hash の安定性と一文字変更
- cache hit / miss
- duplicate run
- completion / cancel race
- changed-during-review race
- approval round-trip、fingerprint mismatch、cross-project ID

## 7. Phase 5 — Electron boundary

### 対象 files

| File | 実装内容 |
| --- | --- |
| `src/main.ts` | BrowserWindow、lifecycle、security policy、IPC handler registration |
| `src/preload.ts` | `DiffenderApi` の typed wrapper と progress listener cleanup |
| `src/renderer/global.d.ts` | `window.diffender` の型 |
| `src/shared/contracts.ts` | channel / payload / response contract |

### Acceptance criteria

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- preload が `DiffenderApi` 以外の Electron / Node primitive を公開しない。
- request payload と ID relationship を main が検証する。
- navigation、new window、permission request が既定拒否される。
- progress listener を解除できる。
- renderer が main の stack、environment、credential を受け取らない。

### Tests / inspection

- channel ごとの success / invalid payload / missing entity
- BrowserWindow option の review
- packaged fuses の確認
- CSP と remote navigation smoke test

## 8. Phase 6 — Renderer UX

### 対象 files

| File | 実装内容 |
| --- | --- |
| `src/renderer/App.tsx` | project inbox、Codex status、review workflow、error / loading / empty states |
| `src/renderer/components/PatchView.tsx` | line-aware text patch と binary fallback |
| `src/renderer/index.tsx` | React root |
| `src/renderer/styles.css` | desktop layout、risk hierarchy、responsive / accessible states |

### Acceptance criteria

- 初回 empty state から project picker を起動できる。
- project list に branch、変更、review status、worktree を表示する。
- toolbar refresh が Git だけを更新する。
- AI review を明示的 button で開始し、progress と cancel を表示する。
- summary、group intent / category / risk、finding、file diff を表示する。
- approve / unapprove の保存中状態と失敗を表示する。
- stale snapshot に再review案内を表示する。
- binary / empty patch が UI を壊さない。
- keyboard で主要操作と diff region に到達できる。

### Tests

- initial load、empty、no changes、review absent
- Codex unavailable / API key policy message
- progress stage と cancel
- cached / fresh source label
- critical / high risk、no findings、no matching file
- approval pending / failure / stale
- listener cleanup と stale async response の抑止

## 9. Phase 7 — Verification と Windows release

### Files / artifacts

- `tests/diff.test.ts`: diff / hash / fingerprint unit test
- `tests/codex.test.ts`: Codex structured output unit test
- `tests/store.test.ts`: atomic state / concurrent update unit test
- `vitest.config.ts`: test environment と coverage 対象
- `forge.config.ts`: Windows MakerZIP、ASAR、fuses
- `README.md` / `docs/**`: user、development、security、release guidance

### Release gate

```powershell
pnpm typecheck
pnpm test
pnpm package
pnpm make
```

追加 acceptance criteria:

- clean Windows profile で ZIP 展開、start、project add、review、restart、directory 削除。
- Git / Codex がない環境で actionable error。
- API key auth で review が実行されないことを process level で確認。
- package 後も sandbox、CSP、fuses が意図どおり。
- artifact に credential、local state、開発用 repository path が含まれない。
- release notes に known limitations と data handling を記載。

## 10. Cross-phase definition of done

各 phase は次を満たして完了とします。

1. shared contract と runtime behavior が一致する。
2. success path だけでなく invalid input と failure path に test がある。
3. renderer へ新しい OS 権限を漏らしていない。
4. state / cache / approval compatibility を検討している。
5. user-facing error が次の行動を説明する。
6. relevant docs が実装と同じ pull request で更新される。
7. typecheck と relevant test が成功する。

## 11. Post-MVP milestones

### M1 — Recovery and release hardening

- state backup / recovery UI
- signed Windows artifact、CI release、checksum / provenance
- dependency / Electron update workflow
- crash-safe process cleanup と diagnostic export
- large diff guard の telemetry なしローカル計測

Exit criteria: public beta を署名済み artifact で配布し、state 破損から user operation で復旧できる。

### M2 — Worktree intelligence

- `git worktree list --porcelain`
- repository family grouping
- sibling worktree preview / opt-in bulk add
- prunable worktree の表示

Exit criteria: disk を再帰走査せず、ユーザー確認付きで同一 repository の worktrees を整理できる。

### M3 — Review history and depth

- SQLite 移行の実測評価
- review history、retention、snapshot comparison
- selected scope / review profile
- finding filter と resolution note
- fingerprint 完全一致 group の限定的 approval carry-forward

Exit criteria: 1 万件規模の finding / snapshot でも起動・検索・保存の目標時間を満たし、JSON import / rollback が検証済み。

### M4 — Platform and workflow

- macOS notarization / Linux packaging の評価
- editor deep link
- Markdown review export
- optional Git-status watcher
- enterprise deployment policy

Exit criteria: platform ごとの Git / Codex discovery、signing、sandbox behavior を CI と manual matrix で確認できる。

## 12. 明示的な変更管理

次は product security boundary を変えるため、通常の小機能として実装しません。

- source file の編集
- Git staging / commit / push
- network integration / cloud sync
- API key billing
- automatic repository discovery
- approval の team sharing

導入には個別 ADR、更新した threat model、permission UX、failure recovery、audit / retention policy、migration plan が必要です。
