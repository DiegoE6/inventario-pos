import Link from "next/link";
import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatCents } from "@/app/lib/format";

/**
 * Tarjeta de indicador: etiqueta chica, número grande, y abajo un dato corto
 * (comparación o contexto). Si lleva href, toda la tarjeta es el enlace.
 */
export function StatCard({
  label,
  value,
  footer,
  href,
}: {
  label: string;
  value: ReactNode;
  footer?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="text-[26px] font-semibold leading-none tracking-tight sm:text-[32px]">{value}</p>
      {footer ? <div className="text-[13px] leading-snug">{footer}</div> : null}
    </>
  );
  const className =
    "flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4";

  if (href) {
    return (
      <Link
        href={href}
        className={`${className} transition-[transform,border-color] duration-150 ease-out hover:border-border-strong motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
      >
        {body}
      </Link>
    );
  }
  return <section className={className}>{body}</section>;
}

/**
 * Con `ajustar`, los montos largos se achican para caber en una tarjeta de
 * media pantalla a 360 px (124 px útiles a 26 px). Medido en Chrome con
 * Geist: "$99,999.99" ocupa 123.8 px a tamaño completo; con esta escala,
 * hasta "$9,999,999.99" queda en ≤ 111 px.
 */
function escalaMonto(entero: string): string | undefined {
  const n = entero.length; // "$9,999" = 6, "$99,999" = 7, "-$99,999" = 8
  return n <= 6 ? undefined : n === 7 ? "0.88em" : n === 8 ? "0.78em" : "0.7em";
}

/**
 * Dinero como número grande: los centavos más chicos para que quepa en media
 * pantalla de celular y el ojo lea primero los pesos ("$3,482" + ".50").
 */
export function MoneyFigure({ cents, ajustar = false }: { cents: number; ajustar?: boolean }) {
  const text = formatCents(cents);
  const dot = text.lastIndexOf(".");
  const entero = dot === -1 ? text : text.slice(0, dot);
  const size = ajustar ? escalaMonto(entero) : undefined;
  return (
    <span style={size ? { fontSize: size } : undefined}>
      {entero}
      {dot === -1 ? null : <span className="text-[0.6em] font-medium text-muted">{text.slice(dot)}</span>}
    </span>
  );
}

/** "+12% vs. jueves pasado". Sin dato para comparar no se pinta nada. */
export function Delta({ pct, dia }: { pct: number | null; dia: string }) {
  if (pct === null) return null;
  const sube = pct > 0;
  const igual = pct === 0;
  const Icon = sube ? TrendingUp : TrendingDown;
  const tono = igual ? "text-muted" : sube ? "text-success" : "text-danger";
  const texto = igual ? `Igual que el ${dia} pasado` : `${sube ? "+" : "−"}${Math.abs(pct)}% vs. ${dia} pasado`;
  return (
    <p className={`flex items-start gap-1 font-medium ${tono}`} title={`Comparado con el ${dia} pasado a esta misma hora`}>
      {igual ? null : <Icon aria-hidden className="mt-px size-4 shrink-0" />}
      <span>
        {texto}
        <span className="sr-only"> a esta misma hora</span>
      </span>
    </p>
  );
}
