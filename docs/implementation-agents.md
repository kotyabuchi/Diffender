# 実装エージェント判定

## 1. 目的

AIレビューを行うCodexと、レビュー後の修正を担当する実装エージェントは同一とは限りません。Diffenderはプロジェクトごとに実装先を判定し、右下固定の「フィードバック」パネルでCodexまたはClaude Codeへフィードバックを渡します。

## 2. 自動判定

次の固定パスとローカル状態だけを確認します。repository全体の再帰探索や会話本文の読み取りは行いません。

| シグナル | 候補 |
| --- | --- |
| Codex thread IDがプロジェクトに紐付いている | Codex・確度高 |
| `CLAUDE.md`、`CLAUDE.local.md`、`.claude` | Claude Code |
| `AGENTS.md`、`.codex` | Codex |
| Claude Code / Codex CLIの片方だけが利用可能 | そのCLI・確度低 |

両方の設定がある、または十分なシグナルがない場合は「未判定」にします。uncommitted diffだけから実装者を断定することはできません。誤送信を避けるため、固定パネルの選択欄でCodex / Claude Codeを手動指定でき、その選択をプロジェクトに保存します。「自動」へ戻すこともできます。

## 3. Codexへの送信

Codexを選択した場合は、既存または新規のCodex taskを紐付けます。直接送信はCodex App Serverの`thread/resume`と`turn/start`を使います。詳細は [codex-handoff.md](codex-handoff.md) を参照してください。

## 4. Claude Codeへの送信

Claude Codeを選択した場合は、登録プロジェクトを作業フォルダとして次の非対話モードを起動します。

```text
claude --continue --print --permission-mode acceptEdits --output-format json --max-turns 20
```

- `--continue`: その作業フォルダの直近セッションを継続
- `--print`: 非対話実行し、完了後に終了
- `acceptEdits`: セッション中のファイル編集を許可
- `--dangerously-skip-permissions`: 使用しない
- `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`: 子プロセスへ継承しない

対象フォルダに継続可能なClaude Codeセッションがない場合は送信に失敗します。先にClaude Codeでプロジェクトを開くか、クリップボードへコピーして任意のセッションへ貼り付けます。

Claude Codeの認証方式や利用枠はClaude Code側の契約と設定に従います。Diffenderは資格情報を読み取り、保存しません。

## 5. 固定アクションパネル

AIレビュー結果が表示されている間だけ、画面右下に固定表示します。

- 自動判定 / 手動指定と判定理由
- Codex task設定
- フィードバックのクリップボードコピー
- 選択した実装エージェントへの直接送信
- 実行中、完了、失敗メッセージ

パネルはviewport基準で固定し、レビュー本文の末尾にはパネル分の余白を設けます。レビュー実行中やレビュー未生成の画面では表示しません。
