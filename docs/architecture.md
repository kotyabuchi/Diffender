# アーキテクチャ

## 1. 概要

Diffender は Electron 43、Electron Forge 7 / Vite、React 19、TypeScript で構成します。OS、Git、Codex CLI、永続データへのアクセスは Electron main process に集約し、renderer は sandbox 内で UI だけを担当します。

```text
┌──────────────── Renderer (React) ────────────────┐
│ Inbox / Diff / Review groups / Approval controls │
│ Node.js access なし                               │
└───────────────────┬──────────────────────────────┘
                    │ typed, allow-listed IPC
┌───────────────────▼──────────────────────────────┐
│ Preload: DiffenderApi のみを contextBridge 公開 │
└───────────────────┬──────────────────────────────┘
                    │ ipcRenderer.invoke / events
┌───────────────────▼ Main process ────────────────┐
│ IPC validation / orchestration / atomic JSON      │
│ Git / Codex / Claude / agent判定 / cache / fingerprint│
└─────────────┬──────────────────────┬──────────────┘
              │ shell:false          │ local files
       ┌──────▼──────┐       ┌──────▼────────────┐
       │ Git / Codex │       │ Electron userData │
       └─────────────┘       └───────────────────┘
```

## 2. Process boundary

### Main process

信頼境界の内側にあり、次を所有します。

- BrowserWindow と lifecycle
- directory picker
- project path の正規化と Git 検証
- Git command の起動と出力解析
- diff の正規化、hash、fingerprint
- Codex CLI の状態確認と review 実行
- Codex App Server の lifecycle、thread 一覧／作成／resume、turn 送信
- Claude Code CLIの状態確認、直近session継続、process lifecycle
- project markerとCLI状態による実装エージェント判定
- JSON Schema の提供と出力検証
- project / snapshot / approval の永続化
- review の重複抑止、cancel、progress event
- IPC request の型・参照整合性検証

### Preload

renderer と main の間の薄い adapter です。`contextBridge` で `DiffenderApi` だけを公開し、汎用 `send(channel, args)`、filesystem、process、shell は公開しません。

公開 API:

- `projects.list/add/remove/refresh`
- `reviews.current/run/cancel/approve/onProgress`
- `codex.status/tasks/createTask/linkTask/unlinkTask`
- `codex.copyFeedback/sendFeedback/openTask/onTaskProgress`
- `implementations.detect/select/sendFeedback/onProgress`

### Renderer

信頼できない可能性のある文字列を表示する UI process です。

- React state と view routing
- project selection
- diff / review rendering
- user intent を preload API へ渡す
- progress / error / empty state 表示

renderer が持つ `ProjectRecord` や `ReviewSnapshot` は view model であり、authorization source ではありません。削除、review、approval の対象は main process が保存状態と照合します。

## 3. IPC 設計

request / response channel は `src/shared/contracts.ts` の `IPC_CHANNELS` と `DiffenderApi` を共有契約とします。

原則:

1. channel 名を allow-list する。
2. payload は primitive ID と必要最小限の値にする。
3. path を renderer から自由入力させず、追加は native picker を起点にする。
4. `projectId`、`reviewId`、`groupId` の存在と親子関係を main で検証する。
5. error はユーザー向け message に正規化し、secret や巨大な command output を返さない。
6. progress listener の解除関数を返し、画面破棄後の listener leak を防ぐ。

`reviewsProgress` は main から renderer への一方向 event です。stage は `queued / reading / analyzing / complete / failed` に限定します。

`codexTaskProgress` も一方向 event とし、Diffender が開始した turn だけを `started / completed / failed` として通知します。

`implementationsProgress`はCodexとClaude Codeの進捗を共通化し、rendererの固定アクションパネルへ通知します。

## 4. Domain model とデータ所有権

```text
ProjectRecord 1 ── 0..n ReviewSnapshot
ReviewSnapshot 1 ── 1..n DiffFile
ReviewSnapshot 1 ── 0..n ReviewGroup
ReviewGroup 1 ── 0..n ReviewFinding
```

- `ProjectRecord.rootPath` はローカル作業場所の identity です。
- `ProjectRecord.codexThreadId` は任意の Codex thread へのローカルな紐付けです。session 本文は保存しません。
- `ProjectRecord.implementationAgent` は自動判定を上書きする任意の手動指定です。
- `ReviewSnapshot.diffHash` は snapshot が対象とした差分の identity です。
- `ReviewGroup.fingerprint` は承認対象 group の identity です。
- `approved` は fingerprint と同じ snapshot 文脈でのみ意味を持ちます。

main process が canonical state を持ち、renderer はコピーを受け取ります。

## 5. 永続化

MVP は Electron `app.getPath("userData")` 配下の JSON state を使用します。保存は同じ directory の temporary file に完全な JSON を書き、flush / close 後に置換する atomic write を基本とします。

実装 path は `join(app.getPath("userData"), "diffender-state.json")` です。

```text
AppState version 1
├─ projects: ProjectRecord[]
├─ snapshots: projectId → diffHash → ReviewSnapshot
└─ approvals: groupFingerprint → boolean
```

設計上の制約:

- schema version を state に持たせ、将来の migration を可能にする。
- credential、Codex raw session、repository file 本文は保存しない。
- snapshot に必要な diff と structured review はローカルに保存される。
- 複数 process から同時に JSON を書かない。書き込みは main process の単一 queue に集約する。
- file lock と multi-instance merge は MVP 外。single-instance 運用を前提とする。

project を受信箱から削除すると project record とその snapshots は削除され、repository 本体には触れません。MVP は global fingerprint approval entry の pruning を行わないため、対応する boolean entry が state に残る場合があります。retention / cleanup は post-MVP 課題です。

SQLite は検索可能な長期履歴、部分 update、大規模 state、migration transaction が必要になった段階の候補であり、MVP の実装ではありません。

## 6. Git adapter

各 project の `rootPath` を `cwd` として Git を起動します。command は executable と argument array に分け、`shell: false` を使用します。

責務:

- repository / worktree と top-level path の確認
- branch と HEAD SHA の取得
- index と working tree の変更検出
- status と patch の収集
- binary file や rename の安全な表現
- command failure、timeout、出力上限の正規化

project entry は repository family ではなく具体的な作業 directory を表します。通常 repository と linked worktree は同じように review できますが、別 worktree はユーザーが個別に追加します。

## 7. Review と cache

pipeline の詳細は [review-pipeline.md](review-pipeline.md) を参照してください。

要点:

1. Git から canonical diff を収集する。
2. canonical diff から `diffHash` を計算する。
3. 同じ project で同じ hash の snapshot があれば cache hit とする。
4. なければ Codex を read-only / ephemeral / schema 指定で起動する。
5. 結果を検証・正規化し、group fingerprint を計算する。
6. 実行終了時に Git diff を再確認し、変化していれば結果を保存せず run を failed にする。次の refresh では対応 cache がなければ stale になる。
7. atomic JSON に保存し renderer へ返す。

MVP の cache key は project 内の `diffHash` です。model、prompt、JSON Schema の version はまだ含まれません。レビュー契約変更後に古い結果を誤って再利用しないよう、contract version を cache key に追加することは post-MVP の hardening 項目です。

## 8. Concurrency と cancellation

- project ごとに active review は最大 1 件とする。
- refresh は AI review を開始しない。
- cancel は対応する child process だけを終了する。
- renderer が閉じても main が lifecycle を管理する。
- review 完了時は開始時の diff hash と現在の diff hash を比較する。
- late response は `projectId` と run identity で識別し、別 run の UI を上書きしない。

## 8.1 Codex App Server adapter

`src/main/codex-app-server.ts` はインストール済み Codex CLI を `app-server --stdio` で遅延起動し、JSONL request / response を Electron main process 内で管理します。

- `thread/list`: project root と一致する既存タスク、または明示操作時の最近のタスク
- `thread/start`: project root を `cwd` とする永続タスク
- `thread/read`: ID 直接入力時の存在確認
- `thread/resume`: 既存タスクを project root の実装設定で再開
- `turn/start`: review feedback を送信
- `turn/completed`: renderer への完了通知

実装 turn は `workspaceWrite`、writable root は登録 project のみ、network access は無効です。Review 用の `codex exec --ignore-user-config --ephemeral --sandbox read-only` とは process と権限を分離します。

## 8.2 Claude Code adapter

`src/main/claude.ts`はClaude Code CLIを遅延起動し、登録projectを`cwd`として`--continue --print`で直近sessionへfeedbackを送ります。`acceptEdits`を使いますが、危険なpermission bypassは使いません。`src/main/implementation-agent.ts`は固定project markerだけを読み、再帰探索やClaude session JSONの直接解析を行いません。

## 9. Failure boundary

| Boundary | 主な失敗 | 方針 |
| --- | --- | --- |
| Renderer → IPC | 不正 ID、型不一致 | main で拒否 |
| Main → state | write / parse failure | 既存 file を保全、error を通知 |
| Main → Git | 非 repository、timeout、巨大出力 | project 単位の失敗 |
| Main → Codex | 未導入、auth、limit、timeout | review のみ失敗、diff は維持 |
| Codex → parser | invalid / extra JSON | schema 不一致として拒否 |
| Review → current diff | 実行中の変更 | stale、承認不可 |

## 10. ADR-001: Tauri ではなく Electron を採用

### Status

Accepted for MVP.

### Context

アプリは React / TypeScript UI、Node.js での Git / Codex child process 管理、filesystem、streaming progress、Windows packaging を必要とします。短期間で一貫した process boundary と開発環境を構築することが優先です。

### Decision

Electron + Electron Forge + Vite を採用します。

### Rationale

- main、preload、renderer を TypeScript で統一できる。
- Node.js の成熟した `child_process`、filesystem、crypto API を直接利用できる。
- Codex の process / stdin / stdout / cancellation を追加 bridge なしで管理できる。
- Forge が Vite development と Windows ZIP packaging を一つの workflow にまとめる。
- team が web stack だけで MVP を検証しやすい。

### Consequences

- runtime と配布物のサイズ、idle memory は Tauri より大きくなりやすい。
- Chromium / Node の security update を継続して取り込む必要がある。
- preload / IPC の設計を誤ると権限境界が広がる。
- fuses、sandbox、context isolation、navigation 制限を release ごとに検証する必要がある。

### Alternatives

Tauri は小さい bundle と Rust 側の強い権限境界が魅力です。一方、MVP では Rust command layer、sidecar / process policy、frontend との serialization、platform packaging の追加複雑性が delivery risk になります。性能・配布サイズ・attack surface が主要な製品制約になった場合は、実測値を用いて再評価します。

### Revisit criteria

- packaged size または memory が配布要件を満たさない
- enterprise security policy が Electron を許容しない
- Rust backend へ移す価値が migration cost を上回る
- multi-platform distribution が Electron 固有の阻害要因になる
