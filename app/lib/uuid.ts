/**
 * UUID v4. crypto.randomUUID solo existe en contextos seguros (https o
 * localhost); al abrir la app por http con la IP de la red no está. En ese
 * caso se arma con crypto.getRandomValues, que sí existe en cualquier contexto.
 */
export function uuidv4(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();

  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // versión 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
