"""Local QA only: unavailable storage/audio and a failed observation image.

Run from the repository root, then open http://localhost:5174/#journey.
The production web files are never modified. Stop with Ctrl+C.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

WEB = Path(__file__).resolve().parents[1]
COMPLETED_GAME = False
PAIRED_GAME = False
ALLOW_PREVIEWS = False


class FailureFixture(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ("/", "/index.html"):
            html = (WEB / "index.html").read_text(encoding="utf-8")
            fixture = """<script>
              Object.defineProperty(window, 'localStorage', { get() { throw new Error('QA storage unavailable'); } });
              window.AudioContext = undefined; window.webkitAudioContext = undefined;
            </script>"""
            if COMPLETED_GAME:
                # Deliberate checkpoint fixture: isolates finale/image-error UI from mission mechanics.
                fixture = """<script>
                  localStorage.setItem('fringe.delta-dispatch.v1', JSON.stringify({version:1,relay:true,found:true,
                    captures:['A','B'],gauge:true,delivered:true,seconds:180,sound:false,x:104,y:392}));
                  window.AudioContext = undefined; window.webkitAudioContext = undefined;
                </script>"""
            if PAIRED_GAME:
                # Deliberate mid-mission fixture: the next interaction completes date pairing.
                fixture = """<script>
                  localStorage.setItem('fringe.delta-dispatch.v1', JSON.stringify({version:1,relay:true,found:true,
                    captures:['A'],era:'B',gauge:false,delivered:false,seconds:100,sound:false,x:232,y:136}));
                  window.AudioContext = undefined; window.webkitAudioContext = undefined;
                </script>"""
            payload = html.replace("<head>", "<head>" + fixture, 1).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        elif not ALLOW_PREVIEWS and path.startswith("/data/nisar/") and path.endswith(".webp"):
            self.send_error(404, "Intentional QA preview failure")
        else:
            super().do_GET()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5174)
    parser.add_argument("--completed-game", action="store_true", help="Seed a completed game checkpoint instead of denying storage")
    parser.add_argument("--paired-game", action="store_true", help="Seed a mid-mission QA checkpoint for archive handoff")
    parser.add_argument("--allow-previews", action="store_true", help="Allow actual previews in an isolated checkpoint fixture")
    args = parser.parse_args()
    COMPLETED_GAME = args.completed_game
    PAIRED_GAME = args.paired_game
    ALLOW_PREVIEWS = args.allow_previews
    ThreadingHTTPServer(("127.0.0.1", args.port), partial(FailureFixture, directory=str(WEB))).serve_forever()
