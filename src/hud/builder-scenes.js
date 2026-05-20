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
  panel.appendChild(mk('h1', 'heading', 'Job 526526 — bracket sub-assembly'));
  panel.appendChild(mk('p', '', 'Three components to assemble.'));
  panel.appendChild(mk('p', '', 'Attach the sub-piece. Hold up for inspection.'));
  panel.appendChild(mk('p', '', 'Orientation matters — flip if you fail.'));

  el.appendChild(panel);
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator'));
  return { el, status: 'Ready' };
}

// ─── Instructions ─────────────────────────────────────────────────────
// Shown after Welcome and after each verdict (PASS → next part, FAIL → rework).
// The participant reads these while physically assembling, then clicks SCAN
// (in-headset wheel-click, OR operator-controller SCAN button).
export function instructionsScene({ partLabel = 'next part' } = {}) {
  const el = mkScene();
  const panel = mk('div', 'panel');
  panel.appendChild(mk('div', 'subheading', `ASSEMBLY — ${partLabel}`));
  panel.appendChild(mk('h2', 'heading', 'Steps'));
  const list = mk('ol', 'instructions-list');
  list.appendChild(mk('li', '', 'Pick up the sub-piece + 2 bolts.'));
  list.appendChild(mk('li', '', 'Align the sub-piece with the bolt pattern on the base.'));
  list.appendChild(mk('li', '', 'Orient it so the spec face points outward (the recessed corner = up).'));
  list.appendChild(mk('li', '', 'Install both bolts and finger-tighten.'));
  list.appendChild(mk('li', '', 'Hold the finished assembly up to the lens.'));
  panel.appendChild(list);
  el.appendChild(panel);
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator — click SCAN when ready'));
  return { el, status: 'Assembly — read steps, then SCAN' };
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
export function verdictPassScene({ part }) {
  const el = mkScene();
  el.appendChild(builderVerdictPanel({
    part,
    lines: [
      ['Bolts',          '2 of 2 installed'],
      ['Orientation',    'correct — spec face out'],
      ['Surface',        'clean'],
    ],
    verdictText: 'PASS',
    verdictSymbol: '✓',
    verdictClass: 'pass',
  }));
  el.appendChild(mk('div', 'cue pass', 'Component assembled to spec'));
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator — next part'));
  return { el, status: `Part ${part} — PASS` };
}

// ─── Verdict — FAIL ────────────────────────────────────────────────────
// FAIL adds guidance + a Rework cue. Wearer drives Rework → Instructions in
// the actual state machine; on the HTML side the operator's controller fires
// the SCAN message to return to Scanning after the rework.
export function verdictFailScene({ part }) {
  const el = mkScene();
  el.appendChild(builderVerdictPanel({
    part,
    lines: [
      ['Bolts',          '2 of 2 installed'],
      ['Orientation',    'inverted — spec face is inward'],
      ['Surface',        'clean'],
    ],
    verdictText: 'FAIL',
    verdictSymbol: '✕',
    verdictClass: 'fail',
  }));
  el.appendChild(mk('div', 'cue fail', 'Remove the two bolts. Flip the sub-piece 180°. Re-install.'));
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator — rework + re-scan'));
  return { el, status: `Part ${part} — FAIL` };
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
  panel.appendChild(mk('h1', 'heading', `Job 526526 — ${completed} ${completed === 1 ? 'component' : 'components'} passed`));

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

function builderVerdictPanel({ part, lines, verdictText, verdictSymbol, verdictClass }) {
  const p = mk('div', 'panel');
  p.appendChild(mk('div', 'subheading', `PART ${part} — JOB 5519`));
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
