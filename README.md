# AR QC Station — HTML demo

A browser-based AR demonstration of a "quality-control inspection station" for use on AR smart glasses with see-through waveguide displays (built and tested on a Digilens Argo, but works on any modern browser with WebRTC). One operator runs a laptop **controller**; another participant wears the **headset** showing a fullscreen HUD. As the participant picks up small metal parts on the table, the operator taps `PART A` / `PART B` / `PART C` and the headset plays the matching inspection verdict — PASS, REWORK, or SCRAP — with supporting detail panels and a sweeping cyan scan-line.

There's a [native Android sibling project](https://github.com/justintormey/ar-qc-android) (`ar-qc-android`) that ports this same flow to a Kotlin/Compose APK with real on-device camera + ML Kit QR detection. The two clients can interoperate over the same WebRTC room.

**Live:** [https://demo.justintormey.com/ar-qc/](https://demo.justintormey.com/ar-qc/)

---

## What you see

The demo is three web pages that share a state machine over WebRTC.

| URL | Audience | What it does |
|---|---|---|
| `/ar-qc/` | Either device | Landing page. Enter a 6–8 digit Room PIN; both devices share it. |
| `/ar-qc/demo.html` | Headset (the AR glasses) | Fullscreen HUD: Welcome → Scanning → Verdict A/B/C → Complete. |
| `/ar-qc/control.html` | Operator (laptop or phone) | A big SCAN button + three colored verdict buttons + End Demo. |
| `/ar-qc/diag.html` | Either | Capability check (WebXR / RTC / camera) for triage. |

The flow:

1. Operator opens the landing page on the laptop, types a Room PIN (e.g. `471471`), opens the **Controller** card.
2. Participant opens the landing page on the headset, types the same PIN, opens **Start Demo**.
3. Both devices show a green "connected" pill at the top-right within ~5 seconds.
4. Operator taps **SCAN** → headset shows the scan animation (cyan corner brackets + sweeping line).
5. Participant picks up any of the three metal parts on the table.
6. Operator decides which verdict applies (A / B / C) and taps the matching button → headset shows the verdict overlay.
7. Repeat until done; tap **End Demo** for a summary.

Reset goes back to Welcome.

---

## Repo layout

```
ar-qc-html/
├── index.html              # Landing page with the Room PIN input
├── demo.html               # Headset HUD entry point
├── control.html            # Operator controller entry point
├── diag.html               # Browser capability diagnostic
├── vite.config.js          # Multi-page Vite config (base path = /ar-qc/)
├── package.json
├── src/
│   ├── style.css           # Landing + controller + diagnostic page styles
│   ├── landing.js          # Room PIN input; rewrites card links with ?transport=webrtc&room=…
│   ├── demo.js             # Scene state machine (Welcome → Scanning → Verdict → Complete)
│   ├── control.js          # Controller button wiring + connection pill
│   ├── diag.js             # Capability probe + camera probe buttons
│   ├── hud/
│   │   ├── style.css       # HUD-specific styles (corner brackets, scan line, panels)
│   │   ├── scenes.js       # DOM-rendered scenes for each demo state
│   │   ├── l-profile.js    # Three.js mini-canvas for the REWORK scene's L-profile reference
│   │   └── camera.js       # Best-effort getUserMedia (kept for future browsers; currently no-op on the Argo)
│   └── transport/
│       ├── state-bus.js    # Pub/sub abstraction over BroadcastChannel | WebRTC | polling
│       └── webrtc-transport.js  # WebRTC peer + AWS API Gateway WebSocket signaling
├── infra/
│   ├── README.md           # One-time AWS setup (IAM role + S3 prefix + CloudFront invalidations)
│   ├── iam-trust-policy.json
│   └── iam-permissions-policy.json
└── .github/workflows/deploy.yml   # GHA: on push to main, build + sync to S3 + invalidate CloudFront
```

### What's where, conceptually

- **`src/transport/`** is the layer that gets a message from the operator's tap to the headset's screen. Three implementations live behind one interface (`createStateBus`): `BroadcastChannel` (same-device dev), `polling` (HTTP-based fallback), and `WebRTC` (cross-device production). The HTML pages don't know or care which one is in use — the URL query param picks it.

- **`src/hud/`** is everything that draws inside the headset's view: corner brackets, scan animation, verdict panels, the 3D L-profile model. Pure DOM + a small Three.js canvas for the L-profile.

- **`src/demo.js`** holds the state machine: there are exactly five states (`Welcome` / `Scanning` / `VerdictA` / `VerdictB` / `VerdictC` / `Complete`) and transitions are driven entirely by messages from the bus. Same shape as the Android port.

- **`src/control.js`** owns the operator's six buttons, the connection pill, and the event log.

---

## Local development

```bash
git clone https://github.com/justintormey/ar-qc-demo
cd ar-qc-demo
npm install
npm run dev    # http://localhost:5173/ar-qc/
```

Test the controller ↔ demo communication in two tabs without going cross-device:

1. Open one tab to `/ar-qc/demo.html`.
2. Open another tab to `/ar-qc/control.html`.
3. (No room PIN required — both tabs use the same `BroadcastChannel` by default.)
4. Tap controller buttons → demo state changes.

For cross-device (controller on laptop, demo on headset), set a 6–8 digit PIN on the landing page first; both card links then carry `?transport=webrtc&room=<PIN>` and the WebSocket signaling kicks in.

---

## State-bus message protocol

The shape both clients (HTML and Android) speak over the DataChannel:

```js
{ kind: 'scan' }                         // operator pressed SCAN
{ kind: 'verdict', part: 'A'|'B'|'C' }   // operator pressed a verdict
{ kind: 'complete' }                     // operator pressed End Demo
{ kind: 'reset' }                        // operator pressed Reset
{ kind: 'ready' }                        // either client just loaded
{ kind: 'scene', name: '...' }           // telemetry: scene transition on the demo
{ kind: 'verdict-shown', part: '...' }   // telemetry: verdict actually displayed
```

Every message also gets a `_seq` field (timestamp-derived) to dedupe across retries.

---

## Deployment

Deployed to `https://demo.justintormey.com/ar-qc/` via S3 + CloudFront on every push to `main`. The pipeline is:

1. GitHub Actions checks out the repo, sets up Node 20.
2. `npm ci` + `npm run build` — Vite emits a static `dist/` with `base: '/ar-qc/'` rewritten into all asset URLs.
3. `aws s3 sync dist/ s3://justintormey.com/ar-qc/ --delete` via an OIDC-assumed IAM role (no long-lived keys in CI).
4. `aws cloudfront create-invalidation --paths "/ar-qc/*"` to flush the edge cache.

See [`infra/README.md`](infra/README.md) for the one-time IAM role setup.

---

## Why both an HTML version and an Android version

The HTML demo is the **lowest-friction path**: any browser, any device, any operating system, no install. It ships content as URLs.

But on the Digilens Argo specifically, Firefox is the default browser and its `getUserMedia` implementation hangs indefinitely on this hardware (no error, no prompt, no resolve — confirmed across multiple constraint shapes). So the HTML version can't show a live camera feed inside the scanning view. The Argo's see-through display compensates: the operator's hand and the metal parts are visible *through the lenses* in the empty space between our HUD overlays, which makes the demo feel AR even without a video element.

The native Android sibling (`ar-qc-android`) adds: real CameraX preview as the scanning background, real on-device ML Kit QR detection that fires verdicts automatically, and access to the platform's full camera + sensor stack. Same WebRTC protocol, same controller, same flow — but with the "real CV" beat that the HTML can't deliver inside Firefox.

---

## License

Internal demo. Not for redistribution.
