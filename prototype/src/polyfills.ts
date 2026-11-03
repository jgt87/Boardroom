// Browsers expose crypto.randomUUID only in secure contexts (HTTPS or localhost). Opened from another
// machine over plain HTTP (for example http://192.168.1.52:5173), it is missing and every new id would
// fail. crypto.getRandomValues works in every context, so build a version 4 UUID from it.
// Imported first in main.tsx so it is in place before any other module runs.
export function randomUUIDFallback(): `${string}-${string}-${string}-${string}-${string}` {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', { value: randomUUIDFallback, configurable: true, writable: true });
}
