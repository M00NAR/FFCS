---
name: ffcs-planner
description: Use when planning or checking a VIT FFCS timetable — which faculty teach a slot, which slots a course runs, or generating a clash-free schedule from a JSON request. Ships a VIT Vellore catalog, a greppable teacher list, and a deterministic Python solver. No install, no API key.
---

# FFCS planner

A deterministic timetable engine plus the VIT Vellore catalog. You edit JSON; the solver places
courses. Never build a timetable by hand — the solver catches clashes you will miss.

## What is here

| Path | What it is |
|---|---|
| `data/catalog.json` | 23 course codes (14 subjects), 153 offerings, 54 faculty |
| `data/teachers.txt` | every offering, one line: `FACULTY \| CODE \| Title \| slots \| venue` |
| `data/slots.json` | slot code → day/start/end cells |
| `scripts/solve.py` | the solver — reads a request, prints the timetable |
| `scripts/find.py` | catalog queries |

Python 3.9+. No dependencies.

## Look things up first

```bash
python3 scripts/find.py "software"           # courses by code or title
python3 scripts/find.py --teacher anusha      # everything one teacher runs
python3 scripts/find.py --slot A1             # who teaches a slot
grep -i "anusha" data/teachers.txt            # raw list, if you prefer
```

Never invent a course code, slot or faculty name. Every code you use must come from
`find.py` or `teachers.txt`.

## Build a timetable

1. Find the codes you need (above).
2. Write `timetable.json` — copy `timetable.example.json`.
3. Run it:

   ```bash
   python3 scripts/solve.py timetable.json
   ```

4. Read the printed grid. Change the request, run again. Same input, same output.

## Request format

```json
{
  "requirements": [
    { "courseCode": "BACSE204" },
    { "courseCode": "BACSE319", "slots": ["A1", "TA1"] },
    { "courseCode": "BACSE205", "offeringId": "BACSE205~C1+TC1~JENIFA G~SJT715" }
  ],
  "constraints": {
    "avoidDays": [0],
    "avoidWindows": [{ "start": "08:00", "end": "09:00" }],
    "preferredFaculty": ["ANUSHA R"],
    "avoidedFaculty": ["SOMEONE ELSE"]
  }
}
```

| Field | Meaning |
|---|---|
| `courseCode` | Required. Must exist in the catalog. |
| `slots` | Optional. Require one slot pattern; the solver still picks the teacher. |
| `offeringId` | Optional. Pin one exact offering (id comes from the catalog / `teachers.txt` is not enough — use `find.py --teacher`). |
| `avoidDays` | 0 = Monday … 4 = Friday. Hard filter. |
| `avoidWindows` | `HH:MM` or minutes from midnight, applied to every day. Hard filter. |
| `preferredFaculty` | Soft bonus (+50 per course). |
| `avoidedFaculty` | Hard filter. |

## VIT conventions the solver applies

These are soft rules: they change the ranking, so a forced mixed timetable still comes back — just
with a lower score. Priority order is teacher, then halves, then exams, then buildings.

| Rule | Weight |
|---|---|
| Theory and lab of the same subject use the **same teacher** | +80 per pair |
| Theory and lab sit in **opposite halves** of the day | +30 per pair |
| Theory and lab land in the **same half** | −20 per pair |
| A week stays on one **exam side** (all A1/B1…, or all A2/B2…) | −18 per course on the minority side |
| Classes cluster in **one building** | −6 per extra building |
| Fewer days, smaller gaps, no early starts, no late finishes | see the score breakdown |

Why the exam side matters: FAT exams follow the slot family, so mixing A1 with A2 can put two exams
on the same day. Keep a week on one side when you can.

Why halves matter: the normal FFCS week is morning theory + afternoon labs, or the reverse. A
theory in the morning with its lab also in the morning is legal but usually means clashes elsewhere.

When the same teacher is impossible (the catalog has no shared offering), say so explicitly and show
which pair you used instead. Never silently swap the teacher.

## School codes are not guessable

Every course prints its schools. Check them before adding.

```bash
python3 scripts/find.py --school SCORE "cryptography"
```

`BACSE319` is **SCORE** only. `BACSE204` and `BACSE205` are shared SCOPE+SCORE. `BACSE109` has no
school data in this catalog. Never infer the school from the code prefix, and never tell a student
a code is theirs without checking.

## Courses the catalog does not have

If a student names a course or teacher that is genuinely missing, add it inline.
You must supply the slots yourself; they are checked against the grid.

```json
{
  "courseCode": "BITE410L",
  "custom": { "title": "Machine Learning", "faculty": "PROF X", "slots": ["B1", "TB1"] }
}
```

The solver treats it like any other course: it occupies those cells, clashes are detected and it is
ranked normally. It is not verified against the catalog, so say so when you report it. Get one
confirmation from the student before adding a manual entry.

## Rules the solver enforces

- **Theory hours are 50 minutes; labs are 2-hour blocks.** `L1+L2` runs 08:00–09:40 and clashes
  with a 09:00 theory hour. Never reason in slot letters alone.
- **Theory and lab periods are not aligned**, so overlap is checked on real intervals.
- **Embedded courses are split into two codes in this catalog.** VIT lists the theory (ETH) and lab
  (ELA) under one code; here the theory keeps the official code (`BACSE204`) and the lab gets a `P`
  suffix (`BACSE204P`, "Software Engineering Lab"). Always request **both** codes for an embedded
  course, or only half of it gets scheduled. Split courses: BAGER101, BAESP101, BACSE204, BACSE205,
  BACSE301, BACSE302, BACSE305, BACSE319, BACSE324. Tell the student the `P` code is the lab half of
  the official course, not a separate registration.
- **Course-code suffixes are unreliable.** `L` usually means theory, `P` lab, `E` embedded, but
  MTech codes (`CSI1007`) carry no suffix. Trust the slot codes.
- **`unscheduled` courses have no hours** (projects, Indian Constitution). They never clash.
- **Credits are unknown** in this catalog. Never invent a credit count.

## Output

The CLI prints one line per scheduled block, the score breakdown, and writes
`<name>.solved.json` with:

- `solutions` — up to 5 ranked arrangements, best first, each with the full score breakdown.
- `unsolved` — course codes that could not be placed.
- `conflicts` — forced overlaps when nothing fits.

Exit code is `1` when no arrangement exists.
