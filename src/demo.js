// HUD demo orchestrator. Controller-driven (Argo has no input → no buttons).
//
// State machine:
//   welcome → scanning → verdictA|B|C → scanning → … → complete → welcome
//
// All transitions arrive via the state bus:
//   {kind:'scan'}                  → scanning
//   {kind:'verdict', part:'A'|'B'|'C'} → verdict + count++
//   {kind:'complete'}              → complete (with running counts)
//   {kind:'reset'}                 → welcome (counts cleared)

import { createStateBus } from './transport/state-bus.js';
import {
  welcomeScene,
  scanningScene,
  partAScene,
  partBScene,
  partCScene,
  completeScene,
} from './hud/scenes.js';
import { preWarm as preWarmCamera } from './hud/camera.js';

const hud = document.getElementById('hud');
const statusChip = document.getElementById('status-chip');
const connChip = document.getElementById('conn-chip');
const connText = document.getElementById('conn-text');
const scanOverlay = document.getElementById('scan-overlay');

let bus = null;
let currentScene = null;

// Verdict counts + timing accumulated across the run.
let counts = { A: 0, B: 0, C: 0 };
let firstScanAt = 0;

// ─── Bus + same-device banner ───────────────────────────────────────
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
  text2.textContent = ', enter a 6-digit Room PIN, then re-open this demo.';
  banner.appendChild(text2);
  document.body.appendChild(banner);
}

// ─── Boot ────────────────────────────────────────────────────────────
// Kick off the camera permission request immediately so the first SCAN
// has a warm stream and no mid-demo prompt.
preWarmCamera();

goWelcome();

// ─── Scene transitions ──────────────────────────────────────────────
function swap(next) {
  if (currentScene) {
    if (typeof currentScene.dispose === 'function') currentScene.dispose();
    currentScene.el.remove();
  }
  currentScene = next;

  // Toggle the looping scan overlay. Always remove then conditionally
  // re-add so the CSS animation restarts cleanly.
  scanOverlay.classList.remove('active');
  if (next.isScanning) {
    void scanOverlay.offsetWidth; // force reflow → animation restart
    scanOverlay.classList.add('active');
  }

  hud.appendChild(next.el);
  statusChip.textContent = next.status || '';
  bus?.send({ kind: 'scene', name: stripScene(next.status) });
}

function stripScene(s) {
  // Just for telemetry: lowercase + dash-separated
  return (s || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function goWelcome() {
  counts = { A: 0, B: 0, C: 0 };
  firstScanAt = 0;
  swap(welcomeScene());
}
function goScanning() {
  if (firstScanAt === 0) firstScanAt = performance.now();
  swap(scanningScene());
}
function goPartA() { counts.A++; swap(partAScene()); }
function goPartB() { counts.B++; swap(partBScene()); }
function goPartC() { counts.C++; swap(partCScene()); }
function goComplete() {
  const elapsed = firstScanAt ? performance.now() - firstScanAt : 0;
  swap(completeScene({ counts, elapsedMs: elapsed }));
}

// ─── Bus message handler ────────────────────────────────────────────
function handleBus(msg) {
  if (!msg) return;
  switch (msg.kind) {
    case 'scan':
      goScanning();
      break;
    case 'verdict': {
      const part = String(msg.part || '').toUpperCase();
      if (part === 'A') goPartA();
      else if (part === 'B') goPartB();
      else if (part === 'C') goPartC();
      bus?.send({ kind: 'verdict-shown', part });
      break;
    }
    case 'complete':
      goComplete();
      break;
    case 'reset':
      goWelcome();
      break;
  }
}
