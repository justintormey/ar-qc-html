# AR QC Station + AR Builder — HTML demos

Two browser-based AR demonstrations served as a single static site, for use on AR smart glasses with see-through waveguide displays (built and tested on a Digilens Argo, but works on any modern browser with WebRTC). Each demo pairs an operator's laptop **controller** with a participant's **headset** over a WebRTC room.

- **AR QC Station** — quality-control inspection. Three 3D-printed parts on the table represent canonical PASS / REWORK / SCRAP examples (smooth vs. warped vs. failed prints). Operator taps `PART A` / `PART B` / `PART C` and the headset plays the matching verdict — supporting detail rows (surface finish, vent openings, warp, layer adhesion), a "place in zone" cue, and a sweeping cyan scan-line.
- **AR Builder** — assembly training. Four 3D-printed angle brackets joined across three steps using velcro and string. Operator drives via six PASS/FAIL × A/B/C buttons (or wearer drives via the in-headset scroll wheel on the Android version). The headset shows per-step instructions, scanning, and step-specific verdict panels.

There's a [native Android sibling project](https://github.com/justintormey/ar-qc-android) (`ar-qc-android`) that ports both flows to Kotlin/Compose APKs with real on-device camera + ML Kit QR detection (including a compound BP+CP QR check for Builder step 3). The HTML and Android clients interoperate over the same WebRTC rooms.

**Live:** [https://demo.justintormey.com/ar-qc/](https://demo.justintormey.com/ar-qc/)

---

## What you see

Five web pages share two state machines (one for QC, one for Builder) over WebRTC.

| URL | Audience | What it does |
|---|---|---|
| `/ar-qc/` | Either device | Landing page with two cards (QC, Builder) + Room PIN input. |
| `/ar-qc/demo.html` | QC · Headset | Fullscreen HUD: Welcome → Scanning → Verdict A/B/C → Complete. |
| `/ar-qc/control.html` | QC · Operator | SCAN button + three colored verdict buttons + End Demo. Default PIN `471471`. |
| `/ar-qc/builder.html` | Builder · Headset | Fullscreen HUD: Welcome → Instructions → Scanning → VerdictPass/Fail → Complete (six scenes). |
| `/ar-qc/builder-control.html` | Builder · Operator | SCAN + six PASS/FAIL × A/B/C buttons + End / Reset. Default PIN `526526`. |
| `/ar-qc/diag.html` | Either | Capability check (WebXR / RTC / camera) for triage. |

### QC flow

1. Operator opens the landing page on the laptop, types Room PIN `471471`, opens the **QC Controller** card.
2. Participant opens the landing page on the headset (or on the Android sibling, opens the `QC` app), types the same PIN, opens **Start QC**.
3. Both devices show a green "connected" pill at the top-right within ~5 seconds.
4. Operator taps **SCAN** → headset shows the scan animation (cyan corner brackets + sweeping line).
5. Participant picks up any of the three 3D-printed parts.
6. Operator decides which verdict applies (A / B / C) and taps the matching button → headset shows the verdict overlay.
7. Repeat until done; tap **End Demo** for a summary.

### Builder flow

1. Operator opens the landing page, types Room PIN `526526`, opens **Builder Controller**.
2. Participant opens **Start Builder** on the headset with the same PIN.
3. Operator taps **SCAN** → headset enters Step 1 instructions (attach A + B with velcro, T-shape).
4. Participant assembles, then operator taps **PASS A** or **FAIL A** (or, on the Android sibling, the camera reads the AP/AF QR exposed by the orientation chosen).
5. Repeat for Step 2 (C-onto-B with string, BP/BF) and Step 3 (D opposing C, CP/CF — Android requires both `BP` and `CP` visible for PASS).
6. Operator taps **End Demo** → headset shows session summary.

Reset goes back to Welcome on either demo.

---

## Repo layout

```
ar-qc-html/
├── index.html               # Landing page with QC + Builder cards + Room PIN input
├── demo.html                # QC headset HUD entry point
├── control.html             # QC operator controller entry point
├── builder.html             # Builder headset HUD entry point
├── builder-control.html     # Builder operator controller entry point
├── diag.html                # Browser capability diagnostic
├── vite.config.js           # Multi-page Vite config (base path = /ar-qc/)
├── package.json
├── src/
│   ├── style.css            # Landing + controller + diagnostic page styles
│   ├── landing.js           # Room PIN input; rewrites card links with ?transport=webrtc&room=…
│   ├── demo.js              # QC scene state machine (Welcome → Scanning → Verdict → Complete)
│   ├── builder.js           # Builder scene state machine (Welcome → Instructions → Scanning → Verdict → Complete)
│   ├── control.js           # QC controller button wiring + connection pill
│   ├── builder-control.js   # Builder controller wiring (6 verdict buttons + SCAN + End/Reset)
│   ├── diag.js              # Capability probe + camera probe buttons
│   ├── hud/
│   │   ├── style.css        # HUD-specific styles (corner brackets, scan line, panels)
│   │   ├── scenes.js        # QC DOM-rendered scenes
│   │   ├── builder-scenes.js # Builder DOM-rendered scenes (per-step instructions + verdicts)
│   │   ├── l-profile.js     # Three.js mini-canvas — decorative reference-geometry hologram on the QC REWORK scene
│   │   └── camera.js        # Best-effort getUserMedia (kept for future browsers; currently no-op on the Argo)
│   └── transport/
│       ├── state-bus.js     # Pub/sub abstraction over BroadcastChannel | WebRTC | polling
│       └── webrtc-transport.js  # WebRTC peer + AWS API Gateway WebSocket signaling
├── infra/
│   ├── README.md            # One-time AWS setup (IAM role + S3 prefix + CloudFront invalidations)
│   ├── iam-trust-policy.json
│   └── iam-permissions-policy.json
└── .github/workflows/deploy.yml   # GHA: on push to main, build + sync to S3 + invalidate CloudFront
```

### What's where, conceptually

- **`src/transport/`** is the layer that gets a message from the operator's tap to the headset's screen. Three implementations live behind one interface (`createStateBus`): `BroadcastChannel` (same-device dev), `polling` (HTTP-based fallback), and `WebRTC` (cross-device production). The HTML pages don't know or care which one is in use — the URL query param picks it. Shared by both QC and Builder.

- **`src/hud/`** is everything that draws inside the headset's view: corner brackets, scan animation, verdict panels. Pure DOM + a small Three.js canvas (`l-profile.js`) that renders a decorative reference-geometry hologram on the QC REWORK scene.

- **`src/demo.js`** owns the QC state machine (5 distinct states: `Welcome` / `Scanning` / `VerdictA` / `VerdictB` / `VerdictC` / `Complete`). **`src/builder.js`** owns the Builder state machine (6 states: `Welcome` / `Instructions(A|B|C)` / `Scanning` / `VerdictPass(part)` / `VerdictFail(part)` / `Complete`). Both are driven by `BusMessage`s from the bus; same shapes as the Android port.

- **`src/control.js`** + **`src/builder-control.js`** own their controllers' button wiring, connection pills, and event logs.

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

The shape both clients (HTML and Android) and both demos (QC and Builder) speak over the DataChannel. Builder-specific shapes co-exist with QC shapes; clients that don't recognize a `kind` simply ignore it.

```js
{ kind: 'scan' }                                              // operator pressed SCAN
{ kind: 'verdict', part: 'A'|'B'|'C' }                        // QC verdict
{ kind: 'builder-verdict', part: 'A'|'B'|'C', result: 'pass'|'fail' }  // Builder verdict
{ kind: 'next' }                                              // Builder: advance to next step
{ kind: 'complete' }                                          // operator pressed End Demo
{ kind: 'reset' }                                             // operator pressed Reset
{ kind: 'ready' }                                             // either client just loaded
{ kind: 'scene', name: '...' }                                // telemetry: scene transition on the demo
{ kind: 'verdict-shown', part: '...', result?: 'pass'|'fail' } // telemetry: verdict actually displayed
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

But on the Digilens Argo specifically, Firefox is the default browser and its `getUserMedia` implementation hangs indefinitely on this hardware (no error, no prompt, no resolve — confirmed across multiple constraint shapes). So the HTML version can't show a live camera feed inside the scanning view. The Argo's see-through display compensates: the operator's hand and the 3D-printed parts are visible *through the lenses* in the empty space between our HUD overlays, which makes the demo feel AR even without a video element.

The native Android sibling (`ar-qc-android`) adds: real CameraX preview as the scanning background, real on-device ML Kit QR detection that fires verdicts automatically, and access to the platform's full camera + sensor stack. Same WebRTC protocol, same controller, same flow — but with the "real CV" beat that the HTML can't deliver inside Firefox.

---

## License

Internal demo. Not for redistribution.
