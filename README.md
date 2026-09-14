# agent-skills

Claude Code などのコーディングエージェント向けスキル集。

## インストール

```bash
npx skills add bsj-fujimoto/agent-skills
```

スキルを選んで入れる場合:

```bash
npx skills add bsj-fujimoto/agent-skills --skill session-recap
```

グローバル（ユーザー全体）に入れる場合は `-g` を付ける。

## 収録スキル

### session-recap

セッションの会話を「人間の指示 ↔ AIの応答」の時系列HTMLにまとめ、
冒頭に **どういう順序で何をどう進めたか** のワークフロー図を付ける。

長い作業ログを、あとから来た人が5分で追える1枚にするためのもの。
議事録ではなく「進め方の地図」を作る。

```
/session-recap              いまのセッション
/session-recap 80ee9307     ID指定（部分一致可）
```

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

**対応エージェント**: `npx skills` が対応する全エージェントにインストールできる。

ログの読み取りは**エージェント名ではなく中身の構造で判定する**ので、
形式が合えばそのまま動く。

| | 対応 |
|---|---|
| 1行1JSON（JSONL） | ✅ |
| 会話の配列を持つ単一JSON（`messages` / `history` / `turns` など） | ✅ |
| Markdown形式のログ（Aider など） | ❌ |
| SQLite | ❌ |

役割（`role` / `type`）・本文（`content` / `parts` / `text`）・入れ子
（`message` / `payload`）の書き方の違いは吸収する。詳しくは
[log-formats.md](skills/session-recap/references/log-formats.md)。

見つかるログの一覧:

```bash
python3 <スキルの場所>/scripts/extract.py --list
```

未知の形式に当たったときは、何レコードが対象外だったかを出して止まる。
`normalize()` にキー名を1つ足すだけで対応できることが多い。

## ライセンス

MIT
