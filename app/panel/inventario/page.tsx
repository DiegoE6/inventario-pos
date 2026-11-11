import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, History, PackageMinus, PackagePlus } from "lucide-react";
import { EstadoVacio } from "@/app/components/estado";
import { buttonClasses } from "@/app/components/ui/button";
import { PageHeader } from "@/app/components/page-header";
import { Pagination } from "@/app/components/pagination";
import { requireDueno } from "@/app/lib/auth";
import { getProducto } from "@/app/lib/data";
import { listMovimientos, MOV_PAGE_SIZE, parseMovimientosQuery, type MovimientosQuery } from "@/app/lib/inventario";
import { todayYmd } from "@/app/lib/tz";
import { MovimientoList } from "./_components/movimiento-list";
import { MovimientosFilters } from "./_components/movimientos-filters";

export const metadata: Metadata = { title: "Inventario" };

const ACCIONES = [
  { href: "/panel/inventario/entrada", label: "Entrada", detalle: "Llegó mercancía", icon: PackagePlus },
  { href: "/panel/inventario/merma", label: "Merma", detalle: "Se rompió o perdió", icon: PackageMinus },
  { href: "/panel/inventario/conteo", label: "Conteo", detalle: "Ajustar con lo que hay", icon: ClipboardCheck },
];

function href(q: MovimientosQuery, pagina: number) {
  const params = new URLSearchParams();
  if (q.desde) params.set("desde", q.desde);
  if (q.hasta) params.set("hasta", q.hasta);
  if (q.tipo) params.set("tipo", q.tipo);
  if (q.producto) params.set("producto", q.producto);
  if (pagina > 1) params.set("pagina", String(pagina));
  const qs = params.toString();
  return qs ? `/panel/inventario?${qs}` : "/panel/inventario";
}

export default async function InventarioPage({ searchParams }: PageProps<"/panel/inventario">) {
  await requireDueno();
  const query = parseMovimientosQuery(await searchParams);

  const [{ movimientos, total, paginas }, producto] = await Promise.all([
    listMovimientos(query),
    query.producto ? getProducto(query.producto) : Promise.resolve(null),
  ]);

  const desde = (query.pagina - 1) * MOV_PAGE_SIZE + 1;
  const hasta = desde + movimientos.length - 1;
  // Las acciones abren con el producto filtrado ya elegido.
  const conProducto = (base: string) => (query.producto ? `${base}?producto=${query.producto}` : base);

  return (
    <>
      <PageHeader title="Inventario" />

      <nav aria-label="Registrar" className="grid grid-cols-3 gap-2">
        {ACCIONES.map(({ href: h, label, detalle, icon: Icon }) => (
          <Link
            key={h}
            href={conProducto(h)}
            className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-border bg-surface p-3 text-center transition-[transform,border-color] duration-150 ease-out hover:border-border-strong motion-safe:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
          >
            <Icon aria-hidden className="size-6 text-primary-ink" />
            <span className="text-base font-semibold">{label}</span>
            <span className="hidden text-[13px] text-muted sm:block">{detalle}</span>
          </Link>
        ))}
      </nav>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Historial</h2>
        <MovimientosFilters
          current={{
            desde: query.desde ?? "",
            hasta: query.hasta ?? "",
            tipo: query.tipo ?? "",
            producto: query.producto ?? "",
          }}
          productoNombre={producto?.nombre ?? null}
          hoy={todayYmd()}
          sinResultados={total === 0}
        />

        {movimientos.length > 0 ? (
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {total === movimientos.length
              ? `${total} ${total === 1 ? "movimiento" : "movimientos"}`
              : `${desde}–${hasta} de ${total} movimientos`}
          </p>
        ) : null}

        {movimientos.length > 0 ? (
          <MovimientoList movimientos={movimientos} />
        ) : total > 0 ? (
          <EstadoVacio
            icon={History}
            titulo="No hay movimientos en esta página"
            acciones={
              <Link href={href(query, 1)} className={buttonClasses({ variant: "secondary" })}>
                Ir a la primera página
              </Link>
            }
          />
        ) : (
          <EstadoVacio
            icon={History}
            titulo="No hay movimientos con estos filtros"
            acciones={
              <Link href="/panel/inventario" className={buttonClasses({ variant: "secondary" })}>
                Quitar filtros
              </Link>
            }
          >
            Cada venta, entrada, merma y conteo queda aquí. Prueba con otras fechas u otro tipo.
          </EstadoVacio>
        )}

        <Pagination pagina={query.pagina} paginas={paginas} href={(n) => href(query, n)} />
      </section>
    </>
  );
}
