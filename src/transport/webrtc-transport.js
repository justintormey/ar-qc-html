// WebRTC transport — talks to a Portal-compatible AWS API Gateway WebSocket
// signaling server. The two peers (headset demo page + operator controller
// page) join the same room PIN, exchange SDP + ICE, then talk over a
// reliable + ordered DataChannel for the rest of the session. Same public
// API as the local BroadcastTransport: send(msg), subscribe(handler),
// describe(). Drop-in swap based on URL query params.
//
// Defaults:
//   * Signaling URL: a prod Portal endpoint (override with ?signaling=wss://…)
//   * ICE servers:  Google public STUN only — fine when both peers share a
//     Wi-Fi or NAT, no TURN configured.
//
// The first peer to send `{ type: 'join' }` and receive `peer-count: 2` (i.e.
// the second arrival in the room) becomes the *initiator* and creates the
// DataChannel + offer. The first arrival waits for `peer-joined`, then for
// `offer`, then sends `answer`.

const DEFAULT_WS = 'wss://tkdxsgj4md.execute-api.us-east-1.amazonaws.com/v1';
const DEFAULT_ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};
const CHANNEL_LABEL = 'argo-qc';
const JOIN_DELAY_MS = 300; // mirrors portal.js — gives $connect Lambda time

export class WebRTCTransport {
  constructor({ room, signalingUrl, iceConfig, onStatus } = {}) {
    if (!room) throw new Error('WebRTCTransport: room PIN required');
    this.room = String(room);
    this.signalingUrl = signalingUrl || DEFAULT_WS;
    this.iceConfig = iceConfig || DEFAULT_ICE;
    this.onStatus = onStatus || (() => {});

    this.handlers = new Set();
    this.outgoingQueue = [];   // buffered until DataChannel opens

    this.ws = null;
    this.pc = null;
    this.dc = null;
    this.connected = false;
    this.isInitiator = false;

    // ICE candidates can arrive over the wire BEFORE setRemoteDescription
    // completes on this side. Buffer them and flush once the description is
    // in place, otherwise addIceCandidate throws InvalidStateError.
    this._pendingCandidates = [];

    // Defer initial connect by one microtask so the caller's const binding
    // (e.g. `const bus = createStateBus(...)`) finishes before any onStatus
    // callback fires. Otherwise the first synchronous notify hits a TDZ if
    // the callback references `bus`.
    queueMicrotask(() => this._connectSignaling());
  }

  describe() {
    const state = this.connected ? 'connected' :
                  this.dc ? 'datachannel-pending' :
                  this.pc ? 'webrtc-handshake' :
                  this.ws ? 'signaling' : 'init';
    return `webrtc(room=${this.room}, ${state})`;
  }

  send(msg) {
    const wrapped = { ...msg, _seq: Date.now() };
    const payload = JSON.stringify(wrapped);
    if (this.connected && this.dc && this.dc.readyState === 'open') {
      this.dc.send(payload);
    } else {
      this.outgoingQueue.push(payload);
    }
    return wrapped;
  }

  subscribe(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  _connectSignaling() {
    const sep = this.signalingUrl.includes('?') ? '&' : '?';
    const url = `${this.signalingUrl}${sep}room=${encodeURIComponent(this.room)}`;
    this.ws = new WebSocket(url);
    this._notifyStatus('connecting');

    this.ws.addEventListener('open', () => {
      this._notifyStatus('signaling-open');
      setTimeout(() => this._wsSend({ type: 'join' }), JOIN_DELAY_MS);
    });

    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this._handleSignal(msg);
    });

    this.ws.addEventListener('close', () => {
      this._notifyStatus('signaling-closed');
      // If we already have a P2P DataChannel, this is fine — peers keep
      // talking directly. Otherwise schedule a retry.
      if (!this.connected) setTimeout(() => this._connectSignaling(), 3000);
    });

    this.ws.addEventListener('error', () => {
      this._notifyStatus('signaling-error');
    });
  }

  _wsSend(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // AWS API Gateway WebSocket route selection expects each message to
      // be wrapped under {action: 'sendmessage', data: {...}}. The local
      // server.js mirrors this by reading body.data.type. Either way, the
      // wrapping is required — sending a flat object gets a "Forbidden"
      // response from API Gateway.
      this.ws.send(JSON.stringify({ action: 'sendmessage', data: payload }));
    }
  }

  async _handleSignal(msg) {
    switch (msg.type) {
      case 'peer-count':
        this._notifyStatus(`peers:${msg.count}`);
        break;

      case 'should-initiate':
        this.isInitiator = true;
        this._notifyStatus('initiating');
        await this._initPeer(true);
        break;

      case 'peer-joined':
        // The other peer just arrived. If we're already the initiator we'll
        // wait for them to send the offer. Either way, ensure peer is built.
        if (!this.pc) {
          await this._initPeer(false);
        }
        break;

      case 'offer':
        if (!this.pc) await this._initPeer(false);
        await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await this._flushPendingCandidates();
        {
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this._wsSend({ type: 'answer', sdp: answer });
        }
        break;

      case 'answer':
        if (this.pc) {
          await this.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          await this._flushPendingCandidates();
        }
        break;

      case 'ice-candidate':
        if (!msg.candidate) break;
        if (this.pc && this.pc.remoteDescription) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (err) {
            console.warn('[webrtc] failed to add ICE candidate', err);
          }
        } else {
          // Remote description hasn't been set yet — buffer for later.
          this._pendingCandidates.push(msg.candidate);
        }
        break;

      case 'peer-left':
        this._notifyStatus('peer-left');
        this._teardown();
        break;
    }
  }

  async _initPeer(initiator) {
    this.pc = new RTCPeerConnection(this.iceConfig);

    this.pc.onicecandidate = (event) => {
      this._wsSend({ type: 'ice-candidate', candidate: event.candidate });
    };

    this.pc.onconnectionstatechange = () => {
      this._notifyStatus(`pc:${this.pc.connectionState}`);
      if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        this.connected = false;
      }
    };

    if (initiator) {
      this.dc = this.pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
      this._wireDataChannel();
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this._wsSend({ type: 'offer', sdp: offer });
    } else {
      this.pc.ondatachannel = (event) => {
        this.dc = event.channel;
        this._wireDataChannel();
      };
    }
  }

  _wireDataChannel() {
    if (!this.dc) return;
    this.dc.onopen = () => {
      this.connected = true;
      this._notifyStatus('connected');
      // flush queued sends
      while (this.outgoingQueue.length > 0) {
        const payload = this.outgoingQueue.shift();
        try { this.dc.send(payload); } catch (_) { break; }
      }
    };
    this.dc.onclose = () => {
      this.connected = false;
      this._notifyStatus('datachannel-closed');
    };
    this.dc.onmessage = (event) => {
      let parsed;
      try { parsed = JSON.parse(event.data); } catch { return; }
      this.handlers.forEach((h) => h(parsed));
    };
    this.dc.onerror = (err) => {
      console.warn('[webrtc] datachannel error', err);
    };
  }

  async _flushPendingCandidates() {
    while (this._pendingCandidates.length > 0) {
      const c = this._pendingCandidates.shift();
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.warn('[webrtc] failed to flush ICE candidate', err);
      }
    }
  }

  _teardown() {
    this.connected = false;
    try { this.dc?.close(); } catch (_) {}
    try { this.pc?.close(); } catch (_) {}
    this.dc = null;
    this.pc = null;
    this._pendingCandidates = [];
  }

  _notifyStatus(state) {
    console.info('[webrtc]', state);
    this.onStatus(state);
  }
}
