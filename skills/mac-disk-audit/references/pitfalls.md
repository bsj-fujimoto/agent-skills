# 落とし穴（実際にハマったもの）

## 1. `du` はマウントを二重に数える

`/Library/Developer/CoreSimulator/Volumes/` や `Cryptex/` が 32GB に見えても、
その実体は `AssetsV2` の `.asset`（15.7GB）をマウントしたもの。**足すと合わない。**

- データボリューム全体を測るときは **必ず `du -sh -x`**（`-x` でマウント境界を越えない）
- シミュレータの実サイズは `xcrun simctl runtime list` の `Total Disk Images` と `.asset` の実測で見る
- レポートに「Volumes が32GBに見えるが実体は15.7GB」と注記を入れると、あとで自分が混乱しない

## 2. `simctl runtime delete` はアセットを置いていくことがある ★最重要

`simctl runtime list` は 2本（15.7GB）しか出さないのに、
`AssetsV2` には 7本ぶん（57GB）残っていた。**差の 41.8GB が取り残し。**

検出は `scan.sh` の 8章が自動でやる（`runtime list -v` の Image Path から使用中ハッシュを拾い、
ディスク上の `.asset` と突き合わせて ORPHAN/KEEP を出す）。

対処の順番:

1. **まず再起動して測り直す** — MobileAsset の GC が片付けることがある。タダで最も安全
2. 残っていたら ORPHAN のものだけ `sudo rm -rf`
3. **KEEP のハッシュは絶対に消さない。**レポートには KEEP 側も併記する

削除するなら、はじめから `xcrun simctl runtime delete <id>` を使う（`--keep-asset` は付けない）。
`--notUsedSinceDays N --dry-run` で「何が消えるか」を先に見せられる。

## 3. `sudo` しても `Operation not permitted`

`/Library/Developer/CoreSimulator` 配下などで出る。原因は SIP ではなく **TCC**
（ターミナルアプリのフルディスクアクセス不足）。IDE の統合ターミナルから叩くと出やすい。

確認したこと: `csrutil status` は enabled だが、当該ファイルに `restricted` フラグも
`com.apple.rootless` xattr も無く、書き込み可能な Data ボリューム上にあった → 残る原因は TCC。

- 対処: システム設定 → プライバシーとセキュリティ → フルディスクアクセス に
  ターミナル.app（または Cursor / VS Code）を追加 → **アプリを再起動** → 再実行
- そもそも `rm` ではなく `simctl runtime delete` を使えば起きない。
  **dyld キャッシュはランタイム削除で一緒に消えるので、手で消す必要がない**

## 4. Android は「イメージ単体」では消せない

`system-images/android-36` を消すと、それを指している AVD が起動しなくなる。
`~/.android/avd/*/config.ini` の `image.sysdir.1` が依存先。**消すなら AVD ごと。**

質問は1つに畳める:「Android エミュレータを使っていますか？ 使っていなければ両方まとめて不要です」

## 5. NDK は「入っている版」と「使う版」がずれる

インストール済みが 26.3 なのに、唯一 NDK を使うプロジェクトの `ndkVersion` は 28.2 だった
（＝入っている方は誰も使っていない）。判定に必要な材料は3つ:

- `ls ~/Library/Android/sdk/ndk/`
- `grep -rn ndkVersion` （`/build/` を除く）
- `find -name CMakeLists.txt -o -name Android.mk` の件数（0 ならネイティブビルド自体が無い）

## 6. クラウド同期のローカルコピーを見落とす

`~/Library/Mobile Documents/`（iCloud）と `~/Library/CloudStorage/`（Drive/Dropbox/OneDrive）は
`~/Library` の内訳に埋もれる。**削除ではなく「ダウンロードを削除」で済むのでノーリスク。**
見つけたら優先度を高く置く。

## 7. スキャン中も数字は動く

同じセッション中に空きが 41GB → 27GB → 35GB と動いた。バックグラウンドの再ビルドや
インデックス作成が走るため。**レポートには測定時刻を必ず書く。**

## 8. `find / -size +300M` は返ってこない

ホーム全体の巨大ファイル探索は 10 分でもタイムアウトした。
`~/Downloads` `~/Desktop` に絞る（実用上そこにしか無い）。
