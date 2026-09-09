#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os

ROOT = Path(__file__).resolve().parent
NOTES_PATH = ROOT / "notes.json"
PORT = int(os.environ.get("PORT", "8765"))
MAX_BYTES = 1_000_000

DEFAULT_NOTES = [
    {
        "id": "note-bed",
        "title": "Bed and mattress",
        "body": "Sleep setup first. Measure the bedroom before buying.",
        "column": "need",
        "importance": 5,
        "author": "Arthur",
    },
    {
        "id": "note-kitchen",
        "title": "Kitchen basics",
        "body": "Pots, plates, utensils, and something to boil water.",
        "column": "need",
        "importance": 4,
        "author": "Alice",
    },
    {
        "id": "note-plants",
        "title": "Plants",
        "body": "Nice once the light and watering routine are figured out.",
        "column": "nice",
        "importance": 2,
        "author": "Alice",
    },
]


def read_notes():
    if not NOTES_PATH.exists():
        write_notes(DEFAULT_NOTES)
    return json.loads(NOTES_PATH.read_text(encoding="utf-8"))


def write_notes(data):
    payload = json.dumps(data, indent=2) + "\n"
    tmp = NOTES_PATH.with_name("notes.json.tmp")
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(NOTES_PATH)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, status, payload):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/notes":
            try:
                self._json(200, read_notes())
            except (OSError, json.JSONDecodeError):
                self._json(500, {"error": "Could not read notes.json"})
            return
        return super().do_GET()

    def do_PUT(self):
        self._write_notes()

    def do_POST(self):
        self._write_notes()

    def _write_notes(self):
        path = self.path.split("?", 1)[0]
        if path not in ("/api/notes", "/notes.json"):
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        if length > MAX_BYTES:
            self._json(413, {"error": "Payload too large"})
            return

        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json(400, {"error": "Invalid JSON"})
            return

        if not isinstance(data, list) or any(not isinstance(item, dict) for item in data):
            self._json(400, {"error": "Notes must be a list of objects"})
            return

        try:
            write_notes(data)
        except OSError:
            self._json(500, {"error": "Could not write notes.json"})
            return

        self._json(200, data)


if __name__ == "__main__":
    if not NOTES_PATH.exists():
        write_notes(DEFAULT_NOTES)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Serving on http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")
