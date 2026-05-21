// Renders an auto-rotating L-profile bracket into a canvas using Three.js.
// Used as a decorative reference-geometry hologram next to the Part B
// (REWORK) verdict panel. The L-shape is a generic "this is what spec
// looks like" callout — not tied to the specific 3D-printed part's
// geometry. File name + shape are historical from the sheet-metal era of
// the demo; kept because the visual still reads as a useful reference.

import * as THREE from 'three';

export function renderLProfile(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(canvas.clientWidth || 320, canvas.clientHeight || 240, false);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    35,
    (canvas.clientWidth || 320) / (canvas.clientHeight || 240),
    0.01, 10,
  );
  camera.position.set(0.16, 0.12, 0.22);
  camera.lookAt(0, 0.04, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2030, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(0.3, 0.5, 0.4);
  scene.add(dir);

  // Construct the L-profile from two thin extruded plates joined at a 90° corner.
  const thickness = 0.005;
  const width = 0.08;
  const legLength = 0.07;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x9adcff,
    metalness: 0.35,
    roughness: 0.45,
    emissive: 0x0c2a3a,
    emissiveIntensity: 0.6,
  });

  const lprofile = new THREE.Group();
  const horizontal = new THREE.Mesh(
    new THREE.BoxGeometry(width, thickness, legLength),
    mat,
  );
  horizontal.position.set(0, 0, -legLength / 2);
  lprofile.add(horizontal);

  const vertical = new THREE.Mesh(
    new THREE.BoxGeometry(width, legLength, thickness),
    mat,
  );
  vertical.position.set(0, legLength / 2, 0);
  lprofile.add(vertical);

  // 90° angle indicator
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(0.014, 0.016, 24, 1, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x6ee7ff, side: THREE.DoubleSide }),
  );
  arc.rotation.y = -Math.PI / 2;
  lprofile.add(arc);

  scene.add(lprofile);

  let raf = 0;
  let start = performance.now();
  function tick(now) {
    const t = (now - start) / 1000;
    lprofile.rotation.y = t * 0.45;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // Stop animation when the canvas leaves the DOM.
  const obs = new MutationObserver(() => {
    if (!document.body.contains(canvas)) {
      cancelAnimationFrame(raf);
      renderer.dispose();
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}
