// Builder controller — paste-and-edit from src/control.js with the six-button
// verdict grid (PASS A/B/C + FAIL A/B/C). Sends BusMessage shapes:
//   {kind:'scan'}, {kind:'builder-verdict', part, result}, {kind:'complete'}, {kind:'reset'}

import { createStateBus } from './transport/state-bus.js';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const connPill = document.getElementById('conn-pill');
const connHeadline = document.getElementById('conn-headline');
const connDetail = document.getElementById('conn-detail');

const scanBtn = document.getElementById('scan');
const passA = document.getElementById('pass-a');
const passB = document.getElementById('pass-b');
const passC = document.getElementById('pass-c');
const failA = document.getElementById('fail-a');
const failB = document.getElementById('fail-b');
const failC = document.getElementById('fail-c');
const endBtn = document.getElementById('end-demo');
const resetBtn = document.getElementById('reset');

const verdictBtns = [passA, passB, passC, failA, failB, failC];

const tParam = new URLSearchParams(location.search).get('transport');
const rParam = new URLSearchParams(location.search).get('room');
const isWebRtcMode = tParam === 'webrtc' && /^\d{6,8}$/.test(rParam || '');

let bus = null;
bus = createStateBus({
  onStatus: (state) => {
    const desc = bus?.describe?.() || '…';
    statusEl.textContent = `Transport: ${desc}  •  ${state}`;
    logLine(`[transport] ${state}`);
    updateConn(state);
  },
});
statusEl.textContent = `Transport: ${bus.describe()}`;

if (isWebRtcMode) {
  setPill('connecting', 'Connecting to signaling…', `Room ${rParam}`);
  setControlsEnabled(false);
} else {
  setPill('same-device', 'Same-device mode', 'BroadcastChannel — controller and demo must be on the same browser');
  setControlsEnabled(true);
}

if (!isWebRtcMode) {
  const banner = document.createElement('div');
  banner.style.cssText = 'background: #4a3a1a; border: 1px solid #f7c948; color: #f7c948; padding: 0.8rem 1rem; border-radius: 10px; margin-top: 1rem; font-size: 0.9rem;';
  const s = document.createElement('strong');
  s.textContent = '⚠ Same-device mode — ';
  banner.appendChild(s);
  const t = document.createElement('span');
  t.textContent = "controller won't reach a headset on another device. Go back to ";
  banner.appendChild(t);
  const a = document.createElement('a');
  a.href = 'index.html';
  a.textContent = 'the landing page';
  a.style.color = '#6ee7ff';
  banner.appendChild(a);
  const t2 = document.createElement('span');
  t2.textContent = ', enter a 6-digit PIN, then re-open this controller.';
  banner.appendChild(t2);
  statusEl.parentElement.insertBefore(banner, statusEl);
}

function logLine(text, cls = '') {
  const div = document.createElement('div');
  div.className = `row-line ${cls}`;
  const t = new Date();
  const stamp = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
  div.textContent = `${stamp}  ${text}`;
  logEl.prepend(div);
  while (logEl.childNodes.length > 80) logEl.removeChild(logEl.lastChild);
}

scanBtn.addEventListener('click', () => {
  bus.send({ kind: 'scan' });
  logLine('-> scan', 'cmd');
});

function fire(part, result) {
  bus.send({ kind: 'builder-verdict', part, result });
  logLine(`-> ${result.toUpperCase()} ${part}`, 'cmd');
}
passA.addEventListener('click', () => fire('A', 'pass'));
passB.addEventListener('click', () => fire('B', 'pass'));
passC.addEventListener('click', () => fire('C', 'pass'));
failA.addEventListener('click', () => fire('A', 'fail'));
failB.addEventListener('click', () => fire('B', 'fail'));
failC.addEventListener('click', () => fire('C', 'fail'));

endBtn.addEventListener('click', () => {
  bus.send({ kind: 'complete' });
  logLine('-> end demo', 'cmd');
});

resetBtn.addEventListener('click', () => {
  if (!confirm('Reset Builder back to welcome scene?')) return;
  bus.send({ kind: 'reset' });
  logLine('-> reset', 'cmd');
});

bus.subscribe((msg) => {
  if (msg.kind === 'scene') logLine(`<- scene: ${msg.name}`);
  else if (msg.kind === 'verdict-shown') logLine(`<- verdict-shown ${msg.part} ${msg.result || ''}`);
  else if (msg.kind === 'ready') logLine('<- builder page ready');
});

logLine('controller ready');

function updateConn(state) {
  if (!isWebRtcMode) return;
  const s = String(state);

  if (s === 'connected' || s === 'pc:connected' || s === 'datachannel-open') {
    setPill('connected', 'Connected to headset', `Room ${rParam} · WebRTC DataChannel open`);
    setControlsEnabled(true);
    return;
  }
  if (s === 'peer-left' || s === 'datachannel-closed' || s.startsWith('pc:failed') || s.startsWith('pc:closed') || s === 'signaling-error') {
    setPill('error', 'Headset disconnected', `Was: ${s}. Waiting for the builder page to reconnect.`);
    setControlsEnabled(false);
    return;
  }
  if (s === 'signaling-closed' || s === 'connecting') {
    setPill('connecting', 'Connecting to signaling…', `Room ${rParam}`);
    setControlsEnabled(false);
    return;
  }
  if (s === 'signaling-open') {
    setPill('connecting', 'Signaling open — waiting for headset', `Room ${rParam} · open the builder on the Argo with the same PIN`);
    setControlsEnabled(false);
    return;
  }
  if (s.startsWith('peers:')) {
    const n = Number(s.split(':')[1]);
    if (n < 2) {
      setPill('connecting', 'Waiting for headset', `Room ${rParam} · open the builder on the Argo with the same PIN`);
    } else {
      setPill('connecting', 'Negotiating peer connection…', `Room ${rParam} · ${s}`);
    }
    setControlsEnabled(false);
    return;
  }
  setPill('connecting', 'Handshaking…', `Room ${rParam} · ${s}`);
  setControlsEnabled(false);
}

function setPill(kind, headline, detail) {
  connPill.classList.remove('connected', 'error', 'same-device');
  if (kind === 'connected') connPill.classList.add('connected');
  else if (kind === 'error') connPill.classList.add('error');
  else if (kind === 'same-device') connPill.classList.add('same-device');
  connHeadline.textContent = headline;
  connDetail.textContent = detail;
}

function setControlsEnabled(enabled) {
  for (const b of [scanBtn, ...verdictBtns, endBtn, resetBtn]) {
    b.toggleAttribute('disabled', !enabled);
  }
}
