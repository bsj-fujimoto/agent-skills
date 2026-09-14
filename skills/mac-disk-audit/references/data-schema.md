# report-data.json の形

`build-report.py` に渡す JSON。**レポートと同じ場所に置いて残す**
（`~/Desktop/mac-disk-cleanup.data.json`）。次回の差分に使う。

```jsonc
{
  "meta": {
    "title": "Macお片付けマップ",          // <title> と h1
    "badge": "MacBook / 2026-09-10 再スキャン（2回目）",
    "lead": "前回 41GB しか空いていませんでした。いまは <b>124GB</b>。", // HTML可
    "totalGB": 460,
    "usedGB": 315,
    "freeGB": 124,
    "prevUsedGB": 398,   // 省略可。あると「前回」バーが出る
    "prevFreeGB": 41     // 省略可。あると「◯GB 空きました 🎉」が出る
  },

  "doneTotal": "83GB",                    // 省略可
  "done": [                               // 省略可。前回から消えていたもの
    { "name": "Sebastian の作業場", "size": "41GB" }
  ],

  "highlight": {                          // 省略可。その回いちばんの発見
    "title": "消したはずのシミュレータが残っています",
    "lead": "ランタイムは消えたのに、中身だけ取り残されています。",
    "svg": "<svg viewBox=\"0 0 720 250\">…</svg>"   // 生SVG。大きく・字は少なく
  },

  "groups": [
    {
      "icon": "🗑️",
      "color": "green",                   // green | amber | blue | red
      "title": "1. まだ消せる",
      "total": "約15GB",                  // 見出し横に出る
      "headline": 15,                     // 省略可。トップの数字タイルに出る
      "headlineLabel": "まだ消せる",
      "lead": "残っているキャッシュ。判断はいりません。",
      "items": [
        {
          "name": "Chrome のキャッシュ",
          "size": "3.7GB",                // 表示用の文字列
          "gb": 3.7,                      // バーの長さ用の数値
          "what": "見たページの一時保存。<b>前回から手つかず。</b>",  // HTML可
          "path": "~/Library/Caches/Google/Chrome",
          "cmd": "rm -rf ~/Library/Caches/Google/Chrome/*"   // 省略可
        }
      ]
    }
  ],

  "stepsTitle": "つぎにやるなら、この順番",  // 省略可
  "steps": [
    { "title": "まず再起動して測り直す", "gain": "±0〜42GB",
      "detail": "OSが自動で片付けることがあります。タダで一番安全な一手。" }
  ],
  "note": "<b>sudo しても Operation not permitted が出たら。</b>…",  // 省略可
  "footer": "再スキャン 2026-09-10 ／ 測定は du / simctl の実測値。読み取りのみ。"
}
```

## 決まりごと

- `what` / `lead` / `note` / `footer` は **HTML が書ける**。`<b>` `<code>` を使ってよい
- `name` / `title` はエスケープされる。タグを入れない
- `cmd` はそのまま表示され、コピーボタンが付く。改行そのままでよい
- バーの長さは全項目の `gb` の最大値を 100% として自動計算される
- `groups` は4つでなくてもよい。空の箱は入れない
