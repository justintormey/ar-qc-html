// HUD scenes for the AR Builder app — pure DOM, parallel to scenes.js.
//
// Builder flow (six scenes):
//   Welcome → Instructions → Scanning → VerdictPass | VerdictFail → Complete
//
// After a PASS, "Next part" returns to Instructions (for the next part).
// After a FAIL, "Rework" returns to Instructions (for the SAME part) so the
// participant can re-read the steps before flipping + re-attaching.
//
// Scene contract — same as scenes.js — each function returns an object:
//   { el: HTMLElement, status: string, isScanning?: boolean }

// ─── Welcome ──────────────────────────────────────────────────────────
export function welcomeScene() {
  const el = mkScene();
  const panel = mk('div', 'panel title-only');
  panel.appendChild(mk('div', 'subheading', 'AR Assembly Trainer'));
  panel.appendChild(mk('h1', 'heading', 'Job 526526 — angle-bracket sub-assembly'));
  panel.appendChild(mk('p', '', 'Four 3D-printed angle brackets — A, B, C, D.'));
  panel.appendChild(mk('p', '', 'Three steps. Scan after each.'));
  panel.appendChild(mk('p', '', 'Orientation matters — flip if you fail.'));

  el.appendChild(panel);
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator'));
  return { el, status: 'Ready' };
}

// ─── Instructions ─────────────────────────────────────────────────────
// Shown after Welcome and after each verdict (PASS → next part, FAIL → rework).
// The participant reads these while physically assembling, then clicks SCAN
// (in-headset wheel-click, OR operator-controller SCAN button).
const STEP_CARDS = {
  A: {
    header: 'STEP 1 of 3 — ATTACH A + B',
    title:  'Form the T',
    steps: [
      'Pick up brackets A and B and the velcro tabs attached to each.',
      'Press A and B together face-to-face using the velcro tabs.',
      'Align the end channel flanges so they face AWAY from each other.',
      'The two pieces should form a T-shape.',
      'Hold the assembly up to the lens and scan.',
    ],
  },
  B: {
    header: 'STEP 2 of 3 — ATTACH C TO B',
    title:  'Tie C onto B',
    steps: [
      'Pick up bracket C and the supplied string.',
      'Tie C to bracket B using the string — secure but not over-tightened.',
      'Position C so its end channel flange points AWAY from the center of the assembly.',
      'Hold the assembly up to the lens and scan.',
    ],
  },
  C: {
    header: 'STEP 3 of 3 — ATTACH D',
    title:  'Mount D opposing C',
    steps: [
      'Pick up bracket D and use the velcro tabs already attached.',
      'Press D onto the assembly with its velcro tabs.',
      "Position D so its channel flange points AWAY from C's channel flange (opposing sides).",
      'Hold the assembly up so BOTH the B-face and C-face QRs are visible.',
      'Scan — pass requires BP and CP both in frame.',
    ],
  },
};

export function instructionsScene({ partLabel = 'A' } = {}) {
  const key = String(partLabel).trim().slice(-1).toUpperCase();
  const card = STEP_CARDS[key] || STEP_CARDS.A;
  const el = mkScene();
  const panel = mk('div', 'panel');
  panel.appendChild(mk('div', 'subheading', card.header));
  panel.appendChild(mk('h2', 'heading', card.title));
  const list = mk('ol', 'instructions-list');
  for (const s of card.steps) list.appendChild(mk('li', '', s));
  panel.appendChild(list);
  el.appendChild(panel);
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator — click SCAN when ready'));
  return { el, status: card.header };
}

// ─── Scanning ─────────────────────────────────────────────────────────
// Reuses the same minimal HUD as the QC app — corner brackets + cyan sweep.
export function scanningScene() {
  const el = mkScene();
  el.classList.add('scene-scanning');

  const frame = mk('div', 'cam-frame');
  ['tl', 'tr', 'bl', 'br'].forEach((c) => {
    frame.appendChild(mk('div', `cam-bracket cam-bracket-${c}`));
  });
  el.appendChild(frame);

  return { el, status: 'Scanning…', isScanning: true };
}

// ─── Verdict — PASS ────────────────────────────────────────────────────
const PASS_SPECS = {
  A: {
    stepLabel: 'STEP 1 — A + B',
    lines: [
      ['Velcro',   'both tabs engaged'],
      ['Flanges',  'aligned, facing outward'],
      ['Shape',    'T-form verified'],
    ],
    cue: 'Step 1 complete — assembly to spec.',
  },
  B: {
    stepLabel: 'STEP 2 — C ONTO B',
    lines: [
      ['String tie', 'secure'],
      ['Position',   'C joined to B'],
      ['Flange',     'away from center'],
    ],
    cue: 'Step 2 complete — assembly to spec.',
  },
  C: {
    stepLabel: 'STEP 3 — D',
    lines: [
      ['Velcro',   'tabs engaged'],
      ['Flange',   "opposite C's flange"],
      ['QR check', 'BP + CP both visible'],
    ],
    cue: 'Step 3 complete — full assembly to spec.',
  },
};

export function verdictPassScene({ part }) {
  const key = String(part).trim().slice(-1).toUpperCase();
  const spec = PASS_SPECS[key] || PASS_SPECS.A;
  const el = mkScene();
  el.appendChild(builderVerdictPanel({
    stepLabel: spec.stepLabel,
    lines: spec.lines,
    verdictText: 'PASS',
    verdictSymbol: '✓',
    verdictClass: 'pass',
  }));
  el.appendChild(mk('div', 'cue pass', spec.cue));
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator — next step'));
  return { el, status: `${spec.stepLabel} — PASS` };
}

// ─── Verdict — FAIL ────────────────────────────────────────────────────
// FAIL adds guidance + a Rework cue. Wearer drives Rework → Instructions in
// the actual state machine; on the HTML side the operator's controller fires
// the SCAN message to return to Scanning after the rework.
const FAIL_SPECS = {
  A: {
    stepLabel: 'STEP 1 — A + B',
    lines: [
      ['Velcro',   'engaged'],
      ['Flanges',  'facing inward — inverted'],
      ['Shape',    'T-form not detected'],
    ],
    recover: 'Peel the velcro. Flip B 180°. Re-attach so the flanges face AWAY from each other.',
  },
  B: {
    stepLabel: 'STEP 2 — C ONTO B',
    lines: [
      ['String tie', 'secure'],
      ['Position',   'C joined to B'],
      ['Flange',     'pointing into center — inverted'],
    ],
    recover: 'Untie the string. Flip C 180°. Re-tie so the flange points AWAY from the center.',
  },
  C: {
    stepLabel: 'STEP 3 — D',
    lines: [
      ['Velcro',   'engaged'],
      ['Flange',   "aligned with C's flange — inverted"],
      ['QR check', 'CF visible (D in wrong orientation)'],
    ],
    recover: "Peel the velcro. Flip D 180°. Re-attach so its flange opposes C's flange.",
  },
};

export function verdictFailScene({ part }) {
  const key = String(part).trim().slice(-1).toUpperCase();
  const spec = FAIL_SPECS[key] || FAIL_SPECS.A;
  const el = mkScene();
  el.appendChild(builderVerdictPanel({
    stepLabel: spec.stepLabel,
    lines: spec.lines,
    verdictText: 'FAIL',
    verdictSymbol: '✕',
    verdictClass: 'fail',
  }));
  el.appendChild(mk('div', 'cue fail', spec.recover));
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator — rework + re-scan'));
  return { el, status: `${spec.stepLabel} — FAIL` };
}

// ─── Completion ──────────────────────────────────────────────────────
export function completeScene({ counts = { pass: 0, fail: 0 }, elapsedMs = 0 }) {
  const el = mkScene();
  const m = Math.floor(elapsedMs / 60000);
  const s = Math.floor((elapsedMs % 60000) / 1000);
  const mm = String(m);
  const ss = String(s).padStart(2, '0');
  const attempts = counts.pass + counts.fail;
  const completed = counts.pass;

  const panel = mk('div', 'panel');
  panel.appendChild(mk('div', 'subheading', 'Session complete'));
  panel.appendChild(mk('h1', 'heading', `Job 526526 — ${completed} of 3 steps passed`));

  const grid = mk('div', 'stat-grid');
  grid.appendChild(stat('Passed',   String(counts.pass), 'pass'));
  grid.appendChild(stat('Failures', String(counts.fail), 'fail'));
  grid.appendChild(stat('Attempts', String(attempts),    'neutral'));
  panel.appendChild(grid);

  panel.appendChild(mk('div', 'cycle-time', `Total time   ${mm}:${ss}`));

  el.appendChild(panel);
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator'));
  return { el, status: 'Session complete' };
}

// ─── Helpers ─────────────────────────────────────────────────────────
function mkScene() {
  const d = document.createElement('div');
  d.className = 'scene';
  return d;
}

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function stat(label, value, cls) {
  const wrap = mk('div', `stat ${cls}`);
  wrap.appendChild(mk('div', 'label', label));
  wrap.appendChild(mk('div', 'value', value));
  return wrap;
}

function builderVerdictPanel({ stepLabel, lines, verdictText, verdictSymbol, verdictClass }) {
  const p = mk('div', 'panel');
  p.appendChild(mk('div', 'subheading', `${stepLabel} — JOB 526526`));
  const list = mk('ul');
  for (const [k, v] of lines) {
    const li = mk('li');
    li.appendChild(mk('span', '', k));
    li.appendChild(mk('span', 'v', v));
    list.appendChild(li);
  }
  p.appendChild(list);

  const verdict = mk('div', `verdict-row ${verdictClass}`);
  verdict.appendChild(mk('span', 'symbol', verdictSymbol));
  verdict.appendChild(mk('span', '', `VERDICT: ${verdictText}`));
  p.appendChild(verdict);

  return p;
}
