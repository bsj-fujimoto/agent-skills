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

## 読めないもの

- **Markdown 形式のログ**（Aider の `.aider.chat.history.md` など）
  役割の区切りが見出しの書き方に依存し、本文と混ざるため構造が取れない。
  必要なら手で JSONL に直す。
- **SQLite に入っているもの**
- **コマンド履歴だけのファイル**（`~/.claude/history.jsonl` など）
  発話が入っていないので、そもそも対象外。

## 未知の形式に当たったら

`extract.py` は「何レコード中いくつが対象外だったか」を出して止まる。
まず中身を見る。

```bash
head -c 800 <ログのパス>
```

役割と本文がどのキーにあるか分かれば、`normalize()` の探索先に
キー名を1つ足すだけで対応できることが多い。
