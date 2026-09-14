# 判定カタログ

見つけた場所を4つの箱のどれに入れるか。**サイズではなく「作り直せるか」で決める。**

| 箱 | 基準 | 言い方 |
| --- | --- | --- |
| 🗑️ 消してOK | 消しても自動で作り直される。判断が要らない | 「次回だけ少し遅くなります」 |
| 🔍 見てから消す | 使っているかどうかで答えが変わる。確認は1問で済む形にする | 「◯◯を使っていますか？ 使っていなければ全部不要」 |
| ☁️ クラウドへ | 実データ。消したくない | 「上げてからローカルを空に」 |
| 🚫 さわらない | 壊れる・作り直せない・OS管理 | 「容量は食うが対象外」 |

## 🗑️ 消してOK（ほぼ常に）

| 場所 | 中身 | 戻し方 |
| --- | --- | --- |
| `~/Library/Developer/Xcode/DerivedData` | ビルド中間物 | 次のビルドで再生成 |
| `~/Library/Caches/*.ShipIt` | アプリ更新の残骸（VS Code / Cursor＝`com.todesktop.*`） | 不要 |
| `~/Library/Caches/Google/Chrome` | ページキャッシュ | 自動。ログイン状態は消えない |
| `~/Library/Caches/ms-playwright` | テスト用ブラウザ | テスト実行時に再取得 |
| `~/Library/Caches/org.swift.swiftpm` | Swift依存 | 再取得 |
| `~/.cache/puppeteer`, `~/.cache/chrome-devtools-mcp` | 自動操作用Chrome | 再取得 |
| `~/.cache/uv` | Python依存 | `uv cache clean` |
| `~/Library/pnpm/store` | pnpm倉庫 | `pnpm store prune`（未参照分だけ落ちる。全消しより先にこれ） |
| `~/.npm/_cacache` | npm倉庫 | `npm cache clean --force` |
| `~/.cache/codex-runtimes` | Codex実行環境 | 再取得 |
| `~/Library/Caches/Homebrew` | 古い瓶 | `brew cleanup` |

## 🔍 見てから消す（確認する一言を必ず添える）

| 場所 | 確認すること |
| --- | --- |
| シミュレータの取り残し `.asset` | **scan.sh 8章の ORPHAN 判定がそのまま答え。**→ `pitfalls.md` |
| `~/Library/Application Support/Claude/vm_bundles` | 「ローカルVM機能を使っていますか？」 |
| `~/Library/Application Support/Claude/local-agent-mode-sessions` | 「過去のセッションを見返しますか？」 |
| `~/.cache/whisper-models`, `~/.cache/huggingface` | 再DLできるが時間がかかる。回線と使用頻度を聞く |
| `~/.codex/sessions`, `~/.gemini`, `~/.claude` の履歴 | 「過去ログを検索しますか？」 |
| `~/.lmstudio/extensions` | 「LM Studio を使っていますか？」使っていなければアプリごと |
| 自動化ツールの作業用ワークスペース | `failed-*` は無条件で不要。本体はジョブ停止を確認してから |
| Android SDK | **AVD との依存を先に見る。**→ `pitfalls.md` |
| `~/Library/Android/sdk/ndk/*` | プロジェクトの `ndkVersion` 指定と突き合わせる。→ `pitfalls.md` |

## ☁️ クラウドへ

| 場所 | やり方 |
| --- | --- |
| `~/Library/Mobile Documents/*`, `~/Library/CloudStorage/*` | **消さない。**Finder で右クリック →「ダウンロードを削除」。クラウドには残る。ノーリスクなので優先度が高い |
| `~/Downloads`, `~/Desktop` の 200MB超 | GDrive へ上げてから削除。zip と動画がほぼすべて |
| `.git` が重いリポジトリ | **リモートにあるならクラウド退避は不要。ローカル削除で足りる**（必要なら clone し直す）。先に `git remote -v` を確認 |

## 🚫 さわらない

- `/Applications` — 使っていないアプリを**アンインストール**するのはOK。フォルダ直接削除はNG
- `/System/Volumes/Data/System/Library/AssetsV2/` の一般アセット（Siri・フォント・辞書・開発者ドキュメント）
- `/private/var/vm`（スワップ）, `/private/var/db`
- `~/Library/Keychains`
- 使用中のシミュレータランタイム
