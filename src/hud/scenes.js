// HUD scenes — pure DOM. The flow is fully controller-driven (the Argo has
// no keyboard / mouse / clickable scroll wheel that reaches the browser),
// so scenes do NOT expose interactive buttons. State transitions arrive
// over the bus.
//
// Scene contract: each function returns an object
//   { el: HTMLElement, status: string, isScanning?: boolean }
// `isScanning` tells the orchestrator to enable the looping scan overlay.

import { renderLProfile } from './l-profile.js';

// ─── Welcome ──────────────────────────────────────────────────────────
export function welcomeScene() {
  const el = mkScene();
  const panel = mk('div', 'panel title-only');
  panel.appendChild(mk('div', 'subheading', 'QC Station 3'));
  panel.appendChild(mk('h1', 'heading', 'Job 471471 — 16-ga bracket inspection'));
  panel.appendChild(mk('p', '', 'Three parts in front of you.'));
  panel.appendChild(mk('p', '', 'Three verdicts: pass, rework, scrap.'));
  panel.appendChild(mk('p', '', 'The glasses do the analysis. You make the call.'));

  const hint = mk('div', 'scan-hint', 'Awaiting moderator');
  el.appendChild(panel);
  el.appendChild(hint);
  return { el, status: 'Ready' };
}

// ─── Scanning ─────────────────────────────────────────────────────────
// Minimal: corner brackets + the cyan scan line (set globally by the
// scan-overlay element). The Argo's see-through lenses show the real
// workpiece in the empty space between the brackets — no procedural
// fillers, no fake animations, no rotating analysis text.
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

// ─── Part A — PASS ────────────────────────────────────────────────────
export function partAScene() {
  const el = mkScene();
  el.appendChild(verdictPanel({
    part: 'A',
    lines: [
      ['Bend angle',  '90.0° ± 0.1°'],
      ['Surface',     'clean, no defects'],
      ['Dimensions',  'within tolerance'],
    ],
    verdictText: 'PASS',
    verdictSymbol: '✓',
    verdictClass: 'pass',
  }));
  el.appendChild(mk('div', 'cue pass', 'Place the part in the PASS zone'));
  return { el, status: 'Part A — PASS' };
}

// ─── Part B — REWORK + 3D L-profile ────────────────────────────────────
export function partBScene() {
  const el = mkScene();

  const split = mk('div', 'split');

  const left = verdictPanel({
    part: 'B',
    lines: [
      ['Bend angle',  '75.4°'],
      ['Target',      '90.0°'],
      ['Deviation',   '−14.6° underbend'],
      ['Surface',     'clean'],
    ],
    verdictText: 'REWORK',
    verdictSymbol: '⚠',
    verdictClass: 'rework',
  });
  split.appendChild(left);

  const ghost = mk('div', 'ghost-panel');
  ghost.appendChild(mk('div', 'label', 'TARGET PROFILE'));
  const canvas = mk('canvas');
  canvas.width = 320; canvas.height = 240;
  ghost.appendChild(canvas);
  ghost.appendChild(mk('div', 'delta', 'Δ −14.6°'));
  split.appendChild(ghost);

  el.appendChild(split);
  el.appendChild(mk('div', 'cue rework', 'Place the part in the REWORK zone'));

  // Wait one tick so the canvas is in the DOM before Three.js measures it
  queueMicrotask(() => renderLProfile(canvas));

  return { el, status: 'Part B — REWORK' };
}

// ─── Part C — SCRAP ────────────────────────────────────────────────────
export function partCScene() {
  const el = mkScene();
  el.appendChild(verdictPanel({
    part: 'C',
    lines: [
      ['Bend angle',         '88.2° (in tolerance)'],
      ['Surface',            '4 defects detected'],
      ['Stress fracture',    'risk: HIGH'],
    ],
    verdictText: 'SCRAP',
    verdictSymbol: '✕',
    verdictClass: 'scrap',
  }));
  el.appendChild(mk('div', 'cue scrap', 'Place the part in the SCRAP zone'));
  return { el, status: 'Part C — SCRAP' };
}

// ─── Completion ──────────────────────────────────────────────────────
export function completeScene({ counts = { A: 0, B: 0, C: 0 }, elapsedMs = 0 }) {
  const el = mkScene();
  const m = Math.floor(elapsedMs / 60000);
  const s = Math.floor((elapsedMs % 60000) / 1000);
  const mm = String(m);
  const ss = String(s).padStart(2, '0');
  const total = counts.A + counts.B + counts.C;

  const panel = mk('div', 'panel');
  panel.appendChild(mk('div', 'subheading', 'Inspection complete'));
  panel.appendChild(mk('h1', 'heading', `Job 471471 — ${total} ${total === 1 ? 'part' : 'parts'}`));

  const grid = mk('div', 'stat-grid');
  grid.appendChild(stat('Pass',   String(counts.A), 'pass'));
  grid.appendChild(stat('Rework', String(counts.B), 'rework'));
  grid.appendChild(stat('Scrap',  String(counts.C), 'scrap'));
  panel.appendChild(grid);

  panel.appendChild(mk('div', 'cycle-time', `Cycle time   ${mm}:${ss}`));

  el.appendChild(panel);
  el.appendChild(mk('div', 'scan-hint', 'Awaiting moderator'));
  return { el, status: 'Demo complete' };
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

function verdictPanel({ part, lines, verdictText, verdictSymbol, verdictClass }) {
  const p = mk('div', 'panel');
  p.appendChild(mk('div', 'subheading', `PART ${part} — JOB 4471`));
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
