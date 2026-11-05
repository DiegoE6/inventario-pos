import { TrendingDown, TrendingUp } from "lucide-react";
import { formatCents, UNIDAD_CORTA, type Unidad } from "@/app/lib/format";
import { computeMargin } from "@/app/lib/money";

const percent = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/**
 * Margen en vivo del formulario de producto. Recibe centavos ya parseados
 * (toCents), así que no hace cuentas con decimales flotantes.
 */
export function MarginPill({
  costoCents,
  precioCents,
  unidad,
}: {
  costoCents: number | null;
  precioCents: number | null;
  unidad: Unidad;
}) {
  const m = computeMargin(costoCents, precioCents);
  const u = UNIDAD_CORTA[unidad];

  if (m.kind === "empty") {
    return (
      <p
        aria-live="polite"
        className="inline-flex min-h-9 items-center rounded-full bg-surface-muted px-3.5 text-sm text-muted"
      >
        Captura costo y precio para ver tu margen
      </p>
    );
  }

  const loss = m.kind === "loss";
  return (
    <p
      aria-live="polite"
      className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium tabular-nums ${
        loss ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
      }`}
    >
      {loss ? (
        <TrendingDown aria-hidden className="size-4" />
      ) : (
        <TrendingUp aria-hidden className="size-4" />
      )}
      <span>
        Margen {percent.format(m.percent)}% ·{" "}
        {loss
          ? `Pierdes ${formatCents(-m.profitCents)} por ${u}`
          : `Ganas ${formatCents(m.profitCents)} por ${u}`}
      </span>
    </p>
  );
}
