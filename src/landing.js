// Landing page: optional Room PIN input gets propagated as ?transport=webrtc
// &room=NNNNNN onto all three card links. With no PIN (or one outside the
// 6–8 digit window the Portal signaling server requires), links stay clean
// and the default BroadcastChannel transport is used (same-device only).

const STORAGE_KEY = 'argo-demo-room-pin';
const pinInput = document.getElementById('room-pin');
const pinStatus = document.getElementById('pin-status');
const links = document.querySelectorAll('a[data-link]');

const savedPin = localStorage.getItem(STORAGE_KEY) || '';
pinInput.value = savedPin;
update(savedPin);

pinInput.addEventListener('input', () => {
  const pin = pinInput.value.replace(/\D/g, '').slice(0, 8);
  pinInput.value = pin;
  localStorage.setItem(STORAGE_KEY, pin);
  update(pin);
});

function update(pin) {
  const valid = /^\d{6,8}$/.test(pin);

  // Update card links
  for (const a of links) {
    const base = a.getAttribute('href').split('?')[0];
    a.setAttribute('href', valid ? `${base}?transport=webrtc&room=${pin}` : base);
  }

  // Update status pill text + colour
  pinInput.classList.toggle('valid', valid);
  pinInput.classList.toggle('invalid', pin.length > 0 && !valid);
  pinStatus.classList.toggle('valid', valid);
  pinStatus.classList.toggle('invalid', pin.length > 0 && !valid);

  if (valid) {
    pinStatus.textContent = `✓ Cross-device WebRTC enabled — use the same PIN (${pin}) on both devices`;
  } else if (pin.length === 0) {
    pinStatus.textContent = 'Enter 6 digits to enable cross-device WebRTC';
  } else if (pin.length < 6) {
    pinStatus.textContent = `Need ${6 - pin.length} more digit${6 - pin.length === 1 ? '' : 's'} (minimum 6)`;
  } else {
    pinStatus.textContent = 'Too many digits (maximum 8)';
  }

  // Dim the cards visually until the PIN is valid OR empty (BroadcastChannel
  // mode is intentional for local dev so don't gray them out then)
  for (const a of links) {
    a.classList.toggle('needs-pin', pin.length > 0 && !valid);
  }
}

console.info('[argo-demo] landing ready');
