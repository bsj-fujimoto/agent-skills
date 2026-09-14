---
name: commentable-html
description: ローカルで開くHTML（資料・図・レポート・仕様書・ダッシュボード・デモ画面など）を作るとき、任意の要素にピンを刺してコメントでき、コメントをJSONで書き出せるレビュー用レイヤーを埋め込む。書き出したJSONには打点先の要素・生成元データの位置・座標が入るので、そのままAIに渡せば修正箇所が特定できる。「HTMLを作って」「HTMLにして」「資料にして」「図にして」「レポートにまとめて」等でHTMLファイルを新規作成・再生成するときは既定で適用する。Artifactとして公開する場合や、外部に配る本番ページには付けない。
license: MIT
metadata:
  version: "1.0"
---

# コメントできるHTMLを作る

ローカルで開くHTMLを作るときは、**既定でコメントレイヤーを埋め込む**。
レビューした人がその場でピンを刺し、JSONで書き出して渡してくれれば、
こちらは「どこを直せばいいか」を座標ではなく**要素と生成元の位置**として受け取れる。

## 1. 適用する / しない

**適用する**（既定）

- 手元で開いて見る資料・図・レポート・仕様書・分析結果
- 社内でレビューしてもらう画面のモック、デモ
- 何度か直しながら仕上げるもの全般

**適用しない**

- Artifact として公開するとき（Artifact 側にコメント機能がある）
- 外部に配る本番ページ、公開サイト、メールHTML
- 印刷専用・帳票など、UIを載せてはいけないもの
- ユーザーが「コメント機能は要らない」と言ったとき

迷ったら**付ける**。付いていても本文の見た目は変わらないし、印刷時は自動で消える。
既存のHTMLを編集するだけのときは、まだ入っていなければ足す。

## 2. 埋め込み方

`assets/` の2ファイルを**中身ごと** `<style>` と `<script>` に入れる。
外部参照にはしない（`file://` で開いたときに読めなくなる）。

```html
<!-- </head> の直前、またはページ自身のCSSの後 -->
<style>
/* ここに assets/comment-layer.css の中身をそのまま貼る */
</style>

<!-- </body> の直前 -->
<script>
window.CMT_DOC = {
  file: 'report.html',                 // このファイル名（コメントの保存キーになる）
  generator: 'tools/build-report.mjs', // このHTMLを組み立てているファイル（無ければ null）
  dataSource: 'tools/report-data.mjs', // 中身の元データを持つファイル（無ければ null）
};
</script>
<script>
/* ここに assets/comment-layer.js の中身をそのまま貼る */
</script>
```

ビルドスクリプトからHTMLを生成する場合は、読み込んで差し込む。

```js
const css = readFileSync(new URL('./assets/comment-layer.css', import.meta.url), 'utf8');
const js  = readFileSync(new URL('./assets/comment-layer.js',  import.meta.url), 'utf8');
const html = `...<style>${css}</style>...<script>${js}</script>`;
```

`window.CMT_DOC` は省略できる。省略するとファイル名だけが記録される。

## 3. 打点先を特定できるようにする（重要）

レイヤーは何も設定しなくても動くが、**その場合はCSSセレクタとページ座標しか残らない**。
次の属性を振っておくと、書き出したJSONから修正箇所が一意に決まる。

| 属性 | 意味 | 例 |
| --- | --- | --- |
| `data-src` | **生成元データの位置**。最も重要 | `sections[2].items[0]` |
| `data-src-file` | その位置が書かれているファイル（省略時は `CMT_DOC.dataSource`） | `tools/report-data.mjs` |
| `data-role` | 役割の名前 | `metric` / `step` / `row` |
| `data-label` | 表示文字列（検索の手がかり） | `月額 $1.96` |
| `data-section` | 区画の名前（見出しが無いときの補い） | `第3章 費用` |

指針。

- **データ配列からHTMLを組み立てているなら、必ず `data-src` を振る。**
  配列の添字をそのままパスにする（`rows[3]`、`chapters[1].items[2]`）。
  これがあると「JSONを見て該当行を直して再生成」が機械的にできる。
- テンプレートに直書きした部分にも、章・表・注記のような**まとまり単位**で振っておく
  （`page.lead`、`page.costTable`）。`data-src-file` にテンプレート側のファイルを指す。
- 表のセルのように印を持たない要素に打たれた場合は、囲んでいる `data-src` を
  相対位置つきで引き継ぐ（`page.costTable 行5 列2`）。個々のセルに振る必要はない。
- 何も振らなくても、見出し・段落・項目・セル・図などのタグ単位までは自動で遡る。

## 4. ユーザーに伝えること

生成したHTMLを渡すときは、操作を1〜2行添える。

- 右下の **コメント**（または `C` キー）で打点モードに入り、気になる場所をクリック
- 保存してもモードは続くので、続けて何か所でも打てる
- 吹き出しはヘッダを掴んで動かせる（対象が隠れるとき）
- ピンをドラッグすると付け先を変えられる
- 右下の **JSON** で書き出し → そのまま貼って渡してもらう

## 5. コメントJSONを受け取ったときの直し方

```jsonc
{
  "schema": "ui-comments/1",
  "document": { "file": "...", "generator": "...", "dataSource": "..." },
  "summary": { "total": 4, "open": 4, "resolved": 0, "orphaned": 0 },
  "comments": [{
    "number": 1,
    "body": "ここの単位が違う",
    "status": "open",
    "target": {
      "source": "rows[3]",                  // ← まずここ
      "sourceFile": "tools/report-data.mjs", // ← このファイルの
      "label": "月額 $1.96",                 // ← この文字列
      "role": "row",
      "selector": "[data-src=\"rows[3]\"]",
      "hint": "第3章 費用 / 行「月額 $1.96」"
    },
    "position": { "rx": 0.4, "ry": 0.5, "page": { "x": 543, "y": 669 } }
  }]
}
```

手順。

1. `target.sourceFile` を開き、`target.source` の位置を見る。`target.label` で検索しても着く。
2. `body` の指示に従って直す。
3. 生成し直す（ビルドスクリプトがあればそれを実行）。
4. 直した内容を、番号を添えて報告する（「#1 単位を千円に修正」）。

`source` が `null` のコメントは、印の無い場所に打たれている。
`selector` と `text` を手がかりにHTMLを直接見る。

`position` は**修正には使わない**。要素が見つからなくなったときにピンをおおよその位置に
出すための保険で、その件数は `summary.orphaned` に出る。

コメントに**質問**が含まれている場合は、直すのではなく答える。
質問が多いときは、資料の中にQ&Aを1枚足すことも検討する。

## 6. 仕様

- 外部依存なし。`file://` でそのまま動く
- 保存先は `localStorage`（キーは `ui-comments:<ファイル名>`）。サーバーは要らない
- ピンは要素ボックス内の相対位置で持つので、**ウィンドウ幅を変えても追従する**
- ライト／ダークの両方に対応（`prefers-color-scheme` と `[data-theme]` の両方を見る）
- 印刷時はUIが消える
- ページ側のCSSに依存しない（色はすべて `--c-*` として自前で持つ）
- ページ側と衝突しうる名前は `cmt-` 接頭辞と `#cmt-*` のID
