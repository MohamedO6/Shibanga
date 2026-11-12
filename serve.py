"""Serve the Undula presentation with video seeking (HTTP Range) and the live app at /app/.

Run:  python serve.py            then open http://127.0.0.1:5190/
The live app is served from ../Undula (press L in the deck to open it).
"""
import http.server
import os
import re
import sys
import webbrowser
from functools import partial
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = (HERE.parent / "Undula").resolve()
PORT = int(os.environ.get("PORT", "5190"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean == "/app" or clean.startswith("/app/"):
            rel = clean[len("/app"):].lstrip("/")
            target = (APP / rel).resolve()
            if APP in target.parents or target == APP:
                return str(target)
            return str(APP / "__missing__")
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        if not rng or os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r"bytes=(\d*)-(\d*)", rng)
        size = os.path.getsize(path)
        if not m:
            return super().send_head()
        start = int(m.group(1)) if m.group(1) else max(size - int(m.group(2) or 0), 0)
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        if start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, "_remaining", None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            chunk = source.read(min(256 * 1024, remaining))
            if not chunk:
                break
            try:
                outputfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break
            remaining -= len(chunk)
        self._remaining = None

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(HERE)))
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Undula presentation: {url}  (live app: {url}app/)  Ctrl+C to stop")
    if "--no-open" not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
