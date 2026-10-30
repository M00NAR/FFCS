// Deterministic FFCS timetable solver: a browser port of ffcs-planner/scripts/solve.py.
// Same weights, same search order, same output shape, so the site needs no server.
// Keep the two in step when changing either one.

(function (global) {
  'use strict';

  const WEIGHTS = {
    preferred: 50.0,
    gap: 0.15,
    day: 12.0,
    early: 0.25,
    late: 0.25,
    same_teacher: 80.0,
    split_day: 30.0,
    same_half: 20.0,
    side_conflict: 18.0,
    venue_spread: 6.0,
  };
  const LAB_SLOT = /^L\d+$/;
  const EARLY_CUTOFF = 9 * 60;
  const LATE_CUTOFF = 17 * 60;
  const DEFAULT_LIMIT = 5;
  const DEFAULT_MAX_NODES = 200000;
  const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

  const norm = (name) => String(name).trim().toLowerCase();
  const round3 = (x) => Math.round(x * 1000) / 1000 || 0;
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const cmpTuple = (a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = cmp(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  };

  function toMinutes(value) {
    if (typeof value === 'number') return Math.trunc(value);
    const [hours, minutes] = String(value).split(':');
    return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
  }

  function offeringCells(offering, slotCells) {
    const cells = [];
    for (const slot of offering.slots) {
      for (const cell of slotCells[slot] || []) cells.push([cell[0], Number(cell[1]), Number(cell[2])]);
    }
    return cells;
  }

  function isAllowed(entry, constraints) {
    const faculty = norm(entry.faculty);
    if (constraints.avoidedFaculty.some((name) => norm(name) === faculty)) return false;

    for (const [day, start, end] of entry.cells) {
      if (constraints.avoidDays.includes(DAY_ORDER.indexOf(day))) return false;
      for (const window of constraints.avoidWindows) {
        if (start < window.end && window.start < end) return false;
      }
    }
    return true;
  }

  function overlaps(a, b) {
    for (const [dayA, startA, endA] of a.cells) {
      for (const [dayB, startB, endB] of b.cells) {
        if (dayA === dayB && startA < endB && startB < endA) return true;
      }
    }
    return false;
  }

  function gapMinutes(entries) {
    const byDay = {};
    for (const entry of entries) {
      for (const [day, start, end] of entry.cells) (byDay[day] = byDay[day] || []).push([start, end]);
    }

    let gaps = 0;
    for (const blocks of Object.values(byDay)) {
      blocks.sort(cmpTuple);
      let cursor = blocks[0][1];
      for (const [start, end] of blocks.slice(1)) {
        if (start > cursor) gaps += start - cursor;
        cursor = Math.max(cursor, end);
      }
    }
    return gaps;
  }

  const baseCode = (code) => code.replace(/[LPE]$/, '');
  const isLabEntry = (entry) => entry.slots.length > 0 && entry.slots.every((slot) => LAB_SLOT.test(slot));

  function halfOf(entry) {
    if (!entry.cells.length) return 'mixed';
    if (entry.cells.every((cell) => cell[1] < 13 * 60)) return 'morning';
    if (entry.cells.every((cell) => cell[1] >= 13 * 60)) return 'afternoon';
    return 'mixed';
  }

  function sideOf(entry) {
    for (const slot of entry.slots) {
      if (/[12]$/.test(slot)) return slot.endsWith('1') ? '1' : '2';
    }
    return null;
  }

  function venuePrefix(venue) {
    const match = /^[A-Z]+/.exec(venue || '');
    return match ? match[0] : null;
  }

  function score(entries, constraints) {
    const preferred = new Set(constraints.preferredFaculty.map(norm));
    const days = new Set();
    let hits = 0;
    let early = 0;
    let late = 0;

    for (const entry of entries) {
      if (preferred.has(norm(entry.faculty))) hits += 1;
      for (const [day, start, end] of entry.cells) {
        days.add(day);
        if (start < EARLY_CUTOFF) early += EARLY_CUTOFF - start;
        if (end > LATE_CUTOFF) late += end - LATE_CUTOFF;
      }
    }

    const pairs = {};
    for (const entry of entries) {
      const bucket = (pairs[baseCode(entry.code)] = pairs[baseCode(entry.code)] || {});
      if (isLabEntry(entry)) bucket.lab = entry;
      else bucket.theory = entry;
    }

    let sameTeacher = 0;
    let splitDay = 0;
    for (const { theory, lab } of Object.values(pairs)) {
      if (!theory || !lab) continue;
      if (norm(theory.faculty) === norm(lab.faculty)) sameTeacher += WEIGHTS.same_teacher;

      const theoryHalf = halfOf(theory);
      const labHalf = halfOf(lab);
      if (theoryHalf !== 'mixed' && labHalf !== 'mixed') {
        splitDay += theoryHalf === labHalf ? -WEIGHTS.same_half : WEIGHTS.split_day;
      }
    }

    const sides = { 1: 0, 2: 0 };
    for (const entry of entries) {
      if (isLabEntry(entry)) continue;
      const side = sideOf(entry);
      if (side) sides[side] += 1;
    }
    const examSide = -Math.min(sides[1], sides[2]) * WEIGHTS.side_conflict;

    const venues = new Set(entries.map((entry) => venuePrefix(entry.venue)));
    venues.delete(null);
    const venue = -Math.max(0, venues.size - 1) * WEIGHTS.venue_spread;

    const parts = {
      preferredFaculty: round3(hits * WEIGHTS.preferred),
      gaps: round3(-gapMinutes(entries) * WEIGHTS.gap),
      days: round3(-days.size * WEIGHTS.day),
      earliness: round3(-early * WEIGHTS.early),
      lateness: round3(-late * WEIGHTS.late),
      sameTeacher: round3(sameTeacher),
      splitDay: round3(splitDay),
      examSide: round3(examSide),
      venue: round3(venue),
    };
    const total = round3(Object.values(parts).reduce((a, b) => a + b, 0));
    return { entries, score: total, parts };
  }

  const signature = (entry) =>
    [...entry.cells].sort(cmpTuple).map(([day, start, end]) => `${day}:${start}-${end}`).join(',');

  function buildGroups(catalog, slotCells, requirements, constraints) {
    const byCode = {};
    for (const course of catalog.courses) byCode[course.code] = course;
    const preferred = new Set(constraints.preferredFaculty.map(norm));
    const seen = new Set();
    const groups = [];
    const unsolved = [];

    for (const requirement of requirements) {
      const code = requirement.courseCode;
      if (seen.has(code)) continue;
      seen.add(code);

      // Manual entry: the course is not in the catalog, the user supplied it.
      const custom = requirement.custom;
      if (custom) {
        const slots = (custom.slots || []).filter((slot) => slot && slot.trim()).map((slot) => slot.trim().toUpperCase());
        const cells = slots.flatMap((slot) => (slotCells[slot] || []).map((cell) => [...cell]));
        if (!slots.length || !cells.length) {
          unsolved.push(code);
          continue;
        }

        const entry = {
          id: `custom~${code}~${slots.join('+')}~${custom.faculty ?? 'MANUAL'}`,
          code,
          title: custom.title || code,
          kind: slots.every((slot) => LAB_SLOT.test(slot)) ? 'lab' : 'theory',
          faculty: custom.faculty || 'MANUAL',
          venue: null,
          slots,
          cells,
          credits: null,
        };
        if (isAllowed(entry, constraints)) groups.push({ courseCode: code, candidates: [entry] });
        else unsolved.push(code);
        continue;
      }

      const course = byCode[code];
      if (!course) {
        unsolved.push(code);
        continue;
      }

      const pinned = requirement.offeringId;
      const wantedSlots = requirement.slots;

      const candidates = [];
      for (const offering of course.offerings) {
        if (pinned && offering.id !== pinned) continue;
        if (wantedSlots && wantedSlots.length && offering.slots.join('+').toUpperCase() !== wantedSlots.join('+').toUpperCase()) continue;

        const entry = {
          id: offering.id,
          code: course.code,
          title: course.title,
          kind: course.kind,
          faculty: offering.faculty,
          venue: offering.venue,
          slots: offering.slots,
          cells: offeringCells(offering, slotCells),
          credits: course.credits ?? null,
        };
        if (isAllowed(entry, constraints)) candidates.push(entry);
      }

      const bestPerSignature = {};
      for (const entry of candidates) {
        const key = signature(entry);
        const current = bestPerSignature[key];
        const rank = preferred.has(norm(entry.faculty)) ? 1 : 0;
        const currentRank = current && preferred.has(norm(current.faculty)) ? 1 : 0;
        if (!current || rank > currentRank) bestPerSignature[key] = entry;
      }

      const ordered = Object.keys(bestPerSignature).sort(cmp).map((key) => bestPerSignature[key]);
      if (!ordered.length) unsolved.push(code);
      else groups.push({ courseCode: code, candidates: ordered });
    }

    groups.sort((a, b) => a.candidates.length - b.candidates.length || cmp(a.courseCode, b.courseCode));
    return { groups, unsolved };
  }

  function solve(groups, constraints, limit, maxNodes) {
    let solutions = [];
    const seen = new Set();
    let nodes = 0;

    const keyOf = (solution) => solution.entries.map((entry) => entry.id).sort(cmp).join('|');

    function keep(solution) {
      const key = keyOf(solution);
      if (seen.has(key)) return;
      seen.add(key);
      solutions.push(solution);
      solutions.sort((a, b) => b.score - a.score || cmp(keyOf(a), keyOf(b)));
      if (solutions.length > limit) seen.delete(keyOf(solutions.pop()));
    }

    function visit(index, placed) {
      nodes += 1;
      if (nodes > maxNodes) return;

      if (index === groups.length) {
        keep(score([...placed], constraints));
        return;
      }

      for (const candidate of groups[index].candidates) {
        if (placed.some((entry) => overlaps(entry, candidate))) continue;
        placed.push(candidate);
        visit(index + 1, placed);
        placed.pop();
      }
    }

    visit(0, []);
    if (!groups.length) solutions = [];

    const conflicts = [];
    if (!solutions.length && groups.length) {
      const forced = groups.map((group) => group.candidates[0]);
      forced.forEach((left, i) => {
        for (const right of forced.slice(i + 1)) {
          for (const [dayA, startA, endA] of left.cells) {
            for (const [dayB, startB, endB] of right.cells) {
              if (dayA === dayB && startA < endB && startB < endA) {
                conflicts.push({ a: left.id, b: right.id, day: dayA, start: Math.max(startA, startB), end: Math.min(endA, endB) });
              }
            }
          }
        }
      });
    }

    return { solutions, unsolved: [], conflicts, nodes };
  }

  // Same steps as server.py's run_request / solve.py's main(), minus file output.
  function runRequest(catalog, slotCells, request) {
    if (!request || typeof request !== 'object' || !Array.isArray(request.requirements)) {
      throw new Error('request needs a "requirements" array');
    }
    const raw = request.constraints || {};
    const constraints = {
      avoidDays: raw.avoidDays || [],
      avoidWindows: (raw.avoidWindows || []).map((w) => ({ start: toMinutes(w.start), end: toMinutes(w.end) })),
      preferredFaculty: raw.preferredFaculty || [],
      avoidedFaculty: raw.avoidedFaculty || [],
    };
    const { groups, unsolved } = buildGroups(catalog, slotCells, request.requirements, constraints);
    const result = solve(groups, constraints, DEFAULT_LIMIT, DEFAULT_MAX_NODES);
    result.unsolved = unsolved;
    return result;
  }

  const api = { runRequest, buildGroups, solve, score, toMinutes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FFCSSolver = api;
})(typeof window !== 'undefined' ? window : globalThis);
