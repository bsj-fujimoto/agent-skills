# 自分のログを自分で読む

**事前に用意されたパーサーは要らない。** 構造を1回見てから
その場で書くほうが速く、確実。ここはその手引き。

## 手順

```bash
# 1. 場所を探す（下の表にあたりを付けてから、無ければ総当たり）
ls -t ~/.claude/projects/*/*.jsonl 2>/dev/null | head          # Claude Code
ls -t ~/.codex/sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head # Codex CLI
ls -t ~/.cursor/chats/*/*/store.db 2>/dev/null | head          # Cursor CLI
find ~ -maxdepth 5 \( -name '*.jsonl' -o -name '*.db' \) -newermt '-7 days' 2>/dev/null | head

# 2. 構造を1回見る
head -c 800 <ログ>

# 3. 見た構造に合わせて書く
```

**場所は決め打ちしない。** バージョンで変わるし、`XDG_CONFIG_HOME` を
設定していると `~/.config/` 側に移る。上の表は当たりを付けるためのもので、
外れたら `find` で探すほうが速い。

## JSONL の場合

```bash
# まず1行の形を見る
head -1 <ログ> | python3 -m json.tool | head -30

# role と本文の場所が分かったら取り出す
jq -r 'select(.payload.type=="message")
       | "\(.payload.role): \(.payload.content[].text)"' <ログ>
```

## SQLite の場合

`sqlite3` コマンドが無くても、Python の標準ライブラリで読める。

```python
import sqlite3, json
c = sqlite3.connect("<ログ.db>")
# まずスキーマを見る
for (sql,) in c.execute("SELECT sql FROM sqlite_master WHERE type='table'"):
    print(sql)
# カラム名が分かったら取り出す
for role, body in c.execute("SELECT role, content FROM messages ORDER BY rowid"):
    print(role, body[:80])
```

本文が JSON 文字列で入っていることが多い（Crush の `parts` など）ので、
その場合は `json.loads()` を挟む。

**Cursor** は特殊で、キーバリュー型のテーブルに JSON blob を詰めている。

```python
import sqlite3, json
c = sqlite3.connect("~/.cursor/chats/<id>/<uuid>/store.db")
# まず何が入っているかを見る（テーブルは blobs / meta）
for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'"):
    print(r)
# blobs から1件取り出して構造を確かめる
for k, v in c.execute("SELECT rowid, * FROM blobs LIMIT 1"):
    print(str(v)[:400])
```

エディタ本体（CLIではない）は `state.vscdb` の `cursorDiskKV` テーブルで、
`composerData:<id>` がセッション、`bubbleId:<composerId>:<bubbleId>` が
個別メッセージ。1メッセージ = 1 bubble。

## 何を捨てるか（形式より大事）

どの形式でも、生ログには**人間が打っていないもの**が混ざる。
そのまま数えると実態とずれるので、必ず落とす。

| 捨てるもの | 見分け方 |
|---|---|
| スキル本文の展開 | `Base directory for this skill` で始まる |
| システム注入 | `<system-reminder>` `<local-command-stdout>` |
| サブエージェント内部の往復 | `isSidechain: true`（Claude Code） |
| 引き継ぎ要約 | `This session is being continued from...` |
| ツール実行の結果 | 呼び出し側で1回数えれば足りる |

**残す価値があるもの**: バックグラウンド処理の完了通知。
人間の発言ではないが、「AIが自発的に動いた区切り」として時系列に効く。

スラッシュコマンドは `<command-name>` + `<command-args>` に展開されているので、
そこだけ取り出すと実際に打った内容になる。

## 形式ごとのつまずき

**Codex CLI** — ツール呼び出しが**独立したレコード**として並ぶ
（content ブロックの中ではない）。`payload.type == "function_call"` を
別に数えないと、ツール実行が0件になる。
`arguments` は JSON オブジェクトではなく **JSON 文字列**なので二重パースが要る。

**Gemini CLI** — `~/.gemini/tmp/*/logs.json` は**ユーザーの発話しか入らない**。
これを読むと片側だけの壊れた要約になる。会話全体は別のファイル。

**Claude Code** — `~/.claude/history.jsonl` はコマンド履歴で、会話ではない。
会話は `~/.claude/projects/<プロジェクト>/<セッションID>.jsonl`。

**同じエージェントで複数形式が共存しうる** — opencode や Goose は
SQLite へ移行済みだが、旧 JSON/JSONL がディスクに残る。
「エージェント名 → 形式」の 1:1 対応は成立しないので、
名前で決めつけず実際にファイルを見る。

**Aider** — Markdown（`.aider.chat.history.md`）。`####` が人間の入力、
プレフィックス無しがAIの出力だが、`####` はAIの出力本文にも現れうるため
完全なパースは原理的に無理。取りこぼす前提で扱う。

## 迷ったら

役割と本文がどのキーにあるか分からないときは、数レコードを目で見る。

```bash
head -5 <ログ> | python3 -m json.tool
```

これで分からない形式は、たいてい会話ログではない（設定やイベント記録）。
