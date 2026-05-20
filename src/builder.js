// HUD Builder orchestrator. Sibling of demo.js for the assembly-training app.
//
// State machine:
//   welcome → instructions → scanning → verdictPass | verdictFail → …
//   after pass → instructions (next part)
//   after fail → instructions (same part — rework loop)
//   end demo → complete → reset → welcome
//
// Bus protocol (extends QC):
//   {kind:'scan'}                                    → scanning
//   {kind:'builder-verdict', part:'A'|'B'|'C', result:'pass'|'fail'} → verdict
//   {kind:'complete'}                                → complete
//   {kind:'reset'}                                   → welcome
//
// On verdict, after the scene is shown, the wearer drives the next
// transition in-headset (Next part / Rework / End session) — but the
// HTML side has no scroll-wheel input, so we rely on operator SCAN
// + End Demo + Reset for the post-verdict transitions on web.

import { createStateBus } from './transport/state-bus.js';
import {
  welcomeScene,
  instructionsScene,
  scanningScene,
  verdictPassScene,
  verdictFailScene,
  completeScene,
} from './hud/builder-scenes.js';
import { preWarm as preWarmCamera } from './hud/camera.js';

const hud = document.getElementById('hud');
const statusChip = document.getElementById('status-chip');
const connChip = document.getElementById('conn-chip');
const connText = document.getElementById('conn-text');
const scanOverlay = document.getElementById('scan-overlay');

let bus = null;
let currentScene = null;

// Track the part currently being worked on (used by Instructions scene label
// and FAIL-then-rework continuity).
let currentPart = 'A';

// Aggregate counts + timing.
let counts = { pass: 0, fail: 0 };
let firstScanAt = 0;

bus = createStateBus({
  onStatus: (state) => {
    connText.textContent = state;
    connChip.classList.toggle('connected', /^connected$|^pc:connected$|^datachannel-open$/.test(state));
    connChip.classList.toggle('error', /error|closed|failed/.test(state));
  },
});
connText.textContent = bus.describe();
bus.send({ kind: 'ready' });
bus.subscribe(handleBus);

// Same-device-mode banner (identical to demo.js)
const transportParam = new URLSearchParams(location.search).get('transport');
const roomParam = new URLSearchParams(location.search).get('room');
if (transportParam !== 'webrtc' || !/^\d{6,8}$/.test(roomParam || '')) {
  const banner = document.createElement('div');
  banner.id = 'pin-banner';
  const strong = document.createElement('strong');
  strong.textContent = '⚠ Same-device mode';
  banner.appendChild(strong);
  const text = document.createElement('span');
  text.textContent = " Controller on a different device won't reach this headset. Open ";
  banner.appendChild(text);
  const link = document.createElement('a');
  link.href = 'index.html';
  link.textContent = 'the landing page';
  banner.appendChild(link);
  const text2 = document.createElement('span');
  text2.textContent = ', enter a 6-digit Room PIN, then re-open this builder.';
  banner.appendChild(text2);
  document.body.appendChild(banner);
}

preWarmCamera();
goWelcome();

// ─── Scene transitions ──────────────────────────────────────────────
function swap(next) {
  if (currentScene) {
    if (typeof currentScene.dispose === 'function') currentScene.dispose();
    currentScene.el.remove();
  }
  currentScene = next;

  scanOverlay.classList.remove('active');
  if (next.isScanning) {
    void scanOverlay.offsetWidth;
    scanOverlay.classList.add('active');
  }

  hud.appendChild(next.el);
  statusChip.textContent = next.status || '';
  bus?.send({ kind: 'scene', name: stripScene(next.status) });
}

function stripScene(s) {
  return (s || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function goWelcome() {
  counts = { pass: 0, fail: 0 };
  firstScanAt = 0;
  currentPart = 'A';
  swap(welcomeScene());
}
function goInstructions(part = currentPart) {
  currentPart = part;
  swap(instructionsScene({ partLabel: `Part ${part}` }));
}
function goScanning() {
  if (firstScanAt === 0) firstScanAt = performance.now();
  swap(scanningScene());
}
function goVerdict(part, result) {
  currentPart = part;
  if (result === 'pass') {
    counts.pass++;
    swap(verdictPassScene({ part }));
  } else {
    counts.fail++;
    swap(verdictFailScene({ part }));
  }
  bus?.send({ kind: 'verdict-shown', part, result });
}
function goComplete() {
  const elapsed = firstScanAt ? performance.now() - firstScanAt : 0;
  swap(completeScene({ counts, elapsedMs: elapsed }));
}

// ─── Bus message handler ────────────────────────────────────────────
function handleBus(msg) {
  if (!msg) return;
  switch (msg.kind) {
    case 'scan':
      // From any scene, SCAN moves to the scanning state. From Welcome the
      // operator typically goes Welcome → Instructions first, but if they
      // skip and tap SCAN we honour it.
      if (currentScene === null) goScanning();
      else {
        const status = currentScene.status || '';
        // From Welcome go to Instructions; from Instructions / Verdict go
        // straight to Scanning.
        if (status === 'Ready') goInstructions(currentPart);
        else goScanning();
      }
      break;
    case 'builder-verdict': {
      const part = String(msg.part || '').toUpperCase();
      const result = msg.result === 'fail' ? 'fail' : 'pass';
      if (['A', 'B', 'C'].includes(part)) goVerdict(part, result);
      break;
    }
    case 'next':
      // Wearer pressed "Next part" / "Rework" — both head back to Instructions.
      // PASS → next part (advance the letter); FAIL → same part.
      // We can't tell which without looking at the current scene; cheat by
      // peeking the status text.
      if ((currentScene?.status || '').includes('PASS')) {
        const next = nextPart(currentPart);
        if (next) goInstructions(next);
        else goComplete();
      } else if ((currentScene?.status || '').includes('FAIL')) {
        goInstructions(currentPart);
      } else {
        // Welcome / Instructions — treat as scan request
        goScanning();
      }
      break;
    case 'complete':
      goComplete();
      break;
    case 'reset':
      goWelcome();
      break;
  }
}

function nextPart(p) {
  return p === 'A' ? 'B' : p === 'B' ? 'C' : null;
}
