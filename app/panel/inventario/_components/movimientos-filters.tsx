"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, PackageSearch, X } from "lucide-react";
import { ProductPicker } from "@/app/components/product-search/product-picker";
import { Button } from "@/app/components/ui/button";
import { Select } from "@/app/components/ui/field";

type Filtros = { desde: string; hasta: string; tipo: string; producto: string };

const TIPOS = [
  { value: "entrada", label: "Entradas" },
  { value: "venta", label: "Ventas" },
  { value: "merma", label: "Mermas" },
  { value: "ajuste", label: "Ajustes" },
  { value: "cancelacion_venta", label: "Cancelaciones" },
];

const dateClass =
  "h-11 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/**
 * Filtros del historial en la URL (?desde=&hasta=&tipo=&producto=). Fechas en
 * días de Monterrey (el servidor las convierte a rango UTC). Cualquier cambio
 * regresa a la página 1.
 */
export function MovimientosFilters({
  current,
  productoNombre,
  hoy,
}: {
  current: Filtros;
  productoNombre: string | null;
  hoy: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [eligiendo, setEligiendo] = useState(false);

  function navigate(next: Partial<Filtros>) {
    const merged = { ...current, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    // Sin "pagina": cualquier cambio de filtro vuelve a la página 1.
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const hayFiltros = Object.values(current).some(Boolean);

  return (
    <section aria-label="Filtros" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <label htmlFor="f-tipo" className="text-sm font-medium">Tipo</label>
          <Select id="f-tipo" value={current.tipo} onChange={(e) => navigate({ tipo: e.target.value })}>
            <option value="">Todos</option>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {current.producto ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full bg-primary-soft py-1 pl-3.5 pr-1 text-sm font-medium text-primary">
            <span className="truncate">{productoNombre ?? "Producto"}</span>
            <button
              type="button"
              aria-label="Quitar filtro de producto"
              onClick={() => navigate({ producto: "" })}
              className="flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-primary/10"
            >
              <X aria-hidden className="size-4" />
            </button>
          </span>
        </div>
      ) : eligiendo ? (
        <div className="flex flex-col gap-2">
          <ProductPicker
            id="f-producto"
            onSelect={(p) => {
              setEligiendo(false);
              navigate({ producto: p.id });
            }}
          />
          <Button variant="ghost" className="self-start" onClick={() => setEligiendo(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setEligiendo(true)}
          icon={<PackageSearch aria-hidden className="size-[18px]" />}
        >
          Filtrar por producto
        </Button>
      )}

      <div className="flex min-h-6 items-center gap-3 text-sm">
        {pending ? (
          <span className="flex items-center gap-2 text-muted">
            <LoaderCircle aria-hidden className="size-4 animate-spin" /> Actualizando…
          </span>
        ) : null}
        {hayFiltros ? (
          <button
            type="button"
            onClick={() => navigate({ desde: "", hasta: "", tipo: "", producto: "" })}
            className="ml-auto font-medium text-primary hover:underline"
          >
            Quitar filtros
          </button>
        ) : null}
      </div>
    </section>
  );
}
