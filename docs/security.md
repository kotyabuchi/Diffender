# セキュリティ

## 1. Security posture

Diffender はローカルの source code と Git 差分を扱い、外部の Codex CLI process を起動します。MVP の基本方針は「renderer と repository 内容を信頼せず、OS 権限を main process に閉じ込め、Codex を読み取り専用で実行する」です。

本アプリの review と approval は security audit、test、署名、Git hosting の branch protection を代替しません。

## 2. 保護対象

- ローカル repository とその未コミット変更
- repository path、branch、HEAD
- review snapshot と approval history
- Codex CLI の保存済み認証
- ユーザーの ChatGPT 利用枠
- desktop process が持つ filesystem / process 権限

## 3. Trust boundary

信頼度の低い入力:

- renderer から来る IPC payload
- repository の path、file 名、source、diff、Git metadata
- Codex CLI の stdout / stderr と structured output
- disk 上の既存 state file
- executable discovery に使う environment / PATH

main process 内の検証済み domain state だけを canonical とします。preload は権限を持つ bridge なので、surface を小さく保ちます。

## 4. Threat model

| Threat | 例 | MVP control | 残余リスク |
| --- | --- | --- | --- |
| Command injection | path / branch に shell 記号 | `shell: false`、argument array、固定 command | Git/Codex executable 自体が置換されている |
| Path confusion | 同じ repo の別 path、symlink | canonical path、Git root 検証、ID 照合 | filesystem race、junction の複雑性 |
| Renderer compromise | XSS から filesystem 操作 | sandbox、context isolation、Node integration 無効、narrow preload | preload API 内の権限は呼ばれ得る |
| Prompt injection | source 内に「file を変更せよ」 | Codex `read-only` sandbox、review-only prompt | source instruction の明示的無視は未指示。review 品質の操作、情報の誤要約 |
| Structured output attack | 巨大／不正 JSON、偽 file path | 8 MiB 上限、JSON Schema、基本 runtime validation | path membership、文字列長、ID uniqueness は未検証 |
| Secret leakage | source / diff に secret | 必要な差分だけ渡す、raw output / env を保存・log しない | review service に送られる内容は Codex のポリシーに従う |
| Unexpected billing | API key が環境にある | API key env を child から除外、auth 判定で block | auth 判定の将来互換性 |
| Stale approval | 承認後に file が変わる | diff hash / group fingerprint で invalidation | hash algorithm / canonicalization bug |
| State tampering | JSON を外部編集 | schema validation、参照整合性、atomic write | MVP は署名・暗号化をしない |
| Denial of service | 巨大 diff / hung process | output limit、timeout、cancel、非同期 process | 非常に大きい repository の負荷 |
| Navigation abuse | malicious link / remote page | local content と CSP | explicit navigation / new-window / permission deny handler は release hardening 課題 |

## 5. Electron hardening

実装済み:

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- preload の公開 API を domain operation に限定
- remote content を BrowserWindow に読み込まない

外部配布前の hardening:

- unexpected navigation と window creation を明示的に拒否
- permission request を既定拒否
- production DevTools を必要に応じて無効化

Forge の production package は ASAR と Electron fuses を使用します。

- Run as Node を無効化
- cookie encryption を有効化
- `NODE_OPTIONS` と Node CLI inspect arguments を無効化
- embedded ASAR integrity validation を有効化
- ASAR からのみ application code を load

fuses は application logic の代替ではありません。Electron update 時に値と packaged result を再検証します。

## 6. Git process

- executable と args を分離し `shell: false` で起動する。
- `cwd` は登録済み canonical root だけを使う。
- renderer から任意 Git args を受け取らない。
- `--` separator が必要な command では pathspec と option を分離する。
- timeout と stdout / stderr 上限を設ける。
- Git hook を意図せず実行する書き込み command は使わない。
- MVP は read-only Git operation に限定する。

repository 名、file path、diff content は表示前提の untrusted text とし、HTML として注入しません。

## 7. Codex process

Codex CLI は次の制約で main process から起動します。

- `codex exec`
- repository root を `cwd`
- ephemeral session
- `--ignore-user-config` による user-configured MCP / hook の分離
- read-only sandbox
- JSON Schema による structured output
- `shell: false`
- timeout / cancellation / output limit
- API key 系 environment variable を削除

review prompt は差分の分析だけを行い、file 変更や command 実行をしないよう指示します。source 内の instruction を明示的に無視する文言は MVP prompt にまだありません。prompt instruction だけを security boundary にせず、filesystem 書き込みを sandbox で禁止し、ユーザー設定の MCP / hook を読み込まないことが主要 control です。`--ignore-user-config` でも保存済み authentication は維持されます。

Codex が返した file path、line、risk、group はすべて未検証入力です。MVP は JSON Schema と runtime parser で required field、型、risk enum、positive line を検証します。file path が登録 diff に含まれること、文字列長、配列数、ID uniqueness の追加検証は未実装です。renderer は React text rendering を使い、不一致 path の patch を表示しません。

### Codex App Serverによる実装

実装への引き渡しは review process と別の長寿命 `codex app-server --stdio` child を使います。

- 送信前に ChatGPT login を再確認し、API key auth は拒否する
- child environment から `OPENAI_API_KEY` と `CODEX_API_KEY` を削除する
- current diff hash と review ID が一致しない feedback を拒否する
- `threadId` は形式と App Server の `thread/read` で検証する
- turn の `cwd` と writable root を保存済み project root に固定する
- network access を無効化する
- `approvalPolicy: never` とし、追加権限要求は許可しない
- renderer へ汎用 JSON-RPC、command、path 書き込み API を公開しない

直接送信は source code を変更し得るため、明示ボタンと確認ダイアログを必要とします。App Server の thread 一覧、紐付け、指示コピーは AI turn を開始しません。Codex App Server 自体は実験的 interface であり、protocol 変更による availability risk があります。

### Claude Codeによる実装

- project rootの`CLAUDE.md`、`CLAUDE.local.md`、`.claude`だけを判定材料として確認する
- Claude Codeのconversation fileやcredential storeを直接読まない
- `--continue --print --permission-mode acceptEdits`で直近project sessionを継続する
- `--dangerously-skip-permissions`を使用しない
- `ANTHROPIC_API_KEY`と`ANTHROPIC_AUTH_TOKEN`をchildへ継承しない
- stderrは上限を設け、rendererへ返す失敗文を500文字に制限する

marker検出は「このprojectで使われる可能性」を示すだけで、変更の作者を証明しません。誤判定時はユーザーが固定パネルで手動指定します。Claude Code側に保存された認証方式や課金経路はDiffenderから完全には判定できないため、Claude Code側の契約と設定をユーザーが確認する必要があります。

## 8. 認証と課金

### ChatGPT login

MVP が意図する方式です。Codex CLI が端末に保存した login を利用し、Diffender は token や cookie を読み取り／保存しません。利用はユーザーの ChatGPT subscription に適用される Codex 利用上限に従います。

### API key auth

OpenAI API の従量課金に接続する可能性があり、ChatGPT subscription の利用枠とは別です。意図しない請求を避けるため MVP は:

- API key 入力 UI を提供しない
- API key を state に保存しない
- `OPENAI_API_KEY` と `CODEX_API_KEY` を Codex child へ継承しない
- status が API key auth を示す場合は warning とともに review を block する
- auth method が安全に判定できない場合は fail closed を優先する

Codex CLI の auth 表示形式が変わる可能性があるため、version upgrade 時に判定 test を更新します。

## 9. Data at rest

保存対象:

- project registry と local path
- Git metadata
- diff patch
- structured review
- approval と fingerprint

保存しないもの:

- ChatGPT credential
- API key
- environment 全体
- Codex conversation session

Codex thread ID だけは project との紐付けとして保存します。conversation 本文、rollout path、token、raw App Server event は保存しません。
- 不要な raw stdout / stderr

project の削除では registry entry と project snapshots を削除します。approval map は fingerprint を global key としており、MVP は orphan entry を prune しません。repository file は削除しません。approval retention / cleanup は post-MVP 課題です。

MVP の JSON state は OS user account の filesystem 権限に依存し、アプリ独自の暗号化・署名は行いません。同じ OS account の別 process からは読まれたり改変されたりする可能性があります。機密 repository を扱う端末では full-disk encryption と OS account 保護を利用してください。

## 10. Cache と approval integrity

- diff を deterministic に canonicalize して cryptographic hash を計算する。
- cache は project identity、diff hash、および指定された model / reasoning effort が一致した場合だけ使用する。
- group fingerprint は group の意味と対象差分に関係する canonical field から計算する。
- approval 更新時に current diff、snapshot、group fingerprint を main で照合する。
- hash 不一致、group 欠落、snapshot 不一致は未承認として扱う。
- review 実行中に diff が変われば生成結果を current として承認できない。

fingerprint は改ざん防止署名ではなく、意図しない stale approval を防ぐ整合性 mechanism です。local administrator や同一 OS user の悪意ある process への防御ではありません。

cache key は diff hash に加え、明示指定された model / reasoning effort を含みます（既定設定ではキーは従来どおりで既存 cache を維持）。renderer が渡す model / effort は main（`optionalReviewRunOptions`）で形式と enum を再検証します。一方 group fingerprint には prompt、model、JSON Schema の contract version は含まれません。prompt / schema / fingerprint algorithm の contract version を変更する release で既存 cache を確実に無効化する仕組みは post-MVP 課題です。

## 11. Logging と error

- credential、environment 全体、source 全文、完全な diff を log しない。
- stdout / stderr の合計量は制限する。MVP は stderr の credential redaction を実装していないため、外部配布前に追加する。
- UI error は対応可能な説明にし、内部 stack を直接渡さない。
- diagnostic log が必要なら opt-in と retention を明示する。
- crash report / telemetry は MVP では送信しない。

## 12. Dependency と release security

- lockfile を version control に含める。
- Electron と dependency の security update を定期的に取り込む。
- clean environment で build を再現する。
- public distribution 前に code signing、artifact checksum、provenance を導入する。
- auto-update を追加するときは署名検証と trusted endpoint を必須にする。
- release package で fuses、sandbox、navigation policy を smoke test する。

## 13. Security issue 対応

公開前の private MVP では、問題を発見した場合は配布を止め、該当 version、再現条件、影響する data / repository、log の有無を記録してください。credential exposure の可能性がある場合は Diffender の state だけでなく Codex / ChatGPT 側の session も失効させます。

公開 repository にする際は、脆弱性の非公開報告先と response policy を `SECURITY.md` に追加します。
