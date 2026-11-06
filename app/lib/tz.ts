/**
 * Fechas en America/Monterrey. Monterrey hoy no tiene horario de verano, pero
 * el desfase se obtiene con Intl (no se escribe "-06:00" a mano): si algún día
 * vuelve el horario de verano, esto sigue siendo correcto.
 */

export const TZ = "America/Monterrey";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" });
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export function isYmd(value: unknown): value is string {
  if (typeof value !== "string" || !YMD_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Desfase de Monterrey respecto a UTC en minutos para ese instante (−360 = UTC−6). */
function offsetMinutes(date: Date): number {
  const name = offsetFmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
}

/** Instante UTC en que empieza ese día en Monterrey ("2026-11-06" → 06:00Z). */
export function startOfDay(ymd: string): Date {
  const utcMidnight = Date.parse(`${ymd}T00:00:00Z`);
  let instant = new Date(utcMidnight - offsetMinutes(new Date(utcMidnight)) * 60_000);
  // Si el desfase cambia ese día (horario de verano), se recalcula una vez.
  const second = offsetMinutes(instant);
  instant = new Date(utcMidnight - second * 60_000);
  return instant;
}

/** "YYYY-MM-DD" + n días. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Hoy en Monterrey, "YYYY-MM-DD". */
export function todayYmd(now = new Date()): string {
  return ymdFmt.format(now);
}

/** Rango [desde, hasta+1) en UTC para filtrar timestamptz por días de Monterrey. */
export function dayRange(desde: string | null, hasta: string | null) {
  return {
    gte: desde ? startOfDay(desde).toISOString() : null,
    lt: hasta ? startOfDay(addDays(hasta, 1)).toISOString() : null,
  };
}

const fechaHora = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });

export function formatFechaHora(iso: string): string {
  return fechaHora.format(new Date(iso));
}
