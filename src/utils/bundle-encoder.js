/**
 * Bundle Encoder / Decoder Utility
 * Converts full preset bundles (including signal chain & Tone3000 metadata)
 * to compact, URL-safe base64 strings and vice-versa with full UTF-8 support.
 */

export function encodePresetBundle(bundle) {
  const jsonStr = JSON.stringify(bundle);
  const utf8Bytes = new TextEncoder().encode(jsonStr);
  let binary = '';
  const len = utf8Bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return encodeURIComponent(btoa(binary));
}

export function decodePresetBundle(encodedStr) {
  if (!encodedStr || typeof encodedStr !== 'string') {
    throw new Error('Invalid bundle string');
  }

  // Handle URL hash fragments like #preset=... or #share=...
  let cleanStr = encodedStr.trim();
  if (cleanStr.startsWith('#')) {
    cleanStr = cleanStr.substring(1);
  }
  if (cleanStr.startsWith('preset=') || cleanStr.startsWith('share=')) {
    cleanStr = cleanStr.split('=')[1];
  }

  const base64 = decodeURIComponent(cleanStr);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const jsonStr = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(jsonStr);

  if (!isValidPresetBundle(parsed)) {
    throw new Error('Bundle data is missing required preset structure');
  }

  return parsed;
}

export function isValidPresetBundle(bundle) {
  return (
    bundle &&
    typeof bundle === 'object' &&
    bundle.preset &&
    typeof bundle.preset === 'object' &&
    Array.isArray(bundle.preset.order) &&
    typeof bundle.preset.states === 'object' &&
    typeof bundle.preset.selectedEffects === 'object'
  );
}
