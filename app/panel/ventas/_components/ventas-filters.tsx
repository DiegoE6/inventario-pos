"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Select } from "@/app/components/ui/field";

type Filtros = { desde: string; hasta: string; estado: string; metodo: string };

const dateClass =
  "h-11 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-base text-foreground focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary/20";

/**
 * Filtros en la URL (?desde=&hasta=&estado=&metodo=). Las fechas son días de
 * Monterrey; el servidor las convierte a rango UTC. Sin fechas en la URL, el
 * servidor aplica los últimos 7 días (porDefecto). Cualquier cambio regresa a
 * la página 1.
 */
export function VentasFilters({
  current,
  hoy,
  porDefecto,
}: {
  current: Filtros;
  hoy: string;
  porDefecto: { desde: string; hasta: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function navigate(next: Partial<Filtros>) {
    const merged = { ...current, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const hayFiltros =
    Boolean(current.estado || current.metodo) ||
    current.desde !== porDefecto.desde ||
    current.hasta !== porDefecto.hasta;

  return (
    <section aria-label="Filtros" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-desde" className="text-sm font-medium">Desde</label>
          <input
            id="f-desde"
            type="date"
            max={current.hasta || hoy}
            value={current.desde}
            onChange={(e) => navigate({ desde: e.target.value })}
            className={dateClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-hasta" className="text-sm font-medium">Hasta</label>
          <input
            id="f-hasta"
            type="date"
            min={current.desde || undefined}
            max={hoy}
            value={current.hasta}
            onChange={(e) => navigate({ hasta: e.target.value })}
            className={dateClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-estado" className="text-sm font-medium">Estado</label>
          <Select id="f-estado" value={current.estado} onChange={(e) => navigate({ estado: e.target.value })}>
            <option value="">Todas</option>
            <option value="completada">Completadas</option>
            <option value="cancelada">Canceladas</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-metodo" className="text-sm font-medium">Método</label>
          <Select id="f-metodo" value={current.metodo} onChange={(e) => navigate({ metodo: e.target.value })}>
            <option value="">Todos</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </Select>
        </div>
      </div>

      {pending || hayFiltros ? (
        <div className="flex min-h-6 items-center gap-3 text-sm">
          {pending ? (
            <span className="flex items-center gap-2 text-muted">
              <LoaderCircle aria-hidden className="size-4 animate-spin" /> Actualizando…
            </span>
          ) : null}
          {hayFiltros ? (
            <button
              type="button"
              onClick={() => navigate({ desde: "", hasta: "", estado: "", metodo: "" })}
              className="-my-2 ml-auto inline-flex min-h-11 items-center rounded-md px-2 font-medium text-primary-ink hover:underline focus-visible:outline-2 focus-visible:outline-primary-ink"
            >
              Últimos 7 días, sin filtros
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
