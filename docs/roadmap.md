# ロードマップ

## 読み方

本書は方向性であり、確約された日程ではありません。「MVP」は現在の実装範囲、「候補」は未実装です。優先順位は user validation、security、maintenance cost に基づいて見直します。

## Diffender MVP

目標: ひとりの開発者が、複数のローカル作業場所の変更を見つけ、必要なときだけ Codex review を行い、差分に束縛された承認を残せる。

- [x] Electron Forge / Vite / React / TypeScript の desktop shell
- [x] 複数 repository / worktree の明示登録
- [x] branch、HEAD、変更有無の Git refresh
- [x] file diff と追加／削除行数
- [x] `codex exec` の read-only / ephemeral / JSON Schema review
- [x] semantic groups、risk、findings
- [x] progress、cancel、failure / retry
- [x] diff-hash cache
- [x] fingerprint-bound group approval
- [x] atomic JSON state
- [x] sandboxed renderer と narrow IPC
- [x] ChatGPT login 利用、API key auth block
- [x] review feedback の生成と clipboard copy
- [x] Codex App Server による既存／新規 thread の紐付け
- [x] 明示確認後の実装 turn 送信と完了通知
- [x] 右下固定の修正指示アクションパネル
- [x] Codex / Claude Codeの自動判定と手動指定
- [x] Claude Code直近project sessionへの直接送信
- [x] Windows package 構成

チェックは製品範囲を示します。release quality は typecheck、test、manual QA、package smoke test で別途判定します。

## 次期候補 — Reliability

- state backup / recovery UI と明示的 migration
- Git / Codex timeout、size limit、error taxonomy の調整
- large diff の sampling と「省略箇所」表示
- prompt / schema / fingerprint version の migration test
- cache retention と disk usage 管理
- project 削除後に残る orphan approval entry の pruning
- cache / fingerprint key への prompt・schema contract version 追加
- Codex result の diff path membership、string / array size、ID uniqueness 検証
- source 内 instruction を明示的に無視する review prompt hardening
- user-visible stderr の credential redaction
- state schema validation、migration、backup / recovery
- navigation、new-window、permission request の明示的 deny policy
- accessibility、keyboard navigation、high contrast
- signed Windows artifact、CI build、artifact checksum
- Electron / dependency update automation

完了条件の例:

- app / process crash 後も最後の正常 state を回復できる
- malformed repository / Codex output で renderer が crash しない
- public distribution artifact の署名と provenance を検証できる

## 候補 — Worktree intelligence

MVP は選択した directory を一つの project として登録します。次の機能は未実装です。

- `git worktree list --porcelain` による sibling worktree の検出
- repository family ごとの grouping
- worktree 一括登録
- stale / prunable worktree の表示
- 同じ branch / HEAD / diff の重複整理

自動探索は予期しない path の登録や privacy 問題を生むため、preview と user confirmation を必須にします。

## 候補 — Review depth

- review profile（bug、security、performance、test）
- scope selector（all changes / staged / selected files）
- user-defined repository guidance の明示表示
- finding filtering、sort、resolved state
- review history と snapshot comparison
- unchanged group だけの安全な approval carry-forward
- 変更のないファイルを再送しない増分レビュー（input トークン削減。効果は diff サイズ比例）
- local static analysis / test 結果との統合

モデル名や reasoning option を UI に増やす前に、ChatGPT plan の互換性、利用枠の説明、cache identity を定義します。トークン/コスト削減レバーの実測評価（推論強度・モデル・prompt caching・増分レビューの方式案）は [review-cost-optimization.md](review-cost-optimization.md) にまとめてあります。**推論強度やモデルのダウングレードはトークン削減には効かず品質を損なうため、削減目的では採用しない**という結論です。

## 候補 — Developer workflow

- commit 前 checklist の export
- review summary の Markdown copy
- deep link で editor の file / line を開く
- Git staging との読み取り専用連携
- optional file watcher による **Git status のみ** の background refresh
- review queue と明示的 concurrency limit

source の編集、commit、push を追加する場合は、現在の read-only product boundary を変える重大な決定です。個別 permission、preview、undo、audit log、threat model 更新なしには導入しません。

### 変更検知（差分が出たときの通知）の方針

「差分が出たときに Diffender へ知らせる」手段の方針（決定日: 2026-07-26）。上記 file watcher 項目の詳細方針。

- **git フックは不採用**: レビュー対象は未コミットの作業ツリー差分。git フック（post-commit / post-checkout / post-merge 等）は git 操作時にしか発火せず、ファイル編集＝未コミット差分では発火しないため用途に合わない。
- **① アプリ内ファイルウォッチャー（土台）**: main プロセスが登録 worktree を監視（`.gitignore` 尊重・デバウンス・`node_modules` 等除外）し、**Git status のみの refresh**（`hasChanges` / stale 更新）を行う。**AI レビューは自動起動しない**（refresh ≠ AI review。従量課金 review の自動開始は「意図的に予定しないこと」に一致）。
- **② 外部からの push（例: 実装エージェント完了の即時通知）が要る場合**: Diffender に inbound チャネルは無い（IPC は renderer↔main 専用）ため、**所定の sentinel ファイルを書いて①のウォッチャーに拾わせる「ファイル・トリガー方式」を採用**（ネットワーク面を増やさず最小リスク）。localhost の受信エンドポイントや named pipe は攻撃面が増え、[security.md](security.md) の「任意チャネル／任意 URL を増やさない」不変条件に触れるため、正当な理由と threat model 更新が出るまで見送る。
- **推奨構成**: ①を常時の土台にし、必要なら②を上乗せするハイブリッド。
- **着手順の見立て**: ①はほぼ main プロセス側の作業（`git.ts` / `review-service` / IPC / ウォッチャー新設）で、Issue #1（サイドバーの worktree ツリー表示）との競合は小さい。UI 追従は「stale バッジが自動で付く」程度で済む。

## 候補 — Storage evolution

MVP は atomic JSON です。次の条件が現れたら SQLite を評価します。

- review history が大きくなり JSON 全体書き換えが遅い
- project / finding の横断検索が必要
- retention / pagination / partial loading が必要
- migration を transaction として行う必要
- 複数 window / process の整合性が必要

移行時は JSON import、backup、schema version、rollback、downgrade protection を用意します。SQLite は現時点では実装されていません。

## 候補 — Platform

- macOS package、notarization、universal build
- Linux AppImage / deb / rpm の評価
- platform ごとの Git / Codex discovery
- auto-update と署名検証
- enterprise deployment policy

Tauri への移行は roadmap item ではなく architecture revisit です。package size、memory、security policy、multi-platform cost の実測値が Electron の migration cost を上回る場合に検討します。

## 意図的に予定しないこと

- API key を自動検出して従量課金 review を開始すること
- AI finding を無条件に「安全」と判定すること
- approval が変化後も残るよう fingerprint check を弱めること
- repository 内の instruction に OS / network 権限を与えること
- user confirmation なしの recursive disk scan

## 優先順位の判断基準

1. stale approval や意図しない課金を防ぐ security
2. state と review result を失わない reliability
3. review 判断にかかる時間の短縮
4. large repository / many worktrees での performance
5. collaboration と external integration

機能数ではなく、「変更されたのに承認が残らない」「AI を使わない refresh が速い」「なぜ失敗したか分かる」を品質の中心に置きます。
