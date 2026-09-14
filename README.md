# agent-skills

Claude Code などのコーディングエージェント向けスキル集。

## インストール

```bash
npx skills add bsj-fujimoto/agent-skills
```

スキルを選んで入れる場合:

```bash
npx skills add bsj-fujimoto/agent-skills --skill eli5-form
```

グローバル（ユーザー全体）に入れる場合は `-g` を付ける。

### スラッシュコマンドが Unknown command になったら

原因は2つ考えられる。**上から順に試す。**

**1. セッションを開き直す**（まずこれ）

スキルの一覧はセッション開始時に読み込まれる。
インストールより前から開いていたセッションでは、何をしても認識されない。

**2. `--copy` で入れ直す**

```bash
npx skills add bsj-fujimoto/agent-skills -g --copy
```

`npx skills` は既定でシンボリックリンクを張る（公式はこれを推奨）。
ただし環境によっては、その形だとスキルとして拾われないことがある。

```bash
ls -la ~/.claude/skills/<スキル名>   # symlink かどうか
```

symlink で動いている実績が手元に無いなら、`--copy` のほうが確実。
`npx skills update` は方式を引き継がないことがあるので、
更新後に効かなくなったらここを疑う。

## 収録スキル

### session-recap

セッションの会話を「人間の指示 ↔ AIの応答」の時系列HTMLにまとめ、
冒頭に **どういう順序で何をどう進めたか** のワークフロー図を付ける。

長い作業ログを、あとから来た人が5分で追える1枚にするためのもの。
議事録ではなく「進め方の地図」を作る。

```bash
# 既定: 別プロセスに投げる（元のセッションに作業ログを残さない）
~/.claude/skills/session-recap/scripts/detached.sh <セッションID> out.html

# そのまま実行（使い捨てセッション向け）
/session-recap
/session-recap 80ee9307
```

**なぜ別プロセスが既定か。** このスキルを使いたい場面は、たいてい
参考にしたい良いやり取りが行われたセッション。そこで実行すると、
HTMLを作る作業そのものがそのセッションのログに残る。
振り返る価値のある会話ほど、末尾に作業ログがぶら下がるのは惜しい。

`detached.sh` は `claude -p` / `cursor-agent -p` / `codex exec` のうち
使えるものを選んで投げる。呼ばれた側が自分で SKILL.md を読み、
最後まで作って出力パスだけを返す。

出力は単一HTMLファイル（外部依存なし）。段階ごとのフィルタと、
流れが変わった回のハイライト付き。

**動くもの**

| | 役割 |
|---|---|
| `scripts/extract.py` | `.jsonl` からターンを抽出（システム注入・サブエージェント内部の往復を除去） |
| `scripts/build.py` | JSON → HTML。書き出し後に自分で描画して検証する |
| `assets/template.html` | 見た目の雛形 |
| `references/data-schema.md` | データ形式 |

要約と段階分けはエージェントが担当する。そこがこのスキルの本体で、
前後の定型作業だけをスクリプトに寄せている。

**必要なもの**: Python 3 / Node.js（`build.py` の自己チェックに使う。無ければ省略される）

**他のエージェントでも使える。** ログの読み出しは事前に用意したパーサーに頼らず、
使う側のエージェントが自分のログを自分で読む方針にしている
（場所と形式は本人が知っているし、知らなくても1回見れば分かる）。
書き方と形式ごとの罠は
[reading-logs.md](skills/session-recap/references/reading-logs.md)。

`extract.py` は Claude Code の分だけの便宜ツール。
これが有り難いのは形式を吸収するからではなく、**何を捨てるかを知っている**から
（スキル本文の展開・システム注入・サブエージェント内部の往復など、
人間が打っていないものが生ログには大量に混ざる）。

そして**短いセッションならログを読む必要すらない**。会話が全部見えているなら
そのまま要約すればよく、ログを読むのは compact が起きたときや
別のセッションをまとめるときだけ。

**ログを読むときはサブエージェントに投げる。** 本文は数十万字になる
（72ターンのセッションで19万字）ので、対話の続きに使うコンテキストを食い潰す。
別のセッションをまとめるなら、その19万字を手元に入れる理由がない。
サブエージェントのログは完全に別ファイルで、親には段階のリストだけが返る。

### eli5-form

確認したい論点を「**そのまま回答できるフォーム**」にした HTML を作る。
各項目に出典・図・AI推奨を付け、選択肢と自由記述で答えてもらう。
分からない項目は**その場で Claude に聞ける**。

説明して終わる `eli5` との違いは、**回答を受け取るのが目的**である点。
設計の不明点を洗い出したいとき、仕様の未決事項を潰したいとき、
レビュー依頼のシートを作るときに使う。

```bash
/eli5-form <論点のトピック>
```

回答は localStorage に自動保存され、「決定として保存」で**凍結版 HTML** に落ちる。
論点の本文・出典・図・AI の見立て・回答・Claude とのやり取りが見た目のまま入り、
回答 JSON も `<script type="application/json">` に埋め込まれる。
**HTML 1枚を配ればデータも一緒に渡る。**

**Claude への質問を動かすには**、ページと同じポートに小さなローカルサーバーを立てる。

```bash
cd <リポジトリ>   # ← ここが claude の作業ディレクトリになる
python3 skills/eli5-form/scripts/server.py --ensure   --port 8899 --dir <htmlのある場所> --session <セッションID> --save-dir <保存先>
```

`--resume <セッションID> --fork-session` で `claude -p` を呼ぶので、
**資料を作った文脈をそのまま持ったまま**答えつつ、元のセッションは汚さない。

| | 役割 |
|---|---|
| `scripts/server.py` | 静的配信と `/ask` `/save` `/health` を同じポートで処理 |
| `scripts/form-parts.js` | 通知スタック・Markdown 描画・凍結版の書き出し・IME 対応の送信 |
| `scripts/form-parts.css` | 通知と待機表示の見た目 |

**立てっぱなしにならない。** 既定 30 分やりとりが無ければ自分で終了し、
ページが開いている間は心拍（`/health?ping=1`）で生き続ける。
`--ensure` は既に居れば使い回し、`--status` で動いているものを一覧できる。
ポートが埋まっていれば自動で次の空きへ上がる（移ったことは警告で知らせる）。

**ブラウザからサーバーを自動起動することはできない**（ページにプロセス起動の手段が
無く、そもそもページ自体をサーバーが配っている）。届かなかったときは、
そのまま打てる復帰コマンドを画面に出す。

**必要なもの**: Python 3 / `claude` コマンド（質問機能を使う場合）

### eli5

トピックを**大きな図と少ない言葉だけ**で説明する 1 枚の HTML を作る。

```bash
/eli5 <トピック>
```

外部依存なし。`file://` でそのまま開ける。

### commentable-html

ローカルで開く HTML に、**任意の要素にピンを刺してコメントできるレイヤー**を埋め込む。
書き出した JSON には打点先の要素だけでなく **生成元データの位置**（`data-src`）が入るので、
そのまま AI に渡せば「どこを直せばいいか」が座標ではなく**データの添字**で決まる。

```html
<style>/* assets/comment-layer.css をそのまま貼る */</style>
<script>window.CMT_DOC = { file:'report.html', dataSource:'tools/data.mjs' };</script>
<script>/* assets/comment-layer.js をそのまま貼る */</script>
```

外部依存ゼロ。`localStorage` に保存するのでサーバーは要らない。印刷時は UI が消える。
ピンは要素ボックス内の相対位置で持つため、**ウィンドウ幅を変えても追従する**。

### mac-disk-audit

Mac の容量を調べ、**「消して OK / 確認してから / クラウドへ / さわらない」**の 4 段階に仕分けして、
コメントできる HTML レポートにする。

```bash
scripts/scan.sh > scan.txt          # 読み取りのみ。削除も移動もしない
scripts/build-report.py data.json report.html
```

シミュレータの取り残し、重い `.git`、`node_modules`、キャッシュなどを 14 章に分けて洗い出す。
前回スキャンとの差分（「8GB 空きました」）も出る。

### codebase-audit-docs

未知のシステム（サーバ / スマホアプリ / API 定義 ＋ 稼働中の AWS）を**逆生成**して、
`docs/` 以下の検索できる HTML ドキュメント群にする。
障害分析・スロークエリ分析・Well-Architected レビュー・改善ガイド（スコア付き）まで。

**読み取れた事実には出典（`file:line`）を付け、読み取れないもの・推測は明示する**のが前提。
AWS は read-only・no-load でしか触らない。

### gh-reply-review

GitHub PR の**レビューコメント（特定のコード行に付いたもの）のスレッドに返信する**。

```bash
scripts/reply.sh <pr-number> <comment-id> <message>
```

`gh pr comment` は PR 全体への issue comment しか投げられない。
コード行に紐づくスレッドに返すには `in_reply_to` が要る、というのがこのスキルの理由。

### claude-design-live-spec

Claude Design の `.dc.html` 画面に、**採番チップ + 要素テーブル**の仕様書ページを足す。

特徴は注釈の描き方。スクリーンショットへのヒューリスティックな当てはめではなく、
**対象画面を iframe でライブ表示して実 DOM を `getBoundingClientRect()` で実測**する。
そのため対象画面のレイアウトが変わっても、仕様書ページを再生成せずに追従する。

対象プロジェクトに `tokens.css`（`--line` `--panel` `--ink-soft` など）が要る。

## ライセンス

MIT
