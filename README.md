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

**対応エージェント**: `npx skills` が対応する全エージェント（Cursor / Codex / Gemini CLI /
Copilot など）にインストールできるが、**ログの読み取りは Claude Code の形式**
（`~/.claude/projects/*/<id>.jsonl`）**を前提**にしている。
他エージェントで使う場合は、同じ「1行1JSON」形式のログのパスを直接渡す。
段階分け・要約・HTML生成はエージェントに依存しない。

## ライセンス

MIT
