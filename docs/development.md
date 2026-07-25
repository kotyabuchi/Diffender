# 開発ガイド

## 1. 前提

- Windows
- Node.js
- `pnpm`
- Git
- Codex CLI（end-to-end review を確認する場合）

Codex CLI は ChatGPT login を使用してください。API key は MVP で意図的に拒否されます。unit test のために実際の Codex 利用枠を消費しないよう、process adapter は fake / fixture と差し替え可能な境界に保ちます。

## 2. Setup

```powershell
pnpm install
pnpm start
```

Forge + Vite が main、preload、renderer を個別に build し、開発用 Electron を起動します。

## 3. Commands

| Command | 用途 |
| --- | --- |
| `pnpm start` | development build と Electron 起動 |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest を一度実行 |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm package` | unpacked application 作成 |
| `pnpm make` | MakerZIP による Windows ZIP artifact 作成 |

変更を提出する前の最小確認:

```powershell
pnpm typecheck
pnpm test
pnpm package
```

## 4. Source layout

実装の責務は次の境界を維持します。

```text
src/
  main.ts                 Electron lifecycle / composition root
  preload.ts              contextBridge の narrow API
  main/
    codex.ts              Codex status / child process / output parsing
    diff.ts               patch parser / diff hash / group fingerprint
    git.ts                repository validation / status / diff collection
    ipc.ts                allow-listed IPC handlers
    review-service.ts     project / review / cache / approval orchestration
    schema.ts             review JSON Schema の materialization
    store.ts              atomic JSON store
  shared/
    contracts.ts          IPC と domain の共有型
  renderer/               React UI
resources/
  review-output.schema.json
tests/
  codex.test.ts
  diff.test.ts
  store.test.ts
docs/                     製品・設計ドキュメント
```

実際の module 名が変わっても、OS access を main に閉じ込める責務は変えません。

## 5. 実装ルール

### Main / preload / renderer

- renderer から `fs`、`child_process`、Electron module を import しない。
- preload は domain operation だけを公開し、汎用 IPC API を渡さない。
- IPC channel と payload 型は `src/shared/contracts.ts` を唯一の共有契約にする。
- main は renderer の ID、boolean、path、snapshot 情報を再検証する。
- user-facing error と diagnostic detail を分ける。

### Child process

- `shell: false` を必須とする。
- executable と argument array を分ける。
- Windows の npm shim は直接起動せず、検出した `@openai/codex/bin/codex.js` を外部の `node.exe` で実行する。
- 標準外の Codex 配置を検証するときは `DIFFENDER_CODEX_PATH` で native executable または `codex.js` を指定できる。
- review process は `--ignore-user-config` を指定し、保存済み認証だけを利用して user-configured MCP / hook の副作用を持ち込まない。
- repository path は `cwd` として扱い、command string に連結しない。
- timeout、abort、stdout / stderr size limit を設定する。
- child の終了 code、signal、spawn error を別々に扱う。
- API key 系 env を Codex child に渡さない。

### State

- state mutation は main process に限定する。
- memory state を更新したあと、temporary file → replace の順で保存する。
- state schema に version を持たせる。
- parse できない state を無言で上書きしない。
- credential や不要な raw output を保存しない。

### Review

- Git refresh と Codex run を同じ操作にしない。
- hash 前に diff 表現を deterministic にする。
- prompt / schema の変更時は cache contract version を更新する。
- Codex output は JSON parse だけでなく shape と値域も検証する。
- approval は main が再計算／照合できる fingerprint に束縛する。

## 6. Test strategy

現在の自動 suite は 7 files / 22 tests です。diff parsing / hash / fingerprint、reviewer note が承認 fingerprint に影響しないこと、review contract version、Codex payload の基本 runtime validation、Windows の Codex / Claude Code 起動解決、API key環境変数の分離、atomic store、修正指示の構成、実装エージェント判定、App Server turn のsandbox parameterを検証します。以下は追加hardeningを含む目標test matrixであり、すべてが実装済みという意味ではありません。

### Unit test

- Git status / diff parser
- binary、rename、empty diff、detached HEAD
- canonical diff hash の安定性
- group fingerprint の安定性と変更検出
- approval invalidation
- state serialization、atomic write、migration、破損 JSON
- Codex output schema validation
- auth method 判定と API key block
- command error / timeout / cancel の mapping
- IPC input validation
- feedback に承認状態と reviewer note が含まれること
- App Server thread metadata mapping と workspaceWrite scope
- Claude Codeの継続実行引数、権限モード、API key環境変数除去
- Codex thread、CLAUDE.md / AGENTS.md、手動指定の判定優先順位

### Integration test

temporary directory に小さい Git repository を作り、次を確認します。

- clean / staged / unstaged / untracked の取得
- repository と linked worktree の識別
- space や Unicode を含む path
- review cache hit / miss
- review 中に diff が変わる race

実 Codex を使う test は通常 suite から分離し、明示的な opt-in にします。既定の CI / local test で ChatGPT 利用枠を消費してはいけません。

`thread/list` の read-only smoke test は利用枠を消費しません。一方、`turn/start` は利用枠を消費し project を変更し得るため、自動 test では実行せず、専用の throwaway repository で明示的に確認します。

### Renderer test

- empty / loading / error state
- project selection
- risk と finding の表示
- run / cancel / retry の disabled state
- approval toggle と stale 表示
- progress listener cleanup

## 7. Manual QA checklist

### Project

- 通常 repository を追加できる
- linked worktree を個別追加できる
- Git でない directory を拒否する
- 同じ path を重複登録しない
- 登録解除しても disk 上の repository は残る

### Diff

- staged、unstaged、untracked の変更が見える
- rename、delete、binary が UI を壊さない
- 大きい patch が UI を固めない
- refresh だけでは Codex が起動しない

### Codex

- 未インストール、未ログイン、ChatGPT login を区別する
- API key auth を警告して実行しない
- progress、cancel、retry が機能する
- malformed output を表示結果として採用しない
- cache hit が新しい Codex process を作らない

### Approval

- group 単位で approve / unapprove できる
- app restart 後も同じ fingerprint の approval が残る
- file 内容変更後は古い approval が残らない
- review 実行中の変更で結果が current 扱いにならない

## 8. Debugging

- renderer の問題は DevTools、main / preload は起動 terminal の log を確認する。
- log に repository の必要最小限の path は含み得ますが、source 全文、Codex credential、環境変数全体を出力しません。
- Git / Codex failure は executable、exit category、上限付き stderr を確認します。MVP は credential redaction を実装していないため、共有前に内容を確認してください。
- state 問題の調査前に user data の state file をバックアップし、手編集を通常の復旧手段にしません。

## 9. IPC を追加するとき

1. shared contract に domain operation と型を追加する。
2. main handler で payload と state relationship を検証する。
3. preload に必要最小限の wrapper を追加する。
4. renderer は wrapper だけを呼ぶ。
5. success、不正 payload、存在しない ID、handler failure を test する。
6. [security.md](security.md) の threat model に新しい権限がないか確認する。

汎用 filesystem access、任意 command、任意 channel、任意 URL open を追加してはいけません。

## 10. Build と release

`pnpm package` はローカル確認用の unpacked app、`pnpm make` は MakerZIP による Windows ZIP artifact を生成します。MVP がサポートする配布物は ZIP のみで、installer は生成しません。

release 前:

1. lockfile を固定し clean install で再現する。
2. typecheck、test、manual smoke test を行う。
3. package 後の Electron fuses を確認する。
4. clean Windows user profile で ZIP を展開し、start、state 作成、終了、directory 削除を確認する。
5. Git / Codex がない場合の案内を確認する。
6. state upgrade と downgrade 方針を確認する。
7. license、release notes、checksum を用意する。

code signing、installer、自動 update、CI release、macOS / Linux makers は MVP では未整備です。外部配布前に署名と provenance を必須課題として扱います。

## 11. Versioning と compatibility

- app version と state schema version を分ける。
- prompt / output schema / fingerprint algorithm は review contract version で管理する。
- schema を変更した release は古い cache を無効化できるようにする。
- downgrade で新しい state を破壊しない。読めない version は明示的に停止する。
