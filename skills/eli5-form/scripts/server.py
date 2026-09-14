#!/usr/bin/env python3
"""HTML から Claude に質問するための小さなローカルサーバー。

ブラウザの fetch から質問を受け取り、`claude -p --resume <session-id>
--fork-session` を実行して応答を返す。

--fork-session を付けるのは、元のセッションに書き込まずに文脈だけ引き継ぐため。
資料を作ったセッションの内容を把握したまま答えるが、本筋の作業ログは汚さない
（対話画面の /btw で脇道の質問をするのと同じ考え方）。

使い方:
    python3 scripts/askclaude/server.py [--port 8900] [--session <id>]

停止は Ctrl+C。localhost のみで待ち受ける。
"""
import argparse
import errno
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                      capture_output=True, text=True).stdout.strip() or os.getcwd()
SESSION_RE = re.compile(r"^[0-9a-f-]{36}$")
#: 保存先ファイル名。ページから渡された名前をそのまま使わない（パス遡上を防ぐ）
NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
MAX_LEN = 4000
MAX_SAVE = 12_000_000  # 凍結版 HTML + 回答 JSON の上限
TIMEOUT = 180
#: やりとりが無いまま放置されたら終了するまでの秒数（0 で無効）
IDLE_TIMEOUT = 30 * 60


def _mins(seconds):
    """秒を読める長さにする。1 分未満を「0 分」と書かないため。"""
    return f"{seconds // 60} 分" if seconds >= 60 else f"{int(seconds)} 秒"


class Handler(SimpleHTTPRequestHandler):
    """/ask と /health を処理し、それ以外は静的ファイルとして配信する。

    ページ配信と API を同じポートに載せるのは、dev container のポート転送を
    1つで済ませるため。別ポートだとブラウザ（ホスト側）から API に届かない。
    """

    default_session = None
    #: 最後にページから触られた時刻（アイドル終了の判定に使う）
    last_activity = time.monotonic()

    @classmethod
    def touch(cls):
        cls.last_activity = time.monotonic()

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == "/health":
            # 様子を見るだけでは生かさない（--status が寿命を延ばしてしまう）。
            # 生かすのはページが開いている印である心拍（?ping=1）だけ。
            if "ping=1" in self.path:
                self.touch()
            self._json(200, {
                "ok": True,
                "session": self.default_session,
                "dir": self.directory,
                "idle": round(time.monotonic() - Handler.last_activity, 1),
            })
            return
        self.touch()  # ページや資材の読み込みは「使っている」とみなす
        super().do_GET()

    #: 回答の保存先（--save-dir で指定。未指定なら保存を受け付けない）
    save_dir = None

    def _do_save(self):
        """フォームの回答を JSON ファイルとして保存する。

        localStorage はブラウザを消すと失われるので、決定事項を残すには
        ファイルに落とす必要がある。ページの「保存」ボタンから呼ばれる。
        """
        if not self.save_dir:
            self._json(400, {"error": "保存先が設定されていません（--save-dir）"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_SAVE:
                self._json(413, {"error": "データが大きすぎます"})
                return
            req = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            self._json(400, {"error": "invalid json"})
            return

        name = (req.get("name") or "").strip()
        # ページ由来の名前をそのままパスに使わない（.. や / を弾く）
        if not NAME_RE.match(name):
            self._json(400, {"error": "invalid name"})
            return
        data = req.get("data")
        html = req.get("html")
        if data is None and html is None:
            self._json(400, {"error": "data is empty"})
            return

        os.makedirs(self.save_dir, exist_ok=True)
        root = os.path.abspath(self.save_dir)
        written = []

        # HTML（読む用の凍結版）と JSON（機械可読）の両方を書く。
        # HTML だけだと集計に使えず、JSON だけだと論点の文脈が落ちるため。
        for ext, body in (("html", html), ("json", data)):
            if body is None:
                continue
            path = os.path.join(root, f"{name}.{ext}")
            # 保存先が save_dir の外へ出ていないことを最終確認する
            if os.path.dirname(os.path.abspath(path)) != root:
                self._json(400, {"error": "invalid path"})
                return
            try:
                with open(path, "w", encoding="utf-8") as f:
                    if ext == "json":
                        json.dump(body, f, ensure_ascii=False, indent=1)
                    else:
                        f.write(body)
            except OSError as e:
                self._json(500, {"error": f"保存に失敗しました: {e}"})
                return
            written.append(path)

        for w in written:
            sys.stderr.write("  [save] %s\n" % w)
        self._json(200, {"ok": True, "paths": written})

    def do_POST(self):
        self.touch()
        if self.path.rstrip("/") == "/save":
            self._do_save()
            return
        if self.path.rstrip("/") != "/ask":
            self._json(404, {"error": "not found"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            self._json(400, {"error": "invalid json"})
            return

        prompt = (req.get("prompt") or "").strip()
        session = (req.get("session") or self.default_session or "").strip()

        if not prompt:
            self._json(400, {"error": "prompt is empty"})
            return
        if len(prompt) > MAX_LEN:
            self._json(400, {"error": f"prompt too long (max {MAX_LEN})"})
            return
        # セッションIDは UUID 形式のみ通す（コマンド組み立てへの混入を防ぐ）
        if session and not SESSION_RE.match(session):
            self._json(400, {"error": "invalid session id"})
            return

        cmd = ["claude", "-p", prompt]
        if session:
            cmd += ["--resume", session]
            # 元のセッションに書き込まず、文脈だけ引き継ぐ
            if req.get("fork", True):
                cmd.append("--fork-session")

        try:
            # プロンプトは引数で渡す。シェルを介さないので展開されない
            r = subprocess.run(cmd, capture_output=True, text=True,
                               timeout=TIMEOUT, cwd=ROOT)
        except subprocess.TimeoutExpired:
            self._json(504, {"error": f"タイムアウトしました（{TIMEOUT}秒）"})
            return
        except FileNotFoundError:
            self._json(500, {"error": "claude コマンドが見つかりません"})
            return

        if r.returncode != 0:
            self._json(500, {"error": (r.stderr or "実行に失敗しました")[:800]})
            return

        self._json(200, {"answer": r.stdout.strip(), "session": session})

    def log_message(self, fmt, *args):
        # 静的ファイルのアクセスログは出さない（質問のやり取りだけ見せる）
        msg = fmt % args
        if "/ask" in msg or "/health" in msg or "/save" in msg:
            sys.stderr.write("  [ask] %s\n" % msg)


#: ポートが埋まっていたときに、上へ探しにいく数
PORT_TRIES = 20


def probe(port, timeout=0.3):
    """そのポートに居るのがこのスキルのサーバーかを `/health` で確かめる。

    別プロセスの状態を持たずに済ませるため、レジストリファイルは作らない。
    ファイルに書くと、異常終了したときに嘘の記録が残って厄介になる。
    毎回ポートを叩けば、生きているものだけが必ず見つかる。
    """
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=timeout) as r:
            d = json.load(r)
    except (urllib.error.URLError, OSError, ValueError):
        return None
    return d if isinstance(d, dict) and d.get("ok") else None


def find_running(session=None, start=8899, tries=PORT_TRIES):
    """動いているサーバーを探す。`session` を渡すとそのセッションのものだけ。

    戻り値は (ポート, /health の中身)。見つからなければ (None, None)。
    """
    for p in range(start, start + tries):
        d = probe(p)
        if d and (session is None or d.get("session") == session):
            return p, d
    return None, None


def watch_idle(srv, seconds):
    """やりとりが無いまま `seconds` 過ぎたら終了する見張り。

    セッションごとにサーバーを立てると、どれが生きているか分からないまま
    残り続ける。ページ側が心拍を送る（タブが開いている間は触られる）ので、
    **タブを閉じたら勝手に片付く**状態にする。
    """
    if seconds <= 0:
        return

    def run():
        while True:
            time.sleep(min(30, seconds))
            idle = time.monotonic() - Handler.last_activity
            if idle >= seconds:
                print(f"\n{_mins(int(idle))}やりとりが無いので終了します", flush=True)
                srv.shutdown()  # serve_forever が動いているのは別スレッド
                return

    threading.Thread(target=run, daemon=True).start()


def _listen(handler, port, tries=PORT_TRIES):
    """要求されたポートが埋まっていたら、次の空きへ順に上がる。

    `~/.claude` を共有した別のセッションが同じポートを掴んでいることがある
    （並行して開いた dev container 側のサーバーなど）。起動のたびに手で空きを
    探すのは面倒なので、自動でずらす。

    **ずらしたことは目立つ形で知らせる。** dev container でポート転送を
    設定している場合、黙って動くと転送先と合わずブラウザから届かなくなる。

    戻り値は (サーバー, 実際に使ったポート)。
    """
    last = None
    for p in range(port, port + tries):
        try:
            return ThreadingHTTPServer(("127.0.0.1", p), handler), p
        except OSError as e:
            if e.errno != errno.EADDRINUSE:
                raise
            last = e
    raise SystemExit(f"ポート {port}〜{port + tries - 1} がすべて使用中です: {last}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8899)
    ap.add_argument("--dir", default=ROOT,
                    help="静的配信のルート（既定: リポジトリのルート）")
    ap.add_argument("--session", default=os.environ.get("CLAUDE_SESSION_ID", ""))
    ap.add_argument("--save-dir", default=None,
                    help="回答の保存先ディレクトリ（指定しないと /save を受け付けない）")
    ap.add_argument("--idle-timeout", type=int, default=IDLE_TIMEOUT,
                    help=f"やりとりが無いまま放置されたら終了する秒数（既定 {IDLE_TIMEOUT}、0 で無効）")
    ap.add_argument("--ensure", action="store_true",
                    help="同じセッションのサーバーが既に居ればそれを使う（URL だけ出して終わる）")
    ap.add_argument("--status", action="store_true",
                    help="動いているサーバーを一覧して終わる")
    a = ap.parse_args()

    if a.status:
        found = False
        for port in range(a.port, a.port + PORT_TRIES):
            d = probe(port)
            if not d:
                continue
            found = True
            idle = d.get("idle")
            idle_s = f"最終操作から {_mins(int(idle))}" if isinstance(idle, (int, float)) else "不明"
            print(f"  :{port}  session={d.get('session') or '(なし)'}  {idle_s}")
            print(f"         配信ルート: {d.get('dir') or '不明'}")
        if not found:
            print("動いているサーバーはありません")
        return

    if a.ensure:
        port, d = find_running(a.session or None, a.port)
        if port:
            print(f"既に動いています: http://localhost:{port}/", flush=True)
            return

    Handler.default_session = a.session or None
    Handler.save_dir = os.path.abspath(a.save_dir) if a.save_dir else None
    handler = partial(Handler, directory=a.dir)
    srv, port = _listen(handler, a.port)
    # 起動案内は必ず flush する。nohup やログへのリダイレクトだと標準出力が
    # バッファされ、「どのポートで起動したか」が見えないまま待たされる
    banner = []
    if port != a.port:
        banner.append(f"⚠ ポート {a.port} は使用中でした。{port} で起動します")
        banner.append("  （dev container でポート転送を設定しているなら、転送先も変える）")
    banner.append(f"ページ配信と質問受付: http://localhost:{port}/")
    banner.append(f"  配信ルート: {a.dir}")
    if a.session:
        banner.append(f"  セッション: {a.session}")
    if Handler.save_dir:
        banner.append(f"  回答の保存先: {Handler.save_dir}")
    banner.append("  停止は Ctrl+C")
    if a.idle_timeout > 0:
        banner.append(f"  {_mins(a.idle_timeout)}やりとりが無ければ自動で終了します")
    print("\n".join(banner), flush=True)
    watch_idle(srv, a.idle_timeout)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました")
    finally:
        srv.server_close()


if __name__ == "__main__":
    main()
