"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { Atajo } from "@/app/lib/reportes";

const dateClass =
  "h-11 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/**
 * Rango del reporte en la URL: atajos (?rango=semana) o fechas (?desde=&hasta=).
 * El servidor valida el rango (máximo 366 días) y recalcula todo en la base.
 */
export function RangePicker({
  atajos,
  atajo,
  desde,
  hasta,
  hoy,
  resumen,
}: {
  atajos: { valor: Atajo; label: string }[];
  atajo: Atajo | null;
  desde: string;
  hasta: string;
  hoy: string;
  resumen: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function go(params: Record<string, string>) {
    const qs = new URLSearchParams(params).toString();
    startTransition(() => router.replace(`${pathname}?${qs}`, { scroll: false }));
  }

  return (
    <section aria-label="Rango del reporte" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div role="group" aria-label="Atajos" className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] bg-surface-muted p-1 sm:grid-cols-4">
        {atajos.map((a) => {
          const actual = a.valor === atajo;
          return (
            <button
              key={a.valor}
              type="button"
              aria-pressed={actual}
              onClick={() => go({ rango: a.valor })}
              className={`flex h-9 items-center justify-center rounded-[8px] px-3 text-sm font-medium transition-[transform,background-color,color] duration-150 ease-out motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-primary ${
                actual ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-desde" className="text-sm font-medium">Desde</label>
          <input
            id="r-desde"
            type="date"
            required
            max={hasta || hoy}
            value={desde}
            onChange={(e) => e.target.value && go({ desde: e.target.value, hasta })}
            className={dateClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-hasta" className="text-sm font-medium">Hasta</label>
          <input
            id="r-hasta"
            type="date"
            required
            min={desde || undefined}
            value={hasta}
            onChange={(e) => e.target.value && go({ desde, hasta: e.target.value })}
            className={dateClass}
          />
        </div>
      </div>

      <p className="flex min-h-5 items-center gap-2 text-sm text-muted" aria-live="polite">
        {pending ? (
          <>
            <LoaderCircle aria-hidden className="size-4 animate-spin" /> Calculando…
          </>
        ) : (
          resumen
        )}
      </p>
    </section>
  );
}
