#!/usr/bin/env python3
"""要約データ(JSON)をテンプレートに流し込んで、単一ファイルのHTMLを書き出す。

使い方:
    python3 build.py <recap.json> <出力先.html>

JSON の形は references/data-schema.md を参照。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "..", "assets", "template.html")

REQUIRED_TEXT = ("flowLead", "timelineLead", "insight", "footer")


def die(msg):
    sys.exit(f"エラー: {msg}")


def validate(d):
    for key in ("title", "eyebrow", "headline", "subhead", "stats", "phases", "turns", "text"):
        if key not in d:
            die(f"JSON に '{key}' がありません")

    for key in REQUIRED_TEXT:
        if key not in d["text"]:
            die(f"text に '{key}' がありません")

    if not d["phases"]:
        die("phases が空です")

    ids = [p["id"] for p in d["phases"]]
    if len(ids) != len(set(ids)):
        die(f"phases の id が重複しています: {ids}")

    for p in d["phases"]:
        for key in ("id", "name", "color", "when", "what", "detail"):
            if key not in p:
                die(f"phase {p.get('id','?')} に '{key}' がありません")

    known = set(ids)
    for t in d["turns"]:
        for key in ("n", "ts", "phase", "user", "ai"):
            if key not in t:
                die(f"turn {t.get('n','?')} に '{key}' がありません")
        if t["phase"] not in known:
            die(f"turn {t['n']} が未定義の phase '{t['phase']}' を指しています（定義済み: {sorted(known)}）")

    # どの段階にもターンが無いと、フィルタが空振りする
    used = {t["phase"] for t in d["turns"]}
    orphan = known - used
    if orphan:
        print(f"  注意: ターンが1件も無い段階があります: {sorted(orphan)}", file=sys.stderr)


def selfcheck(html, d):
    """書き出したHTMLが本当にブラウザで動くかを、その場で確かめる。

    要素はJSで組み立てるので、静的HTMLをgrepしても件数は数えられない。
    node があれば最小のDOMを立てて実際に描画させ、無ければ静的検査に落とす。
    """
    import re
    import shutil
    import subprocess
    import tempfile

    blocks = re.findall(r"<script>(.*?)</script>", html, re.S)
    if len(blocks) != 2:
        die(f"scriptブロックが2つではありません（{len(blocks)}個）。データ内の </script が疑わしい")

    if not shutil.which("node"):
        print("  注意: node が無いため描画の確認は省略しました", file=sys.stderr)
        return

    with tempfile.TemporaryDirectory() as tmp:
        paths = []
        for i, b in enumerate(blocks):
            fp = os.path.join(tmp, f"b{i}.js")
            open(fp, "w", encoding="utf-8").write(b)
            paths.append(fp)
            r = subprocess.run(["node", "--check", fp], capture_output=True, text=True)
            if r.returncode:
                die(f"JSの構文エラー:\n{r.stderr.strip()[:500]}")

        driver = os.path.join(tmp, "run.js")
        open(driver, "w", encoding="utf-8").write(r"""
const fs = require("fs");
const store = {};
function mk(id){ return { id, _h:"", hidden:false,
  set innerHTML(v){this._h=v}, get innerHTML(){return this._h},
  set textContent(v){this._h=v}, get textContent(){return this._h},
  addEventListener(){}, querySelectorAll(){return []} }; }
global.window = {};
global.document = { getElementById:(id)=>store[id]||(store[id]=mk(id)),
  querySelectorAll:()=>[], addEventListener(){} };
eval(fs.readFileSync(process.argv[2], "utf8"));
eval(fs.readFileSync(process.argv[3], "utf8"));
const count = (id, pat) => ((store[id]||{_h:""})._h.match(new RegExp(pat,"g"))||[]).length;
console.log(JSON.stringify({
  turns: count("tl", 'class="turn'),
  steps: count("flow", 'class="step"'),
  filters: count("filters", "fbtn"),
  leak: ((store["tl"]||{_h:""})._h).includes("</scr" + "ipt")
}));
""")
        r = subprocess.run(["node", driver] + paths, capture_output=True, text=True)
        if r.returncode:
            die(f"描画に失敗しました:\n{r.stderr.strip()[:500]}")
        got = json.loads(r.stdout)

    if got["turns"] != len(d["turns"]):
        die(f"ターンが{got['turns']}件しか描画されません（期待 {len(d['turns'])}件）")
    if got["steps"] != len(d["phases"]):
        die(f"段階が{got['steps']}件しか描画されません（期待 {len(d['phases'])}件）")
    if got["filters"] != len(d["phases"]) + 1:
        die(f"フィルタのボタン数が合いません（{got['filters']}）")
    if got["leak"]:
        die("本文の </script が生のまま出力されています")


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]

    d = json.load(open(src, encoding="utf-8"))
    validate(d)

    payload = {
        "stats": d["stats"],
        "phases": d["phases"],
        "loop": d.get("loop"),
        "turns": d["turns"],
        "text": d["text"],
    }
    data_js = "window.RECAP = " + json.dumps(payload, ensure_ascii=False) + ";"

    # 本文に "</script" が含まれると script ブロックがそこで終わってしまう。
    # JSON 文字列中では \/ が / と等価なので、これで安全に無害化できる。
    data_js = data_js.replace("</", "<\\/")

    html = open(TEMPLATE, encoding="utf-8").read()
    for token, value in (
        ("__TITLE__", d["title"]),
        ("__EYEBROW__", d["eyebrow"]),
        ("__HEADLINE__", d["headline"]),
        ("__SUBHEAD__", d["subhead"]),
    ):
        html = html.replace(token, value)
    html = html.replace("/* __DATA__ */", data_js)

    if "__" in html.split("<body>")[0].replace("__DATA__", ""):
        leftovers = [t for t in ("__TITLE__", "__EYEBROW__", "__HEADLINE__", "__SUBHEAD__") if t in html]
        if leftovers:
            die(f"テンプレートの置換漏れ: {leftovers}")

    open(out, "w", encoding="utf-8").write(html)
    selfcheck(html, d)

    print(f"{out} に書き出しました（{len(html):,} バイト）")
    print(f"  段階 {len(d['phases'])} / ターン {len(d['turns'])}")
    print("  自己チェック: OK（構文・データ復元・描画件数）")


if __name__ == "__main__":
    main()
