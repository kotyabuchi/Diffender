# レビューパイプライン

## 1. 目的

レビューパイプラインは、現在の Git 差分を再現可能な入力に変換し、Codex の structured output を検証し、差分に結び付いた snapshot と approval を作ります。Git refresh は無料の事実取得、Codex review は明示的に開始する AI 操作として分離します。

## 2. 全体フロー

```text
User: Run review
  ↓
Project / auth / active run preflight
  ↓
Git status + diff collection
  ↓
Canonical diff → diffHash
  ├─ matching valid snapshot → cache result
  └─ cache miss
       ↓
     prompt + JSON Schema
       ↓
     codex exec (ephemeral, read-only, shell:false)
       ↓
     CLI schema enforcement → JSON/runtime validation
       ↓
     map groups/findings
       ↓
     group fingerprints
       ↓
     current diff re-check
       ├─ changed → stale
       └─ unchanged → atomic state save → complete
```

## 3. Stage 0: preflight

main process は次を確認します。

- `projectId` が登録済みである
- canonical root が現在も Git repository / worktree である
- 同じ project に active run がない
- Codex CLI が見つかる
- Codex が認証済みである
- auth method が ChatGPT login である
- API key env を除いた child environment を構築できる

失敗した場合は Codex を起動せず、project と既存 snapshot を保持したまま actionable error を返します。

## 4. Stage 1: Git collection

Git command は登録 root を `cwd` として `shell: false` で実行します。収集対象:

- branch または detached HEAD
- HEAD SHA
- staged / unstaged / untracked status
- file status
- additions / deletions
- text patch
- binary marker

MVP が使用する主な command:

```text
git rev-parse --show-toplevel
git rev-parse --is-inside-work-tree
git symbolic-ref --quiet --short HEAD
git rev-parse --verify HEAD
git status --porcelain=v1 -z
git rev-parse --git-dir
git rev-parse --git-common-dir
git diff --no-ext-diff --no-color --find-renames HEAD --
git ls-files --others --exclude-standard -z
```

HEAD がまだない repository では、`git diff --cached … --` と unstaged の `git diff … --` を別々に取得して統合します。Git command は 15 秒 timeout、stdout / stderr は最大 16 MiB です。untracked text は 1 file 512 KiB、合計 2 MiB まで読み、symlink、NUL を含む file、上限超過 file を省略します。

`git rev-parse --git-dir` と `--git-common-dir` の実体が異なる場合を linked worktree と判定します。sibling worktree の列挙は行いません。

実装は working tree と index の両方を review 対象に含め、同じ file の情報を deterministic に統合します。untracked file は Git diff に自動で出ないため、内容取得に size / binary guard が必要です。

edge case:

- initial repository（HEAD がない）
- detached HEAD
- rename / copy
- deleted file
- binary
- submodule
- path に space / Unicode / newline
- very large file / diff

MVP が完全に表現できない対象は、黙って clean とせず「省略／レビュー不可」を示します。

## 5. Stage 2: canonicalization と `diffHash`

同じ意味の差分が同じ hash になるよう、次を canonicalize します。

- file を normalized relative path の順に並べる
- status、binary flag、patch の line ending を正規化する
- UI だけの値や timestamp を除く
- repository 外の absolute path を含めない
- 現在の hash 入力は file の path、status、binary flag、追加／削除数、正規化 patch

概念上の入力:

```json
{
  "files": [
    {
      "path": "src/example.ts",
      "status": "modified",
      "binary": false,
      "patch": "…"
    }
  ]
}
```

この canonical JSON を SHA-256 hash にします。`ReviewSnapshot.diffHash` は cache identity と stale 判定に使用します。MVP の hash には HEAD、prompt、model、JSON Schema version は含まれません。同じ patch の誤再利用を避ける contract version は post-MVP 課題です。

## 6. Stage 3: cache lookup

cache hit 条件:

- 同じ `projectId`
- 同じ `diffHash`
- 保存 snapshot が現在の domain validation を通る

hit の場合は Codex を起動せず、`source: "cache"` として返します。approval は group fingerprint が一致するものだけを復元します。

cache miss の主な理由:

- file 内容または status が変化し `diffHash` が変わった
- state の読み込みに失敗
- user が将来提供される force rerun を明示した

MVP は prompt / schema / fingerprint algorithm の version 変更を自動 cache miss にできません。変更する release では既存 cache の扱いを明示し、将来は contract version を key に追加します。

## 7. Stage 4: prompt と JSON Schema

Codex へ渡す instruction は、差分レビューという役割、read-only 制約、output contract を明示します。

最低限の要求:

- 変更を intent 単位の semantic group に分ける
- 各 group に title、intent、category、risk、file paths を付ける
- finding に severity、file、任意 line、title、reason、suggestion を付ける
- 差分にない file や架空の line を作らない
- JSON 以外の説明を output に混ぜない

現在の prompt は「review のみ」「file 変更や command 実行をしない」「意図で group 化する」「correctness / security / reliability / maintainability risk を探す」「repository-relative path と schema に合う JSON だけを返す」と指示します。source 内の prompt injection を明示的に無視する追加 instruction は hardening 候補です。主要な書き込み防止境界は Codex の read-only sandbox です。

`summary`、group の `title` / `intent` / `category`、finding の `title` / `reason` / `suggestion` は自然な日本語を必須とします。schema の property 名、ID、risk enum は英語の固定値を維持します。prompt contract の世代を cache key に含めるため、旧英語レビューは日本語化後の cache として再利用しません。

MVP の JSON Schema は required field、型、risk enum、positive line、`additionalProperties: false` を定義します。文字列長や配列数の schema 上限はまだありません。process 全体の出力は 8 MiB に制限します。

## 8. Stage 5: Codex invocation

main process が次を child process として起動します。

```text
codex exec --ephemeral --ignore-user-config --sandbox read-only --output-schema <userData schema path> -
```

必須 property:

- `cwd`: project root
- `shell: false`
- session: ephemeral
- user config: ignored（保存済み auth は Codex CLI が引き続き利用）
- sandbox: read-only
- output: JSON Schema に従う structured result
- environment: API key 系 variable を除去
- prompt は stdin、structured result は stdout、schema は materialized file で受け渡す
- abort signal、timeout、stdout / stderr limit

schema は bundle 内の `resources/review-output.schema.json` を、起動時に `<userData>/schemas/review-output.schema.json` へ materialize したものです。review timeout は 10 分、stdout + stderr の合計上限は 8 MiB です。

Diffender は Codex credential を引数、prompt、state に含めません。Codex CLI 自身の保存済み ChatGPT login に認証を委ねます。

`--ignore-user-config` は global MCP server や hook などを review process へ持ち込まず、対象 repository に `.serena` などの tool metadata が生成されて差分 hash が変化することを防ぎます。review 開始後に実際の tracked / untracked content が変更された場合は、従来どおり結果を stale として破棄します。

Codex CLI の option は version により変わり得るため、実装で固定した CLI version / capability の smoke test を行い、ドキュメントより `--help` と adapter test を優先します。

## 9. Stage 6: validation と mapping

Codex output は次の順で処理します。

1. process exit を確認
2. output size を確認
3. JSON parse
4. Codex CLI が `--output-schema` で制約した結果を受け取る
5. application の runtime shape / enum validation
6. domain object へ mapping

MVP の runtime validation:

- risk / severity が許可 enum である
- line が positive integer または null
- required field が期待する primitive / array 型である

MVP では file path が対象 diff 内に存在するか、ID が重複していないか、group と finding の path が整合するかを main process で追加検証していません。renderer は一致しない group file の patch を表示しませんが、これは security validation の代替ではありません。path membership、文字列長、配列数、ID uniqueness の検証は post-MVP hardening です。

raw JSON を renderer に直接渡しません。

## 10. Stage 7: group fingerprint

group fingerprint は、承認した意味単位が変わっていないことを確認するための hash です。少なくとも次に依存します。

- snapshot の `diffHash`
- group の title、intent、category
- risk
- sorted file paths
- finding の全 field（finding ID を含む）を file / line / title で sort した配列

full `diffHash` が全対象 patch を間接的に fingerprint へ結び付けます。group ID、`approved`、UI 展開状態、timestamp は fingerprint に含めません。

全 snapshot の `diffHash` が変われば stale です。将来、group matching を高度化して変更のない group だけ承認を引き継ぐ場合でも、fingerprint が完全一致する group に限定します。MVP は安全側に倒し、曖昧な一致では承認を外します。

## 11. Stage 8: race check と保存

Codex 実行中に editor / agent が file を変える可能性があります。結果受領後に current diff を再収集し、開始時の `diffHash` と比較します。

- 一致: snapshot を current として atomic save
- 不一致: result を保存せず run を `failed` にする。次の Git refresh では対応 cache がなければ `stale`

保存成功後に renderer へ `complete` を通知します。保存失敗時に memory 上だけ complete と表示しません。

## 12. Approval flow

renderer は `projectId`、`reviewId`、`groupId`、希望する boolean を送ります。main は:

1. project、snapshot、group の親子関係を確認
2. current diff hash を確認
3. 保存 group の fingerprint を確認
4. approval を更新
5. atomic save
6. 更新済み snapshot を返す

renderer が送った review object や fingerprint をそのまま保存しません。

## 13. Progress と cancellation

progress stage:

- `queued`: request を受け付けた
- `reading`: Git diff を収集中
- `analyzing`: Codex が review 中
- `complete`: 検証・保存済み
- `failed`: 中断または失敗

cancel は run identity と child process を対応付けます。終了後の partial output は snapshot として保存しません。cancel と process complete が競合した場合、最初に確定した terminal state だけを採用します。

## 14. Failure handling

| Failure | Classification | Retry |
| --- | --- | --- |
| no changes | normal empty state | refresh after change |
| Git not found / invalid repo | configuration | setup / re-add |
| Codex not found | configuration | install, then status retry |
| not authenticated | authentication | ChatGPT login |
| API key auth | policy block | switch to ChatGPT login |
| usage limit / service unavailable | external | wait, then retry |
| timeout / cancel | transient / user | retry |
| invalid structured output | contract | retry; inspect adapter/version |
| diff changed during run | stale race | refresh and rerun |
| state write failure | local storage | fix disk/permission, retry |

retry は既存の正常 snapshot を先に削除しません。

## 15. Privacy とコスト

Codex review を押すと、対象差分が Codex CLI の処理に渡されます。送信と data handling は利用中の Codex / ChatGPT 契約と設定に従います。Diffender は Git refresh だけでは Codex を起動しません。

UI は実行前に、AI review であること、ChatGPT 利用上限を消費し得ること、API key 認証は受け付けないことを明確にします。

## 14. Review後の実装引き渡し

review pipeline の出力は承認と reviewer note を加えた修正指示へ変換できます。コピー時と直接送信時には current diff hash と review ID を再照合し、古い判断を別の差分へ適用しません。raw patch は修正指示へ複製せず、Codex が登録 project の現在状態を再確認します。

直接送信はreviewとは別操作です。Codexは`codex app-server`の既存または新規threadを`workspaceWrite`で開始し、Claude Codeはprojectの直近sessionを`--continue --print`で継続します。どちらもsourceを変更し得るため、明示確認を必要とします。Codexの詳細は[codex-handoff.md](codex-handoff.md)、判定とClaude Codeの詳細は[implementation-agents.md](implementation-agents.md)を参照してください。
