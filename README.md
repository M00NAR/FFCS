# FFCS Planner

A local website for planning a clash-free VIT FFCS timetable.

## Start it

- **Windows:** double-click `start-windows.bat`
- **Mac / Linux:** `./start-mac-linux.sh` (or `python3 server.py`)

Your browser opens http://127.0.0.1:8000 by itself. If port 8000 is busy it
uses the next free one and prints the address. Press Ctrl+C in the window to stop.

Needs Python 3.9 or newer. Nothing to install, no internet needed.

## Host it online

The site is fully static: the solver runs in the browser, so any static host works.
Upload (or point the host at) the repo root. It needs `index.html`, `solver.js`
and `ffcs-planner/data/`.

**GitHub Pages:** repo **Settings → Pages → Build and deployment**, set Source to
*Deploy from a branch*, pick `main` and `/ (root)`, and save. The site appears at
`https://<your-username>.github.io/FFCS/` after a minute or two.

Opening `index.html` straight from disk (double-click) won't work, because browsers
block it from reading the data files. Use a launcher or a host.

## What's inside

| Path | What it is |
|---|---|
| `index.html` | the page |
| `solver.js` | the timetable solver, a browser port of `ffcs-planner/scripts/solve.py` |
| `server.py` | tiny local web server for the files above |
| `ffcs-planner/` | the Claude skill (catalog, teacher list, Python solver) — see its `SKILL.md` |
| `start-windows.bat`, `start-mac-linux.sh` | launchers |

If you change the solver, change `solve.py` and `solver.js` together. They are
meant to give identical results.

## Privacy

Everything runs in your browser: your picks never leave it and are saved in its
local storage. The local server listens on 127.0.0.1 only.

## Embedded courses

Theory and lab are separate codes in this catalog (`BACSE204` + `BACSE204P`).
Ticking a course on the site adds both automatically; untick "Lab section"
if you only need the theory half.
