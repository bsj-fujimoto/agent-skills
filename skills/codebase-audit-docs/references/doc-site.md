# doc-site の作り方(章立て・各ページ・検証)

## セットアップ
```
docs/
  index.html                  # トップ(カード目次+統計+改善ガイド導線)
  improvement-guide.html      # 改善ガイド(ルート直下 = ./assets 参照)
  assets/{style.css, site.js, search-index.js}
  diagrams/*.html             # archify 生成の図(自己完結HTML)
  <章>/<page>.html            # 各章のページ(../assets 参照)
```
1. `assets/style.css` はこのスキルの `assets/style.css` をコピー。
2. `assets/site.js` はこのスキルの雛形をコピーし **NAV を対象に合わせて編集**。
3. `assets/search-index.js` は雛形をコピーし、ページ追加ごとに1行追記。
4. 各ページは `templates/page.html` を雛形に。**先頭 `<meta charset="UTF-8">` 必須**。
5. リンクは相対: ルート直下=`./assets` `./章/page.html`、サブ=`../assets` `../章/page.html`、図=`../diagrams/x.html`。絶対 `/` は使わない。

## 章立て(対象にあるものだけ作る)
### はじめに
- how-to-read(このドキュメントの成り立ち・限界・操作)/ legend(凡例: バッジ/推測/情報源/用語)
### システム全体
- overview(全体構成図)/ architecture(レイヤ・リクエストフロー・認証・ミドルウェア)
- external-integrations(外部SaaS連携)/ dependencies(FW/ミドル/ライブラリ)/ environments(環境別設定・env一覧・機密はキー名のみ)
### サーバ
- overview(パッケージ/レイヤ)/ database(テーブル・関連。DDLが無ければModel/バリデーションから復元し推測を明示)
- api-index(一覧: メソッド/パス/バージョン/認証)/ api-detail(入出力)/ api-external(webhook等)
- batch(CLIコマンド一覧: 用途/対象/副作用/本番orデバッグ)
- admin-index(機能・画面一覧)/ admin-flow(遷移図)/ admin-detail(代表画面の入力項目・イベント)
### アプリ(iOS/Android 各)
- overview / screens(全画面列挙) / flow(遷移図) / detail(画面別イベントと呼ぶAPI) / data(ローカル保持データ)
### テスト/運用
- test/unit・test/integration(現状の実態を正直に。無ければ「観点(推奨)」として)
- system/local-setup(Docker等の起動手順) / system/onboarding(読み方の流れ・明文/暗黙ルール・落とし穴)
### 品質/セキュリティ
- security/report(脆弱性。ID S1.. 深刻度・場所・影響・対策)/ security/defects(バグD*/未使用コード/技術的負債A*)

### AWSインフラ(フェーズ3。`aws-readonly-scan.md` 参照)
- overview / network / compute / data / integrations(コード↔クラウド) / metrics(限界点) / slow-query / review(Well-Architected) / roadmap / incident-analysis

## トップページ(index.html)の要素
- 統計(`stat-row`)、対象リポ表、章ごとの `card-grid`、冒頭に「まず読む: 改善ガイド」の目立つ導線(`danger` ボックスをアクセント色で)。

## 図(archify)
- 全ての図は archify スキルで生成し `docs/diagrams/` に置く。ASCIIで代用しない。
- 種別の使い分け: 構成=architecture / 手順・フロー=workflow / 呼び出し列=sequence / パイプライン=dataflow / 状態=lifecycle。
- レイアウト検証エラー(ラベル幅超過・重なり・col端超過)は JSON を直して再実行(レンダラは触らない)。日本語ラベルは短く、詳細は sublabel へ。
- クラウド構成は **公式アイコン**を使うと映える(archifyは非対応なので下記の自作SVG方式)。線は**直交(H/V)ルーティング**で交差最小に。

### クラウド公式アイコンを使った自作構成図(任意)
archify はアイコン非対応。アイコンを使いたい時は自己完結SVGを手書きする:
1. アイコンSVGを取得(例: `https://icon.icepanel.io/AWS/svg/<Category>/<Name>.svg`。命名は Amazon-/AWS- 接頭辞なし、例 `Compute/EC2.svg`, `Database/Aurora.svg`, `Networking-Content-Delivery/CloudFront.svg`)。`docs/assets/aws-icons/` に保存。
2. `docs/diagrams/xxx.html` に `<svg viewBox>` でノード(白角丸rect + `<image xlink:href="../assets/aws-icons/x.svg">` + ラベル)を配置。
3. 線は `<path d="M.. H.. V..">`(**H/V のみ = 直交**)+ arrowhead marker。グリッド配置で交差を最小化。

## 検証(仕上げ・必須)
```
# 相対リンクの実在チェック(各ページの ../ ./ href/src が実ファイルに解決するか)
# charset の有無
# python3 -m http.server で 200 応答 & ブラウザ表示(open)
```
- NAV(site.js)・index.html・search-index.js に全ページ登録済みか。
- `<meta charset>` が全ページ先頭にあるか(無いと配信時に文字化け)。
- `../` を使うのはサブディレクトリのページのみ。ルート直下は `./`。
- (slug配下ホスティングで `../` が壊れる環境なら)フラット化ビルド(全ファイル1階層・素のファイル名参照)を別途生成する。
