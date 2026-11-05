import type { CSSProperties } from "react";

/** Naranja por defecto (contraste 5.2:1 con blanco). Debe coincidir con globals.css. */
export const DEFAULT_PRIMARY = "#c2410c";

const DARK_TEXT = "#1c1917";
const LIGHT_TEXT = "#ffffff";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** true solo para #RRGGBB. Es lo único que se acepta antes de ponerlo en `style`. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** Luminancia relativa WCAG 2.x de un #RRGGBB. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Razón de contraste WCAG entre dos colores #RRGGBB (de 1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Color de texto sobre el primario: blanco o casi negro, el que contraste más. */
export function onColorFor(hex: string): string {
  return contrastRatio(hex, LIGHT_TEXT) >= contrastRatio(hex, DARK_TEXT)
    ? LIGHT_TEXT
    : DARK_TEXT;
}

/**
 * Variables CSS de marca para el `style` de un contenedor con `data-brand`.
 * Si el color no es un #RRGGBB válido, usa el de por defecto: nunca se mete
 * a `style` un valor que no se haya validado.
 */
export function brandStyle(color: unknown): CSSProperties {
  const primary = isHexColor(color) ? color.toLowerCase() : DEFAULT_PRIMARY;
  return {
    "--color-primary": primary,
    "--color-on-primary": onColorFor(primary),
  } as CSSProperties;
}
