#!/usr/bin/env python3
"""mac-disk-audit / build-report.py

使い方:
    python3 build-report.py <data.json> <出力.html>

data.json を assets/report-template.html に流し込み、
commentable-html のコメントレイヤーを埋め込んだ単体HTMLを書き出す。
同じ出力パスに何度でも上書きしてよい（コメントは localStorage 保存なので消えない）。
"""
import json, sys
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
CMT = Path.home() / ".claude/skills/commentable-html/assets"

def main():
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    data_path, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    data = json.loads(data_path.read_text(encoding="utf-8"))

    tpl = (SKILL / "assets/report-template.html").read_text(encoding="utf-8")
    # 本文に "</script" が 1 つでもあると、そこで script ブロックが閉じてページが壊れる。
    # what / lead / note / footer は HTML を書いてよい仕様なので、実際に踏む。
    # JSON 文字列中の \/ は / と等価なので、これで意味は変わらない。
    data_js = json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")
    body = (tpl
            .replace("__TITLE__", data.get("meta", {}).get("title", "Macお片付けマップ"))
            .replace("__DATA__", data_js)
            .replace("__FILENAME__", out_path.name)
            .replace("__DATAFILE__", str(data_path)))

    parts = ['<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
             '<meta name="viewport" content="width=device-width,initial-scale=1">\n', body]
    css, js = CMT / "comment-layer.css", CMT / "comment-layer.js"
    if css.exists() and js.exists():
        parts += ["\n<style>\n", css.read_text(encoding="utf-8"), "\n</style>\n",
                  "\n<script>\n", js.read_text(encoding="utf-8"), "\n</script>\n"]
    else:
        print(f"warn: コメントレイヤーが見つかりません（{CMT}）。付けずに出力します。", file=sys.stderr)
    parts.append("</body>\n</html>\n")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("".join(parts), encoding="utf-8")
    print(f"=> {out_path}")

if __name__ == "__main__":
    main()
