#!/bin/bash
# mac-disk-audit / scan.sh
# 読み取り専用。移動も削除もしない。sudo も使わない。
# 使い方: bash scan.sh [出力ファイル]
set -u
H="$HOME"
sec(){ echo; echo "===== $* ====="; }

run_scan(){

sec "0. ディスク全体"
df -h /System/Volumes/Data | tail -1
sw_vers 2>/dev/null | tr '\n' ' '; echo
echo "scanned_at: $(date '+%Y-%m-%d %H:%M')"

sec "1. ホーム直下（上位25）"
( cd "$H" && du -sh */ .[a-zA-Z]*/ 2>/dev/null | sort -rh | head -25 )

sec "2. データボリューム全体"
# -x は必須。付けないとマウント済みシミュレータ等を二重計上する
du -sh -x /System/Volumes/Data/* 2>/dev/null | sort -rh | head -10

sec "3. ~/Library 内訳"
du -sh "$H/Library/"*/ 2>/dev/null | sort -rh | head -12

sec "4. ~/Library/Application Support 内訳"
du -sh "$H/Library/Application Support/"*/ 2>/dev/null | sort -rh | head -12

sec "5. ~/Library/Caches 内訳"
du -sh "$H/Library/Caches/"*/ 2>/dev/null | sort -rh | head -15

sec "6. ~/.cache 内訳"
du -sh "$H/.cache/"*/ 2>/dev/null | sort -rh | head -15

sec "7. よくある置き場のピンポイント計測"
for p in .npm/_cacache .codex .gemini .claude .bun .volta .cursor .vscode .gradle .m2 .pub-cache \
         .lmstudio Library/pnpm/store Library/Developer/Xcode/DerivedData Library/Caches/Homebrew \
         "Library/Mobile Documents" .Trash Downloads Desktop Documents go; do
  s=$(du -sh "$H/$p" 2>/dev/null | cut -f1)
  [ -n "${s:-}" ] && printf "%-8s ~/%s\n" "$s" "$p"
done
du -sh /Applications /opt/homebrew /Library/Developer 2>/dev/null | sort -rh

sec "8. iOS/visionOS シミュレータ ★取り残し検出"
if command -v xcrun >/dev/null 2>&1; then
  echo "--- simctl が認識しているランタイム ---"
  xcrun simctl runtime list 2>/dev/null | grep -E "^(iOS|xrOS|watchOS|tvOS)|^Total"
  # 使用中の .asset ハッシュ（Image Path 行から拾う）
  inuse=$(xcrun simctl runtime list -v 2>/dev/null | grep -oE '[0-9a-f]{40}\.asset' | sort -u)
  echo
  echo "--- ディスク上の実体（.asset）---"
  for base in /System/Volumes/Data/System/Library/AssetsV2/com_apple_MobileAsset_*SimulatorRuntime; do
    [ -d "$base" ] || continue
    for d in "$base"/*.asset; do
      [ -d "$d" ] || continue
      n=$(basename "$d")
      sz=$(du -sh -x "$d" 2>/dev/null | cut -f1)
      if echo "$inuse" | grep -q "^$n$"; then mark="使用中 KEEP"; else mark="★取り残し ORPHAN"; fi
      printf "%-8s %-12s %s\n" "$sz" "$mark" "$(basename "$base" | sed 's/com_apple_MobileAsset_//')/$n"
    done
  done
  echo
  echo "注) /Library/Developer/CoreSimulator/Volumes と Cryptex は"
  echo "    上の .asset をマウントしたものなので du では二重に見える。実体は上の合計。"
  echo
  echo "--- dyld キャッシュ（ランタイム削除で一緒に消える）---"
  du -sh /Library/Developer/CoreSimulator/Caches/dyld/*/*/ 2>/dev/null | sort -rh
else
  echo "(xcrun なし / Xcode 未インストール)"
fi

sec "9. Android SDK ★AVD との依存を確認"
SDK="$H/Library/Android/sdk"
if [ -d "$SDK" ]; then
  echo "--- system-images ---"; du -sh "$SDK"/system-images/*/*/* 2>/dev/null | sort -rh
  echo "--- ndk ---";           du -sh "$SDK"/ndk/*/ 2>/dev/null | sort -rh
  echo "--- AVD が参照しているイメージ ---"
  for ini in "$H"/.android/avd/*/config.ini; do
    [ -f "$ini" ] || continue
    printf "%-8s %s -> %s\n" \
      "$(du -sh "$(dirname "$ini")" 2>/dev/null | cut -f1)" \
      "$(basename "$(dirname "$ini")")" \
      "$(grep -E '^image\.sysdir\.1' "$ini" | cut -d= -f2 | tr -d ' ')"
  done
  echo "--- プロジェクトが指定している ndkVersion（これ以外は未使用の可能性）---"
  grep -rhn --include="*.gradle" --include="*.kts" -E "ndkVersion" \
    "$H/Documents" "$H/Desktop" 2>/dev/null | grep -v "/build/" | head -10
  echo "--- ネイティブビルドの有無 ---"
  c=$(find "$H/Documents" -maxdepth 6 \( -name CMakeLists.txt -o -name Android.mk \) 2>/dev/null | wc -l | tr -d ' ')
  echo "CMakeLists.txt / Android.mk: ${c} 件"
else
  echo "(Android SDK なし)"
fi

sec "10. 大きいファイル（Downloads / Desktop / Documents 直下）"
find "$H/Downloads" "$H/Desktop" -type f -size +200M 2>/dev/null \
  -exec ls -lh {} \; | awk '{print $5"\t"$9}' | sort -rh | head -20

sec "11. .git が重いリポジトリ（200MB超）"
for d in $(find "$H/Documents" -maxdepth 5 -type d -name .git -prune 2>/dev/null); do
  m=$(du -sm "$d" 2>/dev/null | cut -f1)
  [ "${m:-0}" -gt 200 ] 2>/dev/null && printf "%5sMB %s\n" "$m" "${d%/.git}"
done | sort -rn | head -12

sec "12. クラウド同期のローカルコピー（消さずに“ダウンロードを削除”できる）"
du -sh "$H/Library/Mobile Documents/"*/ 2>/dev/null | sort -rh | head -6
du -sh "$H/Library/CloudStorage/"*/ 2>/dev/null | sort -rh | head -6

sec "13. その他"
tmutil listlocalsnapshots / 2>/dev/null | head -5
command -v brew >/dev/null 2>&1 && brew cleanup -n 2>/dev/null | tail -2

sec "スキャン完了（読み取りのみ。何も変更していません）"
}

if [ $# -ge 1 ]; then
  run_scan | tee "$1"
  echo "=> $1"
else
  run_scan
fi
