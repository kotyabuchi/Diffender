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
