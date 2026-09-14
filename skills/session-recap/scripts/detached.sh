#!/usr/bin/env bash
# このセッションを汚さずに、別プロセスでセッション要約HTMLを作らせる。
#
# 使い方:
#   detached.sh <セッションID | ログのパス> [出力先.html]
#
# なぜ要るか:
#   /session-recap を対話中に叩くと、HTMLを作るやり取り自体がそのセッションの
#   ログに残る。振り返る価値のある会話ほど、その汚れが惜しい。
#   別プロセスに投げれば、記録は向こう側のセッションに入る。
set -euo pipefail

TARGET="${1:-}"
OUT="${2:-}"
if [ -z "$TARGET" ]; then
  echo "使い方: detached.sh <セッションID | ログのパス> [出力先.html]" >&2
  exit 1
fi
[ -n "$OUT" ] || OUT="$(pwd)/session-recap-${TARGET##*/}.html"
OUT="${OUT%.html}.html"

# スキル本体の場所（このスクリプトの親）
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PROMPT="セッション ${TARGET} の会話を可視化した HTML を作ってください。

手順は ${SKILL_DIR}/SKILL.md に書いてあります。まずそれを読んでから始めてください。
出力先は ${OUT} です。

あなたは別プロセスとして呼ばれています。呼び出し元のセッションを汚さないため
に切り離されているので、対話の相手はいません。確認を求めずに最後まで進めて、
完了したら出力先のパスだけを1行で答えてください。"

# 使えるものを順に試す。どれも「その場限りの別セッション」として動く。
run() {
  if command -v claude >/dev/null 2>&1; then
    echo "claude -p で実行します（別セッションになります）" >&2
    claude -p "$PROMPT"
  elif command -v cursor-agent >/dev/null 2>&1; then
    echo "cursor-agent -p で実行します" >&2
    cursor-agent -p "$PROMPT"
  elif command -v codex >/dev/null 2>&1; then
    echo "codex exec で実行します" >&2
    codex exec "$PROMPT"
  else
    echo "非対話で動かせるエージェントが見つかりません。" >&2
    echo "claude / cursor-agent / codex のいずれかが要ります。" >&2
    exit 1
  fi
}

run
echo "---"
if [ -f "$OUT" ]; then
  echo "できました: $OUT"
else
  echo "出力が見つかりません: $OUT" >&2
  exit 1
fi
