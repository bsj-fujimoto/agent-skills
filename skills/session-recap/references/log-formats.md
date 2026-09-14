# 対応しているログ形式

`extract.py` は**エージェント名では分岐しない**。中身の構造を見て判定する。
同じエージェントでも複数の形式を書くため（Claude Code も `projects/*.jsonl` と
`history.jsonl` と `sessions/*.json` で中身が別物）。

## 読めるもの

### 1. 1行1JSON（JSONL）

```jsonc
{"type":"user","message":{"content":[{"type":"text","text":"..."}]}}
{"role":"user","content":"文字列でもよい"}
{"type":"message","payload":{"role":"assistant","content":[{"type":"output_text","text":"..."}]}}
```

半分以上の行が JSON として読めれば JSONL とみなす（壊れた行は飛ばす）。

### 2. 単一 JSON

配列そのもの、または次のいずれかのキーに会話の配列を持つもの。

`messages` / `history` / `turns` / `events` / `conversation` / `entries`

## どう解釈するか

| 見るもの | 探す場所（順に） |
|---|---|
| 本体 | `message` → `payload` → レコード直下 |
| 役割 | `role` → （無ければ）`type` |
| 本文 | `content` → `parts` → `text` |
| 時刻 | `timestamp` → `ts` → `createdAt`（数値ならエポックとして変換） |

**役割は `role` が最優先。** `type` は `role` が無いときだけ使う。
`{"type":"message","payload":{"role":"user"}}` のような入れ物の名前を
役割と取り違えないため。

役割の言い換えも吸収する。

- 人間 = `user` / `human` / `input`
- AI = `assistant` / `ai` / `model` / `agent` / `output`

本文ブロックは `text` / `output_text` / `input_text` を拾う。
ツール使用は `tool_use` / `tool_call` / `function_call` / `toolCall` を数え、
名前が `Agent` / `Task` / `subagent` のものはサブエージェント委譲として別に数える。

## エージェント別の状況（2026-09 時点の公開情報）

| エージェント | 保存形式 | 読めるか |
|---|---|---|
| Claude Code | `~/.claude/projects/*/*.jsonl` | ✅ 実物で検証済み |
| OpenAI Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | ✅ 実形式の合成ログで検証 |
| GitHub Copilot CLI | `~/.copilot/session-state/**/*.jsonl` | ⚠️ 未検証（キー名が非公開） |
| Gemini CLI | JSONL へ移行中 | ⚠️ 未検証（`role` か `type` か未確定） |
| opencode | `opencode.db`（SQLite） | ❌ |
| Goose | `sessions.db`（SQLite） | ❌ |
| Crush | `<project>/.crush/crush.db`（SQLite） | ❌ |
| Cursor | `store.db` / `state.vscdb`（SQLite） | ❌ |
| Aider | `.aider.chat.history.md`（Markdown） | ❌ |

**SQLite への移行が業界的な流れ**で、opencode・Goose・Copilot・Cursor が既に移行済み。
渡されたファイルが SQLite なら先頭16バイトで判定し、理由と `.schema` の
実行方法を案内する。カラム名さえ分かれば数行の SQL で JSONL に落とせる。

## 読めないもの

- **SQLite** — 上記の通り。`.schema` を見て JSONL に書き出してから渡す
- **Markdown 形式のログ**（Aider）
  役割の区切りが見出し記号に依存するが、`####` や `>` はAIの出力本文にも
  現れるため原理的に曖昧。サンプルを集めても消えない種類のリスク
- **発話が片側しか無いファイル** — 拾うと壊れた要約になるので名前で弾く
  - Gemini の `logs.json`（ユーザーのプロンプトのみ、AI応答が入らない）
  - Claude Code の `history.jsonl`（コマンド履歴のみ）

## 注意点

**同じエージェントでも複数の形式が同一マシンに共存しうる。**
opencode と Goose は SQLite 移行時に旧ファイルが残る
（opencode には移行が黙って skip される既知バグもある）。
「エージェント名 → 形式」の 1:1 対応は成立しない。

**Codex の `arguments` は JSON オブジェクトではなく JSON 文字列。**
中身を使うなら二重パースが要る（このスキルは回数しか数えないので影響なし）。

**いずれも公式仕様ではなく実装詳細。** Codex・Cursor・opencode・Crush は
公式ドキュメントに保存形式の記載が無い。バージョンで変わる前提で、
未知のレコードは握り潰さずスキップする。

## 未知の形式に当たったら

`extract.py` は「何レコード中いくつが対象外だったか」を出して止まる。
まず中身を見る。

```bash
head -c 800 <ログのパス>
```

役割と本文がどのキーにあるか分かれば、`normalize()` の探索先に
キー名を1つ足すだけで対応できることが多い。
