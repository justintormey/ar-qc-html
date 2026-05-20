// Diagnostic page: dump everything the Argo browser exposes about WebXR
// and adjacent APIs. Render via DOM helpers (no innerHTML) for safety.

const report = {};

const identity = document.getElementById('identity');
const webxr = document.getElementById('webxr');
const permissions = document.getElementById('permissions');
const other = document.getElementById('other');
const raw = document.getElementById('raw');

function row(parent, label, value, cls) {
  const r = document.createElement('div');
  r.className = 'row';
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('span');
  v.textContent = String(value);
  if (cls) v.className = cls;
  r.appendChild(l);
  r.appendChild(v);
  parent.appendChild(r);
}

function boolClass(b) { return b ? 'yes' : 'no'; }

// ─── Browser identity ───
report.userAgent = navigator.userAgent;
report.platform = navigator.platform;
report.language = navigator.language;
report.location = location.href;
report.isSecureContext = window.isSecureContext;

row(identity, 'userAgent', report.userAgent);
row(identity, 'platform', report.platform);
row(identity, 'language', report.language);
row(identity, 'URL', report.location);
row(identity, 'secure context', report.isSecureContext, boolClass(report.isSecureContext));

// ─── WebXR ───
const xrExists = 'xr' in navigator;
report.navigatorXr = xrExists;
row(webxr, "'xr' in navigator", xrExists, boolClass(xrExists));

if (xrExists) {
  row(webxr, 'navigator.xr', navigator.xr.constructor.name);
  const checks = ['immersive-ar', 'immersive-vr', 'inline'];
  (async () => {
    for (const mode of checks) {
      try {
        const ok = await navigator.xr.isSessionSupported(mode);
        report['supports_' + mode] = ok;
        row(webxr, mode, ok, boolClass(ok));
      } catch (err) {
        report['supports_' + mode] = 'error: ' + err.message;
        row(webxr, mode, 'error: ' + err.message, 'no');
      }
      updateRaw();
    }
  })();
} else {
  row(webxr, '(missing)', 'navigator.xr is not exposed in this browser', 'no');
}

// ─── Permissions Policy ───
if ('featurePolicy' in document) {
  try {
    const allowed = document.featurePolicy.allowsFeature('xr-spatial-tracking');
    report.featurePolicy_xrSpatial = allowed;
    row(permissions, 'xr-spatial-tracking allowed (featurePolicy)', allowed, boolClass(allowed));
  } catch (e) {
    row(permissions, 'featurePolicy.allowsFeature', 'error: ' + e.message, 'maybe');
  }
}
if ('permissionsPolicy' in document) {
  try {
    const allowed = document.permissionsPolicy.allowsFeature('xr-spatial-tracking');
    report.permissionsPolicy_xrSpatial = allowed;
    row(permissions, 'xr-spatial-tracking allowed (permissionsPolicy)', allowed, boolClass(allowed));
  } catch (e) {
    row(permissions, 'permissionsPolicy.allowsFeature', 'error: ' + e.message, 'maybe');
  }
}
if (!('featurePolicy' in document) && !('permissionsPolicy' in document)) {
  row(permissions, '(missing)', 'featurePolicy/permissionsPolicy not exposed', 'maybe');
}

// ─── Other XR globals ───
const others = {
  'window.XRSystem': typeof window.XRSystem,
  'window.XRSession': typeof window.XRSession,
  'window.XRReferenceSpace': typeof window.XRReferenceSpace,
  'window.XRHand': typeof window.XRHand,
  'window.XRHitTestSource': typeof window.XRHitTestSource,
  'window.RTCPeerConnection': typeof window.RTCPeerConnection,
  'window.BroadcastChannel': typeof window.BroadcastChannel,
  'window.fetch': typeof window.fetch,
  'navigator.mediaDevices': typeof navigator.mediaDevices,
  'navigator.mediaDevices.getUserMedia': navigator.mediaDevices ? typeof navigator.mediaDevices.getUserMedia : 'n/a',
  'navigator.mediaDevices.enumerateDevices': navigator.mediaDevices ? typeof navigator.mediaDevices.enumerateDevices : 'n/a',
};
for (const [k, v] of Object.entries(others)) {
  report[k] = v;
  row(other, k, v, v !== 'undefined' && v !== 'n/a' ? 'yes' : 'no');
}

// Enumerate cameras (works without permission, labels may be empty)
(async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    row(other, 'cameras (enumerate)', 'enumerateDevices missing', 'no');
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((d) => d.kind === 'videoinput');
    row(other, 'cameras (count)', String(cams.length), cams.length > 0 ? 'yes' : 'no');
    report.cameraCount = cams.length;
    report.cameras = cams.map((c) => ({ deviceId: c.deviceId, label: c.label || '(blocked until permission)' }));
    cams.forEach((c, i) => row(other, `  cam[${i}].label`, c.label || '(no label — needs camera permission)'));
    updateRaw();
  } catch (err) {
    row(other, 'enumerateDevices', 'error: ' + err.message, 'no');
  }
})();

// ─── Camera diagnostics (top of page) ────────────────────────────────
const camLog = document.getElementById('cam-log');
const camPerm = document.getElementById('cam-perm');

function camPrint(msg) {
  const t = new Date();
  const stamp = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
  camLog.textContent += `[${stamp}] ${msg}\n`;
  camLog.scrollTop = camLog.scrollHeight;
}

// Query Permissions API
(async () => {
  if (!navigator.permissions || !navigator.permissions.query) {
    camPerm.textContent = 'navigator.permissions missing';
    camPerm.className = 'no';
    return;
  }
  try {
    const result = await navigator.permissions.query({ name: 'camera' });
    camPerm.textContent = result.state;
    camPerm.className = result.state === 'granted' ? 'yes' : result.state === 'denied' ? 'no' : 'maybe';
    report.cameraPermission = result.state;
    result.onchange = () => {
      camPerm.textContent = result.state;
      camPerm.className = result.state === 'granted' ? 'yes' : result.state === 'denied' ? 'no' : 'maybe';
      report.cameraPermission = result.state;
      camPrint(`permission changed to: ${result.state}`);
      updateRaw();
    };
  } catch (err) {
    camPerm.textContent = `error: ${err.message}`;
    camPerm.className = 'no';
  }
})();

async function tryGetUserMedia(label, constraints, useLegacy = false) {
  camPrint(`▸ ${label} → ${JSON.stringify(constraints)}`);
  try {
    let s;
    if (useLegacy) {
      const legacy = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
      if (!legacy) {
        camPrint('  ✗ legacy navigator.getUserMedia is not exposed');
        return;
      }
      s = await new Promise((resolve, reject) => {
        legacy.call(navigator, constraints, resolve, reject);
      });
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        camPrint('  ✗ navigator.mediaDevices.getUserMedia is missing');
        return;
      }
      s = await navigator.mediaDevices.getUserMedia(constraints);
    }
    const tracks = s.getVideoTracks();
    camPrint(`  ✓ GRANTED — ${tracks.length} video track(s)`);
    for (const t of tracks) {
      const settings = t.getSettings ? t.getSettings() : {};
      camPrint(`    label="${t.label}" state=${t.readyState} ${settings.width||'?'}x${settings.height||'?'}@${settings.frameRate||'?'}fps`);
    }
    // Don't stop the tracks — caller can use the freshly-granted permission
    setTimeout(() => s.getTracks().forEach((t) => t.stop()), 1500);
  } catch (err) {
    camPrint(`  ✗ ${err.name || 'Error'}: ${err.message || err}`);
  }
}

document.getElementById('probe-modern').addEventListener('click', () => {
  tryGetUserMedia('modern getUserMedia (video:true)', { video: true });
});
document.getElementById('probe-facing').addEventListener('click', () => {
  tryGetUserMedia('modern with facingMode=environment', { video: { facingMode: { ideal: 'environment' } } });
});
document.getElementById('probe-byid').addEventListener('click', async () => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    camPrint('  ✗ enumerateDevices missing');
    return;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cam = devices.find((d) => d.kind === 'videoinput');
  if (!cam) {
    camPrint('  ✗ no videoinput device found');
    return;
  }
  tryGetUserMedia(`by deviceId=${cam.deviceId.slice(0,12)}…`, { video: { deviceId: { exact: cam.deviceId } } });
});
document.getElementById('probe-legacy').addEventListener('click', () => {
  tryGetUserMedia('legacy navigator.getUserMedia', { video: true }, true);
});

camPrint('camera diagnostic ready. tap a probe button above.');

// ─── Raw + copy ───
function updateRaw() {
  raw.textContent = JSON.stringify(report, null, 2);
}
updateRaw();

document.getElementById('copy').addEventListener('click', async () => {
  const text = JSON.stringify(report, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    document.getElementById('copy-status').textContent = 'Copied. Paste back here.';
  } catch (_) {
    document.getElementById('copy-status').textContent = 'Clipboard blocked — copy the Raw output manually.';
  }
});
