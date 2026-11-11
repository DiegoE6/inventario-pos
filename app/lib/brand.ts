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

/** Fondos claros sobre los que aparece la tinta (deben coincidir con globals.css). */
const SURFACES = ["#ffffff", "#fafaf9", "#f5f5f4"];

function mix(hex: string, target: string, amount: number): string {
  const out = [1, 3, 5].map((i) => {
    const a = parseInt(hex.slice(i, i + 2), 16);
    const b = parseInt(target.slice(i, i + 2), 16);
    return Math.round(a + (b - a) * amount)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${out.join("")}`;
}

/**
 * Tinta de marca: el primario oscurecido lo justo para leerse como texto
 * (≥ 4.5:1, WCAG 1.4.3) sobre blanco, el fondo de la app, el gris de las
 * tarjetas y el fondo suave del primario (`primary-soft`, ~10 % del color).
 * Como texto cumple 4.5:1, también cumple el 3:1 de contornos de foco,
 * bordes y barras de gráficas (WCAG 1.4.11). Si el primario ya contrasta,
 * se usa tal cual.
 */
export function primaryInk(hex: string): string {
  const fondos = [...SURFACES, mix(hex, "#ffffff", 0.9)];
  // 4.6 en lugar de 4.5: margen para la mezcla en OKLab que hace el CSS.
  const ok = (c: string) => fondos.every((f) => contrastRatio(c, f) >= 4.6);
  for (let paso = 0; paso <= 50; paso++) {
    const c = mix(hex, "#000000", paso / 50);
    if (ok(c)) return c;
  }
  return DARK_TEXT;
}

/**
 * Tinta atenuada: la tinta aclarada hacia blanco lo más posible sin bajar de
 * 3:1 sobre los fondos claros (WCAG 1.4.11). Para marcas secundarias, como
 * las barras no seleccionadas de una gráfica: se distinguen de la tinta y
 * siguen siendo visibles.
 */
export function primaryInkMuted(ink: string): string {
  for (let paso = 30; paso >= 0; paso--) {
    const c = mix(ink, "#ffffff", paso / 50);
    if (SURFACES.every((f) => contrastRatio(c, f) >= 3.1)) return c;
  }
  return ink;
}

// -----------------------------------------------------------------------------
// Modo oscuro. Superficies oscuras (deben coincidir con globals.css).
// -----------------------------------------------------------------------------
const DARK_SURFACES = ["#0c0a09", "#1c1917", "#292524"];
const DARK_SURFACE = "#1c1917";

/**
 * Tinta para fondo oscuro: el primario ACLARADO hasta ≥ 4.6:1 sobre las
 * superficies oscuras y sobre su propio fondo suave (~16 % sobre la tarjeta).
 * Es el equivalente de primaryInk, pero al revés.
 */
export function primaryInkOscuro(hex: string): string {
  for (let paso = 0; paso <= 50; paso++) {
    const c = mix(hex, "#ffffff", paso / 50);
    const fondos = [...DARK_SURFACES, mix(DARK_SURFACE, c, 0.16)];
    if (fondos.every((f) => contrastRatio(c, f) >= 4.6)) return c;
  }
  return "#fafaf9";
}

/** Tinta atenuada en oscuro: la tinta hacia la superficie, sin bajar de 3:1. */
export function primaryInkMutedOscuro(ink: string): string {
  for (let paso = 30; paso >= 0; paso--) {
    const c = mix(ink, DARK_SURFACE, paso / 50);
    if (DARK_SURFACES.every((f) => contrastRatio(c, f) >= 3.1)) return c;
  }
  return ink;
}

/**
 * Relleno de botones en oscuro: el primario tal cual si ya se distingue de
 * las superficies oscuras (≥ 3:1, WCAG 1.4.11); si no (un azul marino),
 * aclarado lo justo. El texto encima se vuelve a elegir (blanco o negro).
 */
export function primaryOscuro(hex: string): string {
  for (let paso = 0; paso <= 50; paso++) {
    const c = mix(hex, "#ffffff", paso / 50);
    if (DARK_SURFACES.slice(0, 2).every((f) => contrastRatio(c, f) >= 3)) return c;
  }
  return hex;
}

/** Color de marca validado (o el de por defecto), en minúsculas. */
export function safePrimary(color: unknown): string {
  return isHexColor(color) ? color.toLowerCase() : DEFAULT_PRIMARY;
}

/** Todas las versiones del color de marca: claro y oscuro. */
export function paletaMarca(color: unknown) {
  const primary = safePrimary(color);
  const ink = primaryInk(primary);
  const primaryDark = primaryOscuro(primary);
  const inkDark = primaryInkOscuro(primary);
  return {
    primary,
    onPrimary: onColorFor(primary),
    ink,
    inkMuted: primaryInkMuted(ink),
    primaryDark,
    onPrimaryDark: onColorFor(primaryDark),
    inkDark,
    inkMutedDark: primaryInkMutedOscuro(inkDark),
  };
}

/**
 * Variables CSS de marca para el `style` del elemento con `data-brand`
 * (`<html>` y la vista previa de Configuración). Son `--brand-…`, con las dos
 * versiones: globals.css elige la clara o la oscura y las pasa a los tokens
 * `--color-primary…`. (Un style en línea le gana a cualquier regla CSS: si
 * aquí se escribiera --color-primary-ink, el modo oscuro no podría cambiarlo.)
 *
 * Si el color no es un #RRGGBB válido, usa el de por defecto: nunca se mete
 * a `style` un valor que no se haya validado.
 */
export function brandStyle(color: unknown): CSSProperties {
  const p = paletaMarca(color);
  return {
    "--brand-primary": p.primary,
    "--brand-on-primary": p.onPrimary,
    "--brand-ink": p.ink,
    "--brand-ink-muted": p.inkMuted,
    "--brand-primary-oscuro": p.primaryDark,
    "--brand-on-primary-oscuro": p.onPrimaryDark,
    "--brand-ink-oscuro": p.inkDark,
    "--brand-ink-muted-oscuro": p.inkMutedDark,
  } as CSSProperties;
}

/** Lo único que acepta configuracion_negocio.logo_url (CHECK de docs/sql/28). */
export const LOGO_PATH_RE = /^\/storage\/v1\/object\/public\/marca\/logo\?v=\d+$/;

/**
 * URL completa del logo: la BD guarda solo la ruta relativa y aquí se le
 * antepone la URL del proyecto. Cualquier otra cosa → null (sin logo).
 */
export function logoSrc(logoUrl: string | null | undefined, supabaseUrl: string): string | null {
  if (!logoUrl || !LOGO_PATH_RE.test(logoUrl)) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}${logoUrl}`;
}

/**
 * Nombre del negocio para nombres de archivo: sin acentos, solo a-z, 0-9 y
 * guiones, máximo 40 caracteres. "" si no queda nada.
 */
export function slugNegocio(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/**
 * Nombre de un Excel exportado: "ferreteria-la-tuerca-ventas-2026-11-01-a-2026-11-11.xlsx".
 * Sin nombre de negocio usable, solo el tipo y la fecha. `base` lo arma el
 * código (tipo y fechas YYYY-MM-DD), nunca el usuario.
 */
export function nombreArchivo(nombreNegocio: string | null | undefined, base: string): string {
  const slug = slugNegocio(nombreNegocio);
  return `${slug ? `${slug}-` : ""}${base}.xlsx`;
}
