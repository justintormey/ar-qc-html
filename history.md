# ar-qc-html — design history & decisions

A short record of how the demo got to its current shape — what was tried, what was dropped, and the reasoning behind each turn. Useful if you (or future-me) come back to this repo and wonder "why isn't this WebXR?"

## Project overview

Two browser-based AR demos served as one static site, for AR smart glasses with see-through waveguide displays.

- **AR QC Station** — quality-control inspection. Three 3D-printed parts on a table represent canonical PASS / REWORK / SCRAP examples. Operator drives verdicts via the controller; the Android sibling adds real ML Kit CV.
- **AR Builder** — assembly training, added as a sibling later in the project. Four 3D-printed angle brackets joined across three steps with velcro and string. Operator drives via six PASS/FAIL × A/B/C buttons; the Android sibling reads bracket-face QRs (including a compound `BP` AND `CP` check on step 3) directly from the camera.

Both demos share the WebRTC transport, the Room PIN landing page, the deploy pipeline, and the HUD primitives. They run under separate Room PINs (`471471` for QC, `526526` for Builder) so a single Argo can be paired with either controller without cross-talk.

## Architecture, at a glance

- **Three entry pages** sharing one state machine: `index.html` (landing), `demo.html` (headset HUD), `control.html` (operator controls). Plus `diag.html` for capability triage.
- **State-bus abstraction** at `src/transport/state-bus.js` selects one of three pub/sub backends via the URL `?transport=` param:
  - `BroadcastChannel` — same-device, same browser profile, used for local dev (default)
  - `WebRTC` — cross-device peer-to-peer DataChannel, signaling via an AWS API Gateway WebSocket relay (production)
  - `polling` — placeholder HTTP polling, not currently wired to a backend
- **Vite multi-page** build emits four static HTML files + chunked JS/CSS, all relative to a `base: '/ar-qc/'` subpath so it can be hosted under `/ar-qc/` on any static host.

## Decisions worth recording

### WebXR was the original plan; we pivoted to a flat HUD

The first iteration used Three.js + `immersive-ar` for world-locked AR overlays anchored to the conference table via hit-test. We even built setup-mode anchor placement, zone-based gaze triggering, and 3D ghost models.

It didn't ship because **Firefox on the Argo doesn't implement WebXR** (`navigator.xr` is undefined; confirmed via `diag.html`). Mozilla discontinued Firefox Reality years ago and vanilla Firefox-for-Android has never shipped it. We considered sideloading Wolvic (a WebXR-capable Chromium fork) but couldn't get an Argo-specific build that worked reliably.

The pivot: rebuild as a **flat fullscreen HUD** that the see-through waveguide naturally overlays onto the real workstation. The empty space between our corner brackets is the real world, visible through the lenses. We lost: 6DoF tracking, world-locked anchors, hand-tracked pinch interactions, the 3D bracket-rotation interaction. We kept: the verdict panels, scan-line animation, the L-profile reference model (now a small Three.js canvas embedded in the verdict scene rather than a world-anchored mesh), and the controller-driven flow.

The orphaned WebXR-era files (xr/, geometry/, persistence/, input/, scene meshes) were removed once we committed to the HUD path.

### Real CV was tried and dropped (for this version)

In HUD mode we briefly attempted live camera-feed scanning via `getUserMedia` and ML Kit-style barcode reading. Firefox on Argo hangs `getUserMedia` indefinitely — no prompt, no error, no timeout. Confirmed across four constraint shapes (modern bare, facingMode, by-deviceId, legacy callback). It's a hardware/driver-level breakage we can't fix from the browser.

We left the camera path in (`src/hud/camera.js`) as silent best-effort so it'll automatically light up if a future browser update fixes it, but the production demo doesn't depend on it.

### Smoke-and-mirrors over real CV

Even if `getUserMedia` worked, the demo deliberately uses **operator-driven verdicts** (the laptop controller buttons) rather than computer vision. Reasons:
- Demo reliability over technical sophistication
- The operator can adapt to whatever the participant is doing (pick up part B but the operator wants to demo C? Tap C.)
- The participant doesn't need a perfectly oriented part to get a "correct" detection

The Android sibling adds real QR-based detection as an upgrade path, but the operator override remains.

### AWS API Gateway WebSocket signaling

Cross-device WebRTC needs a signaling relay. We use a Portal-style AWS API Gateway WebSocket API (already deployed, see `src/transport/webrtc-transport.js` for the URL). One quirk worth noting: the message envelope must be `{action: 'sendmessage', data: {…}}` — API Gateway routes on `$request.body.action`. Sending a raw `{type: 'join'}` returns `{"message": "Forbidden"}` because no route matches.

### Subpath gotcha

We deploy to `/ar-qc/` (subpath of `demo.justintormey.com`). CloudFront serves `/ar-qc` (no trailing slash) and `/ar-qc/` (with) identically — but the browser's URL bar shows whichever the user typed. That breaks relative `href` resolution: when the URL is `/ar-qc` (no slash), `<a href="setup.html">` resolves to the root `/setup.html`, which 404s through to CloudFront's error fallback (the parent landing page).

Fix: a `<base href="/ar-qc/">` element in every HTML head. Relative URLs now resolve against the explicit base regardless of trailing-slash state.

### Connection-state telemetry

The operator controller shows a pill that reflects the WebRTC handshake state in plain English (`Connecting…`, `Signaling open — waiting for headset`, `Negotiating peer connection…`, `Connected to headset`, `Headset disconnected`). The verdict buttons stay visually + actually disabled until the pill goes green, so the operator can't tap into a void.

A similar pill in the demo page's top-right shows the headset's view of the same handshake.

### Same-device-mode warning banners

Multiple early bug reports turned out to be the same root cause: someone opened the demo or controller without going through the landing page's Room PIN flow, so `?transport=` was missing and the pages silently fell back to `BroadcastChannel` (same-device only). Now both pages detect that and show a prominent amber banner explaining the fix.

## Current state

- **QC state machine** (`src/demo.js`): five scenes — `Welcome` / `Scanning` / `VerdictA` / `VerdictB` / `VerdictC` / `Complete`.
- **Builder state machine** (`src/builder.js`): six scenes — `Welcome` / `Instructions(A|B|C)` / `Scanning` / `VerdictPass(part)` / `VerdictFail(part)` / `Complete`. Added as a sibling demo after QC shipped.
- QC controller has six buttons: SCAN (primary), PART A/B/C, End Demo, Reset. Builder controller has eight: SCAN, PASS A/B/C, FAIL A/B/C, End Demo, Reset.
- Five HTML entry points (`index.html`, `demo.html`, `control.html`, `builder.html`, `builder-control.html`) + `diag.html`. Source files in `src/` cover the state machines, controllers, transport, and HUD scenes.
- Production build is ~480 KB total, of which ~470 KB is Three.js (used only for the small reference-geometry canvas on the QC Verdict-B scene; a future optimization would defer-load that chunk so only QC's REWORK path pays the bundle cost).

## Unfinished work

- Defer-loading Three.js so only Verdict-B pays the bundle cost
- Wire a real polling endpoint as a `BroadcastChannel`-vs-`WebRTC` fallback for restrictive networks
- Persist the Room PIN across reloads (currently only landing remembers via localStorage; demo + control require the query string)

## Related

- [`ar-qc-android`](https://github.com/justintormey/ar-qc-android) — Kotlin/Compose port with real on-device camera + ML Kit QR detection. Same WebRTC protocol, same controller.
