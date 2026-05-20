// Argo camera manager.
//
// Singleton that requests the world-facing camera once via getUserMedia()
// and keeps the MediaStream alive across scene swaps. Scenes that want
// the camera feed call attach(videoEl) and detach(videoEl); the stream
// stays warm so we don't re-prompt for permission every time the user
// returns to the scanning state.
//
// On permission denied or any other failure, attach() resolves to false
// and the caller is expected to gracefully fall back (we hide the video,
// the rest of the scanning UI keeps working).

let stream = null;
let permissionState = 'unknown'; // 'unknown' | 'granted' | 'denied' | 'unsupported' | 'pending' | 'error'
let lastError = null;
let pendingRequest = null;

// Subscribers receive the latest state on every change.
const subs = new Set();
function notify() {
  const snap = { state: permissionState, error: lastError && lastError.message };
  subs.forEach((fn) => { try { fn(snap); } catch (_) {} });
}
function setState(s, err) {
  permissionState = s;
  lastError = err || null;
  notify();
}
export function subscribe(fn) {
  subs.add(fn);
  fn({ state: permissionState, error: lastError && lastError.message });
  return () => subs.delete(fn);
}

const PREFERRED_CONSTRAINTS = {
  video: {
    facingMode: { ideal: 'environment' }, // world-facing on AR glasses
    width:  { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: false,
};

const FALLBACK_CONSTRAINTS = { video: true, audio: false };

export function getPermissionState() { return permissionState; }
export function getLastError() { return lastError; }

export async function ensureStream() {
  if (stream) return stream;
  if (pendingRequest) return pendingRequest;

  if (!navigator.mediaDevices) {
    setState('unsupported', new Error('navigator.mediaDevices missing'));
    console.warn('[camera] navigator.mediaDevices is missing on this browser');
    return null;
  }
  if (!navigator.mediaDevices.getUserMedia) {
    setState('unsupported', new Error('getUserMedia missing'));
    console.warn('[camera] navigator.mediaDevices.getUserMedia is missing');
    return null;
  }

  setState('pending');
  console.info('[camera] requesting getUserMedia with', PREFERRED_CONSTRAINTS);

  // 4-second hard timeout. Some browsers (Firefox 105 on Argo) leave
  // getUserMedia pending indefinitely — no prompt, no error, no resolve.
  // After 4s we give up and treat the camera as unavailable so the
  // procedural scanning visuals can take over without a hung chip.
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(Object.assign(new Error('getUserMedia timed out'), { name: 'TimeoutError' })), 4000);
  });

  pendingRequest = (async () => {
    try {
      stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(PREFERRED_CONSTRAINTS),
        timeout,
      ]);
    } catch (err) {
      console.warn('[camera] preferred constraints failed:', err.name, err.message);
      // Some browsers fail with OverconstrainedError on facingMode. Retry
      // with bare constraints before giving up.
      if (err && (err.name === 'OverconstrainedError' || err.name === 'NotReadableError' || err.name === 'TypeError')) {
        try {
          console.info('[camera] retrying with bare constraints');
          stream = await navigator.mediaDevices.getUserMedia(FALLBACK_CONSTRAINTS);
        } catch (err2) {
          setState(err2.name === 'NotAllowedError' ? 'denied' : 'error', err2);
          console.warn('[camera] bare-constraints retry failed:', err2.name, err2.message);
          stream = null;
        }
      } else {
        setState(err.name === 'NotAllowedError' ? 'denied' : 'error', err);
        stream = null;
      }
    }
    if (stream) {
      setState('granted');
      console.info('[camera] stream acquired:',
        stream.getVideoTracks().map((t) => `${t.label} (${t.readyState})`).join(', '));
    }
    pendingRequest = null;
    return stream;
  })();
  return pendingRequest;
}

export async function attach(videoEl) {
  const s = await ensureStream();
  if (!s || !videoEl) return false;
  videoEl.srcObject = s;
  videoEl.muted = true;
  videoEl.playsInline = true;
  try { await videoEl.play(); } catch (_) { /* autoplay restrictions */ }
  return true;
}

export function detach(videoEl) {
  if (!videoEl) return;
  try { videoEl.pause(); } catch (_) {}
  videoEl.srcObject = null;
}

// Pre-warm the camera so the first scan doesn't pay the permission-prompt
// + stream-startup latency. Safe to call on page load.
export function preWarm() {
  ensureStream().catch(() => {});
}

// Hard shutdown — release the camera entirely. Currently unused (we keep
// the stream alive for the session), but exposed for future cleanup paths.
export function release() {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
}
