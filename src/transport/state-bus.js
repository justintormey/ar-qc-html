// State bus: small pluggable pub/sub for demo control messages.
//
// One channel of communication between the Controller page and the Demo page.
// Three transport backends are bundled:
//   * BroadcastChannel — same browser profile, same device. Local dev default.
//   * WebRTC (via Portal signaling) — cross-device, low-latency P2P. Demo day.
//   * Polling — fallback for completeness; not wired to any hosted endpoint yet.
//
// Selected via query params on the page URL:
//   ?transport=broadcast                                 (default)
//   ?transport=webrtc&room=123456                        (demo day)
//   ?transport=webrtc&room=123456&signaling=wss://…      (override signaling)
//   ?transport=polling&endpoint=https://…/api/state      (stub)

import { WebRTCTransport } from './webrtc-transport.js';

const CHANNEL = 'argo-qc-demo';
const POLL_INTERVAL_MS = 200;

function nowSeq() {
  // monotonic-ish sequence for de-duping
  return Date.now();
}

class BroadcastTransport {
  constructor() {
    this.bc = new BroadcastChannel(CHANNEL);
    this.handlers = new Set();
    this.bc.addEventListener('message', (e) => {
      this.handlers.forEach((h) => h(e.data));
    });
  }
  send(msg) {
    const wrapped = { ...msg, _seq: nowSeq() };
    this.bc.postMessage(wrapped);
    return wrapped;
  }
  subscribe(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  describe() { return 'broadcast'; }
}

class PollingTransport {
  constructor(endpoint) {
    this.endpoint = endpoint || '/api/state';
    this.handlers = new Set();
    this.lastSeq = 0;
    this._timer = null;
    this._start();
  }
  _start() {
    const poll = async () => {
      try {
        const res = await fetch(this.endpoint, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data._seq && data._seq > this.lastSeq) {
            this.lastSeq = data._seq;
            this.handlers.forEach((h) => h(data));
          }
        }
      } catch (err) {
        // network blip — keep polling
      }
      this._timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
  }
  async send(msg) {
    const wrapped = { ...msg, _seq: nowSeq() };
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wrapped),
      });
    } catch (err) {
      console.error('state send failed', err);
    }
    return wrapped;
  }
  subscribe(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  describe() { return `polling ${this.endpoint}`; }
}

export function createStateBus({ force, onStatus } = {}) {
  const params = new URLSearchParams(location.search);
  const requested = force || params.get('transport');

  if (requested === 'webrtc' || requested === 'rtc') {
    const room = params.get('room');
    if (!room || !/^\d{6,8}$/.test(room)) {
      console.warn('[state-bus] webrtc transport requested but ?room=NNNNNN missing or malformed; falling back to broadcast');
    } else {
      return new WebRTCTransport({
        room,
        signalingUrl: params.get('signaling') || undefined,
        onStatus,
      });
    }
  }

  if (requested === 'polling' || requested === 'http') {
    const endpoint = params.get('endpoint') || '/api/state';
    return new PollingTransport(endpoint);
  }

  // default
  if (typeof BroadcastChannel !== 'undefined') {
    return new BroadcastTransport();
  }
  return new PollingTransport();
}

// Canonical commands the controller emits:
//   { kind: 'verdict', part: 'A' | 'B' | 'C' }
//   { kind: 'next' }              // advance from a verdict-panel scene
//   { kind: 'reset' }             // back to welcome
//   { kind: 'enable-gaze' }       // toggle optional gaze auto-trigger
//   { kind: 'disable-gaze' }
//
// And telemetry the demo emits back (for the controller's event log):
//   { kind: 'scene', name: '...' }
//   { kind: 'verdict-shown', part: 'A' | 'B' | 'C' }
