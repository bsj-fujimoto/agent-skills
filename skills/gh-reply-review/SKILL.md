---
name: gh-reply-review
description: GitHub Pull Request のレビューコメント（特定のコード行に付いたコメント）のスレッドに返信する。「このレビューコメントに返信して」「指摘に返信して」「PR のコメントに返事を書いて」と言われたとき、コードレビューの指摘に対応したあと本人へ返答するときに使う。PR 全体への issue comment とはエンドポイントが違うので、gh pr comment では代用できない。
license: MIT
---

# gh-reply-review — レビューコメントのスレッドに返信する

特定のコード行に付いたレビューコメントへ、**スレッドとして**返信する。

```bash
~/.claude/skills/gh-reply-review/scripts/reply.sh <pr-number> <comment-id> <message>
```

カレントディレクトリが対象リポジトリであること（`gh repo view` で解決する）。

## なぜ専用が要るのか

GitHub のコメントは 2 種類あり、**エンドポイントが別**になっている。

| | 何に付くか | エンドポイント |
|---|---|---|
| Issue Comment | PR 全体 | `POST /repos/{owner}/{repo}/issues/{n}/comments` |
| **Review Comment** | **特定のファイル・行** | `POST /repos/{owner}/{repo}/pulls/{n}/comments` |

`gh pr comment` は前者しか投げられない。**後者のスレッドに返すには `in_reply_to` が要る**ので、このスクリプトがある。

## 使い方

### 1 行の返信

```bash
scripts/reply.sh 210 2796957507 'ご指摘ありがとうございます。修正しました。'
```

### 複数行の返信

```bash
scripts/reply.sh 210 2796957507 "$(cat <<'EOF'
ご指摘ありがとうございます。

修正内容:
- Integer 型に変更
- null で未設定を表現

コミット: ea5bf3be6
EOF
)"
```

ヒアドキュメントは `<<'EOF'`（クォート付き）にする。クォートを外すと
`$` や `` ` `` がシェルに展開され、コードブロックが壊れる。

## comment-id の見つけ方

**URL から。** コメントのリンクは
`https://github.com/owner/repo/pull/210#discussion_r2796957507` の形になる。
`discussion_r` の後ろの数字がそれ（この例では `2796957507`）。

**API から。**

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments | jq '.[] | {id, path, line, body}'
```

## 仕組み

1. `gh repo view` で owner / repo を解決する
2. `GET /pulls/comments/{comment_id}` で元コメントの `path` と `original_line` を取る
3. `git rev-parse HEAD` で最新コミットを取る
4. `POST /pulls/{pr}/comments` に `in_reply_to` を付けて投げる

返信先を決めているのは **`in_reply_to`**。`path` と `line` は元コメントに揃えるが、
**`commit_id` だけは元コメントではなく `git rev-parse HEAD`**（＝いまのブランチの先頭）を送る。
下の 422 はこれが原因で起きる。

より堅い経路として、PR 番号入りの専用エンドポイントがある。

```
POST /repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies
```

こちらは `body` だけで済み、`commit_id` を送らないので **422 が構造的に起きない**。
未検証なので置き換えていないが、422 に繰り返し当たるなら乗り換える価値がある。
（「詰まったとき」にある 404 は `/pulls/comments/{id}/replies` — **PR 番号の無い別物**で、これは叩かない。）

## 詰まったとき

| 症状 | 原因と対処 |
|---|---|
| `Not Found (HTTP 404)` | `/pulls/comments/{id}/replies` を直接叩いていないか。このスクリプトの `in_reply_to` 方式を使う |
| `Validation Failed (HTTP 422) — commit_id is not part of the pull request` | `HEAD` が PR に含まれていない。`git push` してから、正しいブランチにいるか確認する |
| `command not found: jq` | `brew install jq` |

## 必要なもの

`gh`（認証済み）／`jq`／`git`。カレントディレクトリが対象リポジトリの作業ツリーであること。

## 参考

- [REST API endpoints for pull request review comments](https://docs.github.com/en/rest/pulls/comments)
- [gh api](https://cli.github.com/manual/gh_api)
