---
name: codebase-audit-docs
description: Reverse-engineer one or more codebases (server / mobile apps / API specs) AND their live cloud infrastructure into a single browsable, searchable HTML documentation site under docs/. Produces system/architecture/DB/API/batch/admin/app-screen specs, an AWS infra audit (readonly, no-load), architecture diagrams (via archify + official cloud icons), incident analysis, slow-query analysis, a Well-Architected review, and a tech-lead "what to fix in what order" improvement guide with a scored health dashboard. Use when asked to document/analyze an unfamiliar system, produce spec/design docs from code, audit AWS infra, or build an improvement roadmap/report for a client.
metadata:
  version: "1.0"
  author: bravesoft / fujimoto
license: MIT
---

# codebase-audit-docs — コード＋インフラを検索可能なHTML仕様書＋改善ガイドに逆生成する

未知のシステム(サーバ / スマホアプリ / API定義 + 稼働中のAWSインフラ)を、
**リバースエンジニアリングして `docs/` 以下の検索可能なHTMLドキュメント群**に落とし込み、
さらに **障害分析・スロークエリ分析・Well-Architectedレビュー・改善ガイド(スコアダッシュボード付き)** まで作るための手順とテンプレート集。

前提: 出力は「既存コード/実インフラからの逆生成」。**読み取れた事実には情報源(file:line)を付け、読み取れないもの・推測は明示**する。

## 使う場面
- 「このリポジトリ群を精査して仕様書/設計書を書いて」「システムを可視化して」
- 「AWSの構成を可視化して、設定レビューや最適化提案をして」
- 「障害履歴と付き合わせて根本原因と改善ロードマップを」
- 「顧客に出せる改善提案(優先順位付き)を」

## 併用スキル(あれば必ず使う)
- **archify**: 全ての図(構成/フロー/シーケンス/データフロー/ライフサイクル)。ASCIIアートで済ませない。
- **dataviz**: スコア/メーター/KPIダッシュボードの配色(状態カラーは値+ラベル必須、赤→橙→黄→緑の知覚順)。

---

## 全体ワークフロー(この順で進める)

### フェーズ0. 偵察(recon)
1. 対象ディレクトリ直下を `ls` し、各リポの種別(サーバFW/アプリ/OpenAPI等)と規模、git 履歴有無を掴む。
2. サーバは「エントリ→ルーティング→レイヤ構造(Controller/Service/Model等)→設定(DB/外部サービス/env)」の順で骨格を把握。
3. **並列 Explore エージェントに委譲**して広く速く集める(例: Android構造 / iOS構造 / DB定義 / API詳細 / 管理画面 / バッチ を各1エージェント)。
   - 各エージェントに「very thorough・網羅性最優先・file_path:line で情報源明記・Markdown表で構造化して返す」と指示。
   - 返ってきた要約は `scratchpad/findings/*.md` に保存してから執筆に使う(コンテキスト節約 & 消失防止)。

### フェーズ1. docsの骨格を作る
`references/doc-site.md` の手順に従い、`docs/` に共通土台を作る:
- `docs/assets/style.css`(このスキルの `assets/style.css` をコピー。ダッシュCSS込み)
- `docs/assets/site.js`(このスキルの `assets/site.js` を元に NAV を対象に合わせて編集)
- `docs/assets/search-index.js`(横断検索インデックス。ページ追加の度に追記)
- `docs/index.html`(トップ。カード目次 + 統計 + 「まず読む: 改善ガイド」導線)
- 各ページは `templates/page.html` を雛形にする。

**重要な規約**:
- 全ページ先頭に `<meta charset="UTF-8">`(http.server 等で文字化けを防ぐ)。
- リンクは**相対パス**。ルート直下ページ=`./`、サブディレクトリ=`../`。絶対 `/` は slug 配下ホスティングで壊れるので使わない。
- 図は archify 生成の自己完結HTMLを `docs/diagrams/` に置き `<iframe class="diagram">` で埋め込む。

### フェーズ2. コード側ドキュメント
対象に応じて作る(無い章は無理に作らない)。各章の中身は `references/doc-site.md` 参照:
- システム全体: 構成図 / アーキテクチャ / 外部連携図 / 依存ライブラリ / 環境依存情報
- サーバ: 概要・パッケージ / DB定義 / API一覧・詳細 / バッチ一覧 / 管理画面(機能・画面・遷移・詳細)
- アプリ(iOS/Android): 概要 / 画面一覧 / 画面遷移 / 画面詳細・イベント / 内部保持データ
- テスト/運用: 単体・結合テスト仕様 / ローカル環境構築 / オンボーディング(読み方・明文/暗黙ルール)
- 品質: セキュリティ検査レポート / コード欠陥レポート(ID採番 S*/D*/A* を付ける)

### フェーズ3. インフラ監査(AWSがある場合)
`references/aws-readonly-scan.md` の**安全な走査**(参照系のみ・DB無負荷)で棚卸し→分析。
成果物 `docs/infra/`: 概要 / ネットワーク / コンピュート / データ・配信 / コード↔クラウド対応 / メトリクス・限界点 / スロークエリ分析 / Well-Architectedレビュー / 理想状態と移行プラン。
- **コード↔クラウド対応**: コードの `.env`/依存(S3/RDS/Redis/SES/CloudFront等)が実インフラのどれかを突合する追跡表を作る。
- **限界点**: メトリクスから「これ以上の負荷を捌くには何がボトルネックか」を数値で示す。

### フェーズ4. 障害履歴との突合(あれば)
提供された障害記録(Slack等)を読み、`docs/infra/incident-analysis.html`(顧客説明用)を作る:
- 根本要因を5前後のテーマに構造化(各: 該当障害# / 調査での裏付け / 根本原因 / あるべき姿)。
- スロークエリlog等で**インシデント期間ごとの問題クエリ**を実照合(`references/aws-readonly-scan.md` のInsights節)。
- 改善効果を **①ユーザー ②サービス提供者(運営) ③保守ベンダー(自社)** の3視点で整理。

### フェーズ5. 改善ガイド(テックリード)＋スコアダッシュボード
`references/report-templates.md` に従い `docs/improvement-guide.html` を作る:
- 全ドキュメントの要改善点を**集約し「直す順序」**にする(単なる一覧にしない)。
- 順序の原則: ①止血(セキュリティ/信用/金銭)最優先 → ②「測れる化→効率化→増強」(高コストなインフラ増強を先にしない) → ③無停止/低リスクを先に。
- STEP 0..N + 優先度マトリクス + クイックスタート(最初の2週間TOP5)。各項目に元ページとID(S*/D*/#*)リンク。
- 冒頭に **観点別スコア + 総合スコアのダッシュボード**(`templates/scorecard.html` を雛形に。ページ内 `<style>` で自己完結させ、キャッシュ非依存に)。

### フェーズ6. 仕上げ・検証
- NAV(site.js) / index.html / search-index.js に全ページを登録。
- **必ず検証**: 全 href/src の実在チェック(相対解決)、charset有無、`../` の使い方、図iframeの参照先、`python3 -m http.server` で 200 応答とブラウザ表示。

---

## 品質の指針(テックリード視点)
- 事実と推測を分ける。推測は `.infer` ボックス、読めないものは「コードからは読み取れない」と明記。
- 情報源は `src/...:line` を `.src` リンクで。
- 「未使用の可能性」は静的参照/命名/注釈からの推定であり動的経路は追えない旨を添える。
- インフラ提案は「効率化(クエリ/索引)→実測→必要分だけ増強」を基本に、過剰増強を避ける。
- インデックス追加など大規模テーブルへのDDLは**無停止ではなく計画メンテ相当**(構築負荷/レプリカ遅延/メタデータロック)である注意を必ず添える。

## 参照ファイル
| ファイル | 内容 |
|---|---|
| `references/doc-site.md` | docsサイトの作り方・章立て・各ページの中身・検証手順 |
| `references/aws-readonly-scan.md` | AWS無負荷走査コマンド集(EC2〜CloudWatch/スロークエリInsights)と安全ルール |
| `references/report-templates.md` | 障害分析/レビュー/移行プラン/改善ガイド/スコア採点の型 |
| `assets/style.css` | 共通スタイル(表・バッジ・注記・カード・図枠・スコアダッシュ) |
| `assets/site.js` | サイドバー生成+全文検索+相対パス解決(NAVを編集して使う) |
| `assets/search-index.js` | 検索インデックスの雛形 |
| `templates/page.html` | 1ページの雛形 |
| `templates/scorecard.html` | 自己完結スコアダッシュボードの雛形 |
