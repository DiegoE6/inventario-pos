/**
 * Dinero como centavos enteros. Nunca se suman pesos con decimales flotantes:
 * 0.1 + 0.2 !== 0.3 en JavaScript.
 */

const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Convierte lo que captura el usuario ("12", "12.5", "12.50", "1,250.00")
 * a centavos enteros, sin pasar por float. Devuelve null si no es válido.
 */
export function toCents(input: string): number | null {
  const clean = input.trim().replace(/,/g, "");
  if (!MONEY_RE.test(clean)) return null;
  const [pesos, decimals = ""] = clean.split(".");
  return Number(pesos) * 100 + Number(decimals.padEnd(2, "0"));
}

export type Margin =
  | { kind: "empty" }
  | { kind: "gain" | "loss" | "zero"; percent: number; profitCents: number };

/**
 * Margen sobre el precio de venta: (precio − costo) / precio.
 * Es lo que el dueño reconoce como "le gano el 40%".
 */
export function computeMargin(costoCents: number | null, precioCents: number | null): Margin {
  if (costoCents === null || precioCents === null || precioCents === 0) {
    return { kind: "empty" };
  }
  const profitCents = precioCents - costoCents;
  const percent = Math.round((profitCents / precioCents) * 1000) / 10; // 1 decimal
  const kind = profitCents > 0 ? "gain" : profitCents < 0 ? "loss" : "zero";
  return { kind, percent, profitCents };
}
