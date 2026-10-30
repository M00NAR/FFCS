# FFCS Planner

A local website for planning a clash-free VIT FFCS timetable.

## Start it

- **Windows:** double-click `start-windows.bat`
- **Mac / Linux:** `./start-mac-linux.sh` (or `python3 server.py`)

Your browser opens http://127.0.0.1:8000 by itself. If port 8000 is busy it
uses the next free one and prints the address. Press Ctrl+C in the window to stop.

Needs Python 3.9 or newer. Nothing to install, no internet needed.

## What's inside

| Path | What it is |
|---|---|
| `server.py` | tiny web server; runs `ffcs-planner/scripts/solve.py` unchanged |
| `static/index.html` | the page |
| `ffcs-planner/` | the Claude skill (catalog, teacher list, solver) — see its `SKILL.md` |
| `start-windows.bat`, `start-mac-linux.sh` | launchers |

## Privacy

The server listens on 127.0.0.1 only, so other devices on your Wi-Fi can't
open it. Your picks are saved in your browser's local storage on this computer.

## Embedded courses

Theory and lab are separate codes in this catalog (`BACSE204` + `BACSE204P`).
Ticking a course on the site adds both automatically; untick "Lab section"
if you only need the theory half.
