#!/usr/bin/env python3
"""Local website for the FFCS planner.

    python3 server.py              # opens http://127.0.0.1:8000
    python3 server.py --port 9000
    python3 server.py --no-browser

Serves index.html, solver.js and the skill's data files: the same static files
you upload when hosting the site. The solver runs in the browser (solver.js, a
port of ffcs-planner/scripts/solve.py). Listens on 127.0.0.1 only. No
dependencies beyond Python 3.9+.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CATALOG = json.loads((ROOT / "ffcs-planner" / "data" / "catalog.json").read_text(encoding="utf-8"))

# Only these files are served; nothing else in the folder is reachable.
FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/solver.js": ("solver.js", "text/javascript; charset=utf-8"),
    "/ffcs-planner/data/catalog.json": ("ffcs-planner/data/catalog.json", "application/json"),
    "/ffcs-planner/data/slots.json": ("ffcs-planner/data/slots.json", "application/json"),
}


class Handler(BaseHTTPRequestHandler):
    server_version = "ffcs-local"
    sys_version = ""

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; "
            "frame-ancestors 'none'",
        )
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload) -> None:
        self._send(status, json.dumps(payload).encode("utf-8"), "application/json")

    def do_GET(self) -> None:  # noqa: N802
        target = FILES.get(self.path.split("?", 1)[0])
        if target is None:
            self._json(404, {"error": "not found"})
            return
        name, content_type = target
        self._send(200, (ROOT / name).read_bytes(), content_type)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("  %s %s\n" % (self.command, self.path))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the FFCS planner website locally")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    server = None
    for port in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if server is None:
        print(f"No free port between {args.port} and {args.port + 19}.", file=sys.stderr)
        return 1

    url = f"http://127.0.0.1:{server.server_address[1]}"
    stats = CATALOG.get("stats", {})
    print(f"FFCS planner running at {url}")
    print(f"  {stats.get('courses')} course codes, {stats.get('offerings')} sections")
    print("  Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
