# レビューのトークン/コスト最適化（調査記録）

## 1. 目的と結論

AIレビュー1回あたりの ChatGPT 利用枠（トークン）消費を減らせるかを実測で検証した記録。
結論を先に述べる。

- **推論強度（`model_reasoning_effort`）やモデル選択は、トークン削減にほぼ効かない**。トークンの約92%が input で占められ、reasoning / output は小さいため。
- **推論強度を下げると品質が劣化した**（最重要の high 指摘を見落とす事例を観測）。
- **prompt caching は追加実装なしで自動的に効いている**。固定オーバーヘッドの大半が cached input として再利用される。
- 削減が効くのは input 側のみ。すなわち **送る差分そのものを減らす「増分レビュー」**が唯一の実効レバーだが、効果は diff サイズに比例し、MVP には実装コストが重いため **今回は見送り**（第5節に設計案を残す）。

## 2. 計測環境

- `codex-cli` 0.144.5、`--json` の `turn.completed.usage` を集計。
- モデル: `gpt-5.6-terra`（内部識別 `gpt-5.6-terra-1p-codexswic-ev3`）。
- 固定 diff: Diffender 自身のコミット `62f1886~1..62f1886`（4 ファイル / +158 -25 / 18,883 bytes）。
- 呼び出しは本番同等（`--ephemeral --ignore-user-config --sandbox read-only --output-schema <review schema> -`）に `--json` を足したもの。本番の `review()` は変更していない。
- 計測スクリプトは開発用の使い捨て（本リポジトリには未コミット）。`codex exec --json` を組み合わせぶん実行してトークンと最終レビュー本文を集計する方式。

## 3. 実測結果

### 3.1 推論強度別（同一 diff）

| effort | 時間 | input | cached_in | output | reasoning | **total** | groups/findings | high 指摘 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| (既定) | 24.8s | 18,831 | 0 | 1,212 | 472 | **20,515** | 2 / 2 | ✅ 検出 |
| medium | 26.9s | 19,470 | 0 | 1,290 | 516 | **21,276** | 2 / 2 | ✅ 検出 |
| low | 32.7s | 18,831 | 0 | 1,497 | 782 | **21,110** | 2 / 2 | ❌ 見落とし |
| minimal | — | — | — | — | — | 失敗 | — | 非対応 |

- **input が total の約92%**（20,515 のうち 18,831）。output ≈6%、reasoning ≈2%。
- default と medium はトークン・品質ともほぼ同一 → **既定は medium 相当**。
- low はトークンが減らず時間が延び、さらに high（main プロセスで stale を再検証していない脆弱性）を見落とした。medium/default は同 high を両方検出。
- `minimal` は非対応。`gpt-5.6-terra` の有効値は **`none / low / medium / high / xhigh`**。
- 単発サンプルのため個々の数値には分散があるが、「input が支配的」という構造は分散に依らず成立する。

### 3.2 固定オーバーヘッド

極小プロンプト（"1+1"相当）でも input ≈ 14k tokens。これは Codex のエージェント用システムプロンプト＋ツール定義の**固定オーバーヘッド**で、diff はこの上に乗る。上表の input 18,831 ≈ 固定 ~14k + diff 本体 ~4.8k と分解できる。

### 3.3 prompt caching

同一プレフィックスを連続実行したときの `cached_input_tokens`:

| 条件 | cached_input |
| --- | --- |
| default 連続2回 | 9,472 → 9,472 |
| effort=low 連続2回 | 2,816 → 9,472 |
| 直後に default | 13,568 |

- 固定オーバーヘッド ~14k の大半（最大 ~13.5k）が cached input として再利用される。cached input は fresh input より大幅に安い。
- キャッシュは**自動**。維持条件は「model・effort・システムプレフィックスを安定させる」「安定した指示文を前・揺れる diff を後」。後者は現状の `buildPrompt`（[review-service.ts](../src/main/review-service.ts)）が既に満たしている。
- 3.1 の 4 組が `cached=0` だったのは、**呼び出しごとに effort を変えてキャッシュを壊した**ため。→ **per-run で effort/model を切り替えるとキャッシュ再利用を毎回失う**。

## 4. 削減レバーの評価

| レバー | トークン削減 | 品質影響 | 実装コスト | 判定 |
| --- | --- | --- | --- | --- |
| 推論強度を下げる | ほぼ無し | 悪化 | 小 | ✗ 採らない |
| 安いモデルへ変更 | トークン数は不変（単価のみ変化） | 未検証・低下リスク | 小 | △ 有効モデル/単価が判明したら再検討 |
| prompt caching | 実効 input を削減 | 無し | **不要（自動）** | ✓ 既定を安定させて活かす |
| 増分レビュー（input 縮約） | diff サイズに比例 | 方式による | 大 | 見送り（第5節） |

## 5. 増分レビュー設計案（将来検討・今回は見送り）

「前回レビューから変更のないファイルを Codex に送らず、キャッシュ済み findings を再利用する」方向。効果は diff が大きいほど大きく、AI 生成の大変更で有効。一方で以下の不変条件に触れるため MVP には重い。

- 現在のキャッシュキーは `version + 全体 diffHash`（[review-service.ts](../src/main/review-service.ts) `reviewCacheKey`）。少しの変更で全体が cache miss になり全再レビューになる。
- group fingerprint と承認が**全体 diffHash に束縛**（[diff.ts](../src/main/diff.ts) `groupFingerprint`）。
- グループ化は**意図単位の横断**（複数ファイルを intent でまとめる）。変更ファイルのみ送ると横断グループを再構成できない。

### 方式候補

- **A: ファイル単位で送信＋未変更ファイルの findings 再利用。** 変更ファイルだけ Codex に送り、未変更ファイルは前回 findings を流用。横断グループは簡易に再構成。中〜大の削減。横断グループが崩れやすく、per-file 単位の再グループ化が必要。
- **B: 2 段階（ファイル別レビュー → 軽量グループ化パス）。** ファイル別レビューを個別キャッシュし、findings テキストだけを使う安価なグループ化パスで横断グループを維持。削減最大だがレビュー契約の刷新が必要（contract version 更新・cache 全無効化）。
- **C: 現状維持。** 増分化せず、必要になったら再検討。

### 実装時の必須事項

- prompt / schema / fingerprint / cache モデルを変えるので **review contract version を更新**し、旧 cache を無効化する（[review-pipeline.md](review-pipeline.md) §5-6, §10）。
- fingerprint を「そのグループが触るファイル群」だけに依存させ、変更のないグループの承認を引き継げるようにする（[review-pipeline.md](review-pipeline.md) §10 の将来方針と整合）。
- 分割呼び出しにすると固定オーバーヘッド ~14k が呼び出し回数ぶん増える。ただし caching が効けば 2 回目以降は cached で吸収され得る。呼び出し数と caching のバランスを実測で確認する。

## 6. per-run 品質セレクタ（#1）— 実装済み

トークン削減目的では没だが、「重要レビューだけ `xhigh` で精査」「モデルを選ぶ」という**品質選択の付加機能**として実装した。挙動:

- `reviews.run(projectId, { model?, effort? })` に任意設定を追加（contract → codex → service → ipc → preload → renderer の縦スライス）。
- **モデル一覧は Codex App Server の `model/list` から取得**（[codex-app-server.ts](../src/main/codex-app-server.ts) `listModels` / `mapReviewModels`）。起動後、認証済みになった時点で renderer が取得しツールバーのセレクタに表示する。取得失敗時はセレクタを出さず既定モデルで実行できる。
- **提示する推論強度は `low / medium / high / xhigh` に限定**。`model/list` は `max / ultra` も返すが exec エンドポイントが拒否し得るため、両者で確実に通る値だけに絞る（`minimal` は非対応なので渡さない）。
- **キャッシュキーに model / effort を含める**（[review-service.ts](../src/main/review-service.ts) `reviewCacheKey`）:
  - 既定設定（未指定）は従来どおりキーが変わらず既存 cache を再利用。
  - `xhigh` などを選ぶと自然に cache miss = 新規レビュー（＝精査し直しの期待挙動）。
  - 同じ差分でも設定違いの結果が衝突しない（複数エントリを許容し、承認・フィードバックは reviewId で該当 snapshot を引き diffHash 一致を検証する）。
- 既定値は固定のままにし、caching 再利用を壊さない（第3.3節）。UI は「設定を変えるとキャッシュを使わず消費が増える／削減目的ではない」旨をツールチップで明示する。
- renderer 入力は信頼せず、main（ipc `optionalReviewRunOptions`）で model 形式と effort enum を再検証する。

## 7. 推奨アクション

1. **caching を前提に既定を安定させる**（追加実装なし。effort/model をむやみに per-run で変えない）。
2. 増分レビューは **diff が大きいユースケースの実需が確認できてから**、方式 B を軸に contract version 更新込みで着手する。
3. ~~#1 セレクタは品質選択機能として任意実装~~ → **実装済み**（第6節）。トークン削減を訴求しないこと。
