# Mac で試すための簡易サーバー。gym_log フォルダで `python3 tools/serve.py` と実行する。
# python3 -m http.server と違い、ブラウザに「毎回最新か確かめる」よう伝えるので、
# ファイルを直したあとに古い画面と新しい処理が混ざって動くことがない。
import http.server

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

print('http://localhost:8000 で起動しました（止めるときは Ctrl+C）')
http.server.ThreadingHTTPServer(('localhost', 8000), Handler).serve_forever()
