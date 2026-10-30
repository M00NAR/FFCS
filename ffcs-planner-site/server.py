#!/usr/bin/env python3
"""Local website for the FFCS planner.

    python3 server.py              # opens http://127.0.0.1:8000
    python3 server.py --port 9000
    python3 server.py --no-browser

Uses the unchanged solver in ffcs-planner/scripts/solve.py. Listens on
127.0.0.1 only, so nothing outside this computer can reach it. No network
calls, no dependencies beyond Python 3.9+.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKILL = ROOT / "ffcs-planner"
INDEX = ROOT / "static" / "index.html"
MAX_BODY = 200_000

# Load the skill's solver as a module so the website runs exactly the same code
# as `python3 scripts/solve.py`.
_spec = importlib.util.spec_from_file_location("ffcs_solve", SKILL / "scripts" / "solve.py")
solver = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(solver)

SLOTS = solver.load_json(solver.DATA / "slots.json")
CATALOG = solver.load_json(solver.DATA / "catalog.json")
DATA_BLOB = json.dumps({"catalog": CATALOG, "slots": SLOTS}).encode("utf-8")


def run_request(request: dict) -> dict:
    """Same steps as solve.py's main(), minus printing and writing a file."""
    if not isinstance(request, dict) or not isinstance(request.get("requirements"), list):
        raise ValueError('request needs a "requirements" array')

    raw = request.get("constraints") or {}
    constraints = {
        "avoidDays": raw.get("avoidDays", []),
        "avoidWindows": raw.get("avoidWindows", []),
        "preferredFaculty": raw.get("preferredFaculty", []),
        "avoidedFaculty": raw.get("avoidedFaculty", []),
    }
    constraints["avoidWindows"] = [
        {"start": solver.to_minutes(w["start"]), "end": solver.to_minutes(w["end"])}
        for w in constraints["avoidWindows"]
    ]

    groups, unsolved = solver.build_groups(
        CATALOG, SLOTS, request["requirements"], constraints
    )
    result = solver.solve(groups, constraints, solver.DEFAULT_LIMIT, solver.DEFAULT_MAX_NODES)
    result["unsolved"] = unsolved
    return result


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
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            self._send(200, INDEX.read_bytes(), "text/html; charset=utf-8")
        elif path == "/api/data":
            self._send(200, DATA_BLOB, "application/json")
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] != "/api/solve":
            self._json(404, {"error": "not found"})
            return

        # Refuse cross-site posts from other pages open in the browser.
        origin = self.headers.get("Origin")
        if origin and origin.split("://", 1)[-1] != self.headers.get("Host", ""):
            self._json(403, {"error": "bad origin"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._json(413 if length > MAX_BODY else 400, {"error": "bad body size"})
            return

        try:
            request = json.loads(self.rfile.read(length).decode("utf-8"))
            result = run_request(request)
        except (ValueError, KeyError, TypeError, AttributeError) as error:
            self._json(400, {"error": f"bad request: {error}"})
            return

        self._json(200, {"result": result})

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
