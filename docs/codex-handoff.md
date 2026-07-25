# Codexタスク連携

Codex / Claude Codeの実装先判定と右下固定パネルについては [implementation-agents.md](implementation-agents.md) を参照してください。本書はCodexを選択した場合のthread連携に限定します。

## 1. 目的

レビュー画面で残した承認状態とメモを、コピー＆ペーストなしで実装担当の Codex タスクへ渡します。Diffender は OpenAI API を直接呼ばず、端末の Codex CLI が持つ ChatGPT ログインと Codex App Server を利用します。

## 2. 3段階の使い方

### 2.1 修正指示をコピー

「修正指示をコピー」は、現在の差分に一致するレビューから次を Markdown にまとめます。

- プロジェクト名、作業フォルダ、レビュー ID、差分 hash
- レビュー概要
- 目的ごとの承認／未承認
- リスク、対象ファイル、指摘、提案
- 確認ポイントごとの「自分のメモ」
- 実装後のテストと日本語報告の依頼

raw patch は含めません。Codex タスクは作業フォルダを直接確認できるため、冗長な差分の複製を避けます。レビュー後に差分が変わっている場合はコピーを拒否します。

### 2.2 Codexタスクを紐付け

次の3経路を提供します。

1. 登録プロジェクトと同じ作業フォルダを持つ既存タスクを一覧から選ぶ
2. 「別のフォルダで始めた最近のCodexタスクも表示」で最近のトップレベルタスクを選ぶ
3. Codexタスク ID を直接入力する

「新規タスク」は `thread/start` を使い、登録プロジェクトを `cwd` とする永続タスクを作ります。作成した ID は `diffender-state.json` の該当プロジェクトに保存します。Diffender は Codex の session JSON を直接読み書きしません。

### 2.3 フィードバックを直接送信

「フィードバックを送る」は、確認ダイアログの後に次を行います。

1. Codex CLI が ChatGPT ログインであることを再確認
2. review ID と現在の diff hash が一致することを確認
3. 紐付けた thread を対象プロジェクトの `cwd` で resume
4. `turn/start` で生成した修正指示を送信
5. `turn/completed` を受け、成功または失敗を画面へ通知

送信開始は Codex 利用枠を消費し、対象プロジェクトのファイルを変更する可能性があります。そのため、一覧表示、紐付け、指示コピーとは分離し、必ず明示操作と確認を挟みます。

## 3. 実行境界

実装 turn の設定:

| 項目 | 値 |
| --- | --- |
| 作業フォルダ | 登録プロジェクトの root |
| sandbox | `workspaceWrite` |
| writable roots | 登録プロジェクト root のみ |
| network access | `false` |
| approval policy | `never` |
| API key 環境変数 | child process へ継承しない |

`approvalPolicy: never` は危険な操作を自動承認する設定ではありません。通常の sandbox 内操作だけを許可し、追加権限が必要な操作は進めません。Diffender は対話型の権限承認 UI をまだ提供していません。

## 4. 既にCodex Appで作業している場合

同じプロジェクトフォルダで開始したトップレベルタスクは、通常の一覧に表示されます。Codex App の現在のタスクが別フォルダで開始されている場合は、「最近のCodexタスクも表示」を有効にするか、タスク ID を直接入力します。

既存タスクへ送った turn では `cwd` を登録プロジェクトへ切り替えます。会話の文脈を混ぜたくない場合は、新規タスクを作る方が安全です。実行中のタスクへの並行送信は行わず、完了後に再送します。

## 5. 失敗時

- App Server を起動できない: Codex CLI の導入とログイン状態を確認
- タスクが見つからない: 最近のタスク表示または ID 直接入力を使用
- レビューが古い: 更新後に再レビュー
- タスクが実行中: Codex App で完了を待って再送
- Codex Appを開けない: OS の `codex://` protocol 登録を確認

Codex App Server は実験的インターフェースです。Diffender はインストール済み CLI の protocol を実行時に利用するため、CLI 更新後は一覧取得、新規作成、送信の smoke test を行います。
