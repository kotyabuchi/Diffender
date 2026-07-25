# 製品仕様

## 1. 概要

Diffender は、複数のローカル Git 作業場所に散らばる変更を「レビュー待ちの受信箱」としてまとめるデスクトップアプリです。Git の事実確認と AI レビューを分離し、ユーザーが差分を読んだうえで、意味単位に承認を残せることを重視します。

対象バージョンは MVP `0.1.0` です。本書で「MVP」と書く項目は現在の製品範囲、「将来」と書く項目は未実装です。

## 2. 解決する問題

ローカルで複数の repository や worktree を並行して使うと、次の状態が見えにくくなります。

- どの作業場所に未コミット変更があるか
- 変更の意図が何単位に分かれているか
- どこに高リスクな変更や見落としがあるか
- 以前確認した内容から差分が変わっていないか

Diffender は、Git 状態の一覧、差分、Codex による補助レビュー、差分に束縛された承認をローカル UI にまとめます。

レビュー本文は日本語で生成し、Git の内部ヘッダーよりも変更行と確認ポイントを優先して表示します。各 finding にはユーザー自身の判断・対応方針を残すメモ欄を設け、snapshot とともにローカル保存します。

## 3. 製品原則

1. **ローカル優先**: project registry、レビュー、承認はローカルに保存する。
2. **明示的な AI 実行**: Git refresh と Codex review を分け、利用枠を意図せず消費しない。
3. **読み取り専用**: MVP はコードを編集、commit、push しない。
4. **承認を差分に束縛**: 内容が変われば以前の承認を再利用しない。
5. **境界で検証**: repository path、IPC 引数、Codex JSON を信頼しない。
6. **判断主体は人**: AI の risk や finding は補助情報であり、安全性の保証ではない。

## 4. 対象ユーザー

- 複数 repository / worktree を日常的に扱う開発者
- AI coding agent が生成した変更をローカルで確認する開発者
- PR を作る前に変更を意味単位で整理したい開発者

MVP は単一ユーザー、単一マシン、個人のローカル作業を対象とします。チーム共有や compliance workflow は対象外です。

## 5. MVP の範囲

| 能力 | MVP |
| --- | --- |
| repository 登録 | directory picker で明示的に追加 |
| worktree | 選んだ worktree を個別 project として登録 |
| Git refresh | branch、HEAD、変更有無、diff を再取得 |
| AI review | ユーザー操作で `codex exec` を開始 |
| review 表示 | summary、目的別 groups、risk、findings、file diff、目次 |
| 承認 | group 単位。fingerprint が一致するときだけ維持 |
| cache | project の現在の diff hash に一致する review を再利用 |
| 保存 | Electron user data 配下の atomic JSON |
| 認証 | 保存済み ChatGPT login のみ |
| 実装への引き渡し | 右下固定パネル、修正指示コピー、Codex / Claude Code判定、明示確認後の直接送信 |
| 書き込み操作 | 選択した実装エージェントが登録project内を変更可能 |

## 6. 対象外

- commit、branch 作成、push、PR 操作
- API key による Codex review
- repository の再帰探索
- `git worktree list` からの一括登録
- background file watcher による常時 AI review
- 実装 turn の対話承認、送信キュー、複数 turn の進行管理
- uncommitted diffだけから実装エージェントを断定すること
- remote repository、CI、Git hosting との同期
- 複数ユーザー、権限管理、承認共有
- AI review を security scanner やテストの代替にすること

## 7. UX フロー

### 7.1 初回起動

1. アプリが Codex CLI のインストール状態と認証方式を確認する。
2. ChatGPT login が利用可能なら inbox を表示する。
3. 未インストール／未認証なら、理由と端末側での対応を表示する。
4. API key 認証なら、課金上の違いを警告し review を無効にする。

Git の閲覧は Codex review と分離されているため、Codex が利用できない場合も project と差分は確認できる設計とします。

### 7.2 project 登録

1. ユーザーが `Add repository` を押す。
2. OS directory picker で場所を選ぶ。
3. main process が Git repository / worktree の root として有効か検証する。
4. branch、HEAD、worktree 判定、変更有無を取得して登録する。
5. 同じ正規化 path が登録済みなら重複を作らない。

### 7.3 日常の review

1. inbox で変更のある project を選ぶ。
2. 「更新」で Git 状態を最新化する。
3. diff を人が読む。
4. 必要な場合だけ「AIレビュー」を押す。
5. `queued → reading → analyzing → complete` の進捗を見る。
6. summary、group、risk、finding、対応 file を確認する。
7. group ごとに承認する。
8. 指摘へ自分の判断や対応方針をメモする。
9. 固定パネルでCodex / Claude Codeの判定結果を確認し、必要なら手動指定する。
10. Codexの場合は既存または新規のタスクを紐付ける。
11. 修正指示をコピーするか、確認後に直接送信する。

### 7.4 変更後

1. editor や agent が file を変更する。
2. ユーザーが `Refresh` する。
3. 新しい diff hash と既存 snapshot の hash を比較する。
4. 一致しない snapshot は stale として扱う。
5. group fingerprint が変わった承認は解除する。
6. 必要なら review を再実行する。

## 8. 画面と状態

### Inbox

- 登録 project の名前、path、branch、変更有無、review status
- project 追加／削除
- 全体または個別 refresh
- empty state、loading、error

### Review workspace

- project context
- 言い切りの一言要約と、ファイル数・チャンク数・追加／削除行数・承認進捗を示す固定ヘッダー
- 要約と各目的グループへの移動、現在位置の表示を行う左目次
- review summary と source（`cache` / `codex`）
- 目的別 group の intent、category、risk、対象 files
- finding の severity、file、line、reason、suggestion
- file diff
- run、cancel、retry、approve / unapprove

### 状態モデル

`ReviewStatus`:

- `idle`: review 未実行
- `stale`: 保存済み review と現在の差分が不一致
- `queued`: 実行待ち
- `running`: Codex が処理中
- `complete`: 現在の差分に対応する snapshot がある
- `failed`: 最新の実行が失敗

失敗しても、利用可能な既存 snapshot や Git diff を破棄しません。

## 9. データモデル

### `ProjectRecord`

登録 project の identity、表示名、root path、branch、HEAD、worktree 判定、変更有無、review status、最終 review 時刻を持ちます。

### `ReviewSnapshot`

特定 project と特定 diff に対する immutable な review 結果です。`diffHash`、summary、files、groups、追加／削除行数、生成元を持ちます。

### `ReviewGroup`

変更を意図単位にまとめた結果です。title、intent、category、risk、file paths、findings、approval、fingerprint を持ちます。

### `ReviewFinding`

severity、file、任意の line、title、reason、suggestion、ユーザーが記録した reviewer note を持ちます。line は patch に存在しない場合があるため nullable です。

## 10. 機能要件

### Project

- Git repository でない directory は登録しない。
- path は main process で正規化・検証する。
- 登録解除は Diffender の registry からだけ削除し、実ファイルは削除しない。
- Git refresh は Codex を起動しない。

### Review

- 同一 project で重複 review を無制限に並行実行しない。
- Codex は repository を `cwd` として読み取り専用で起動する。
- structured output が schema を満たさない場合は失敗として扱う。
- review 完了前に新しい差分へ変わった場合、その結果を現在の承認対象にしない。
- cache hit は Codex を再実行せず snapshot を返す。

### Approval

- approval は `projectId + reviewId + groupId + fingerprint` の文脈で扱う。
- renderer から送られた fingerprint を権威とせず、保存済み snapshot と現在の差分を main process で照合する。
- diff または group fingerprint が変われば未承認に戻す。

## 11. 非機能要件

- **安全性**: shell 展開なし、renderer sandbox、狭い IPC、API key 排除。
- **耐久性**: state は一時ファイルへ書いてから置換し、中途半端な JSON を避ける。
- **応答性**: Git/Codex は renderer thread で同期実行しない。
- **説明可能性**: finding は理由と提案を持ち、file と可能なら line を示す。
- **再現性**: MVP の review は diff hash に結び付ける。schema / prompt version との結合は将来の hardening とする。
- **可観測性**: ユーザー向け stage と安全な error detail を表示する。

## 12. 失敗時の振る舞い

| 失敗 | UI / データの扱い |
| --- | --- |
| Git 未導入／実行失敗 | project ごとの error。既存登録は維持 |
| directory が Git でない | 登録せず、再選択を促す |
| Codex 未導入／未ログイン | review を止め、セットアップ案内 |
| API key auth | 課金警告を表示し review を止める |
| Codex timeout / cancel | process を終了し partial output を破棄。refresh 後の Git 状態に応じて idle / stale / failed を表示 |
| schema 不一致 | raw output を採用せず failed |
| state JSON 破損 | 起動時の読み込みを失敗させ UI に通知。自動 recovery / backup UI は将来対応 |
| 実行中に diff 変更 | 結果を stale とし承認対象にしない |

## 13. MVP の完了条件

- 2 個以上の repository / worktree を登録して一覧できる。
- Git refresh と AI review が別操作になっている。
- 現在の diff を表示できる。
- ChatGPT login の Codex CLI で schema-valid review を取得できる。
- API key auth で review が開始されない。
- review group を承認でき、対象変更後に承認が維持されない。
- restart 後も registry、review、正当な approval が復元される。
- typecheck と unit test が通り、Windows package を作成できる。
