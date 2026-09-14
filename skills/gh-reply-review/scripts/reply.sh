#!/bin/bash
# GitHub PR review comment のスレッドに返信する。
# Usage: scripts/reply.sh <pr-number> <comment-id> <message>
#
# 対象は「特定のコード行に付いたレビューコメント」。PR 全体へのコメント
# （issue comment）とは別物で、エンドポイントが違う。詳細は SKILL.md。

set -e

if [ "$#" -lt 3 ]; then
    echo "Usage: reply.sh <pr-number> <comment-id> <message>"
    echo ""
    echo "GitHub PR review commentのスレッドに返信します。"
    echo ""
    echo "Arguments:"
    echo "  pr-number   - プルリクエスト番号"
    echo "  comment-id  - 返信先のreview comment ID"
    echo "  message     - 返信メッセージ"
    echo ""
    echo "Example:"
    echo "  reply.sh 210 2796957507 'ご指摘ありがとうございます！修正しました。'"
    exit 1
fi

PR_NUMBER="$1"
COMMENT_ID="$2"
MESSAGE="$3"

# リポジトリ情報を取得
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
OWNER=$(echo "$REPO" | cut -d/ -f1)
REPO_NAME=$(echo "$REPO" | cut -d/ -f2)

echo "📝 Getting comment details..."

# 元のコメント情報を取得
COMMENT_DATA=$(gh api "repos/$OWNER/$REPO_NAME/pulls/comments/$COMMENT_ID")

# 必要な情報を抽出
ORIGINAL_PATH=$(echo "$COMMENT_DATA" | jq -r .path)
ORIGINAL_LINE=$(echo "$COMMENT_DATA" | jq -r .original_line)
ORIGINAL_COMMIT_ID=$(echo "$COMMENT_DATA" | jq -r .original_commit_id)

echo "📍 Comment location:"
echo "   Path: $ORIGINAL_PATH"
echo "   Line: $ORIGINAL_LINE"
echo "   Commit: ${ORIGINAL_COMMIT_ID:0:7}"

# 最新のコミットIDを取得
LATEST_COMMIT=$(git rev-parse HEAD)

echo ""
echo "💬 Posting reply..."

# スレッドに返信を投稿
RESPONSE=$(gh api -X POST "repos/$OWNER/$REPO_NAME/pulls/$PR_NUMBER/comments" \
  -f body="$MESSAGE" \
  -f commit_id="$LATEST_COMMIT" \
  -f path="$ORIGINAL_PATH" \
  -F line="$ORIGINAL_LINE" \
  -F in_reply_to="$COMMENT_ID")

# 返信のURLを取得
REPLY_URL=$(echo "$RESPONSE" | jq -r .html_url)

echo ""
echo "✅ Reply posted successfully!"
echo "🔗 $REPLY_URL"
