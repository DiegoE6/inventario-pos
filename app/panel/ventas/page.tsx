import type { Metadata } from "next";
import Link from "next/link";
import { Download, Receipt } from "lucide-react";
import { EstadoVacio } from "@/app/components/estado";
import { Notice } from "@/app/components/notice";
import { PageHeader } from "@/app/components/page-header";
import { Pagination } from "@/app/components/pagination";
import { buttonClasses } from "@/app/components/ui/button";
import { verifySession } from "@/app/lib/auth";
import { todayYmd } from "@/app/lib/tz";
import {
  listVentas,
  parseVentasQuery,
  rangoPorDefecto,
  VENTAS_PAGE_SIZE,
  type VentasQuery,
} from "@/app/lib/ventas";
import { VentaList } from "./_components/venta-list";
import { VentasFilters } from "./_components/ventas-filters";

export const metadata: Metadata = { title: "Ventas" };

function href(q: VentasQuery, pagina: number) {
  const params = new URLSearchParams();
  if (q.desde) params.set("desde", q.desde);
  if (q.hasta) params.set("hasta", q.hasta);
  if (q.estado) params.set("estado", q.estado);
  if (q.metodo) params.set("metodo", q.metodo);
  if (pagina > 1) params.set("pagina", String(pagina));
  const qs = params.toString();
  return qs ? `/panel/ventas?${qs}` : "/panel/ventas";
}

export default async function VentasPage({ searchParams }: PageProps<"/panel/ventas">) {
  const [session, sp] = await Promise.all([verifySession(), searchParams]);
  const hoy = todayYmd();
  const porDefecto = rangoPorDefecto(hoy);
  const query = parseVentasQuery(sp, hoy);
  // La RLS decide: el dueño ve todas; el cajero, solo las suyas.
  const { ventas, total, paginas, error } = await listVentas(query);

  const desde = (query.pagina - 1) * VENTAS_PAGE_SIZE + 1;
  const hasta = desde + ventas.length - 1;
  const esPorDefecto = query.desde === porDefecto.desde && query.hasta === porDefecto.hasta;
  const hayFiltros = Boolean(query.estado || query.metodo) || !esPorDefecto;

  return (
    <>
      <PageHeader
        title="Ventas"
        description={session.rol === "dueno" ? "Todas las ventas del negocio" : "Tus ventas"}
        actions={
          session.rol === "dueno" ? (
            // Exporta lo mismo que muestra la lista (fechas, estado y método), todas las páginas.
            <a
              href={href(query, 1).replace("/panel/ventas", "/panel/ventas/exportar")}
              download
              className={buttonClasses({ variant: "secondary" })}
            >
              <Download aria-hidden className="size-[18px]" />
              Exportar a Excel
            </a>
          ) : undefined
        }
      />

      <VentasFilters
        current={{
          desde: query.desde ?? "",
          hasta: query.hasta ?? "",
          estado: query.estado ?? "",
          metodo: query.metodo ?? "",
        }}
        hoy={hoy}
        porDefecto={porDefecto}
      />

      <section aria-label="Lista de ventas" className="flex flex-col gap-3">
        {error ? <Notice tone="danger">No se pudieron cargar las ventas. Recarga la página.</Notice> : null}

        {ventas.length > 0 ? (
          <p className="text-sm text-muted tabular-nums" aria-live="polite">
            {total === ventas.length
              ? `${total} ${total === 1 ? "venta" : "ventas"}`
              : `${desde}–${hasta} de ${total} ventas`}
          </p>
        ) : null}

        {error ? null : ventas.length > 0 ? (
          <VentaList ventas={ventas} vacio="" />
        ) : total > 0 ? (
          <EstadoVacio
            icon={Receipt}
            titulo="No hay ventas en esta página"
            acciones={
              <Link href={href(query, 1)} className={buttonClasses({ variant: "secondary" })}>
                Ir a la primera página
              </Link>
            }
          />
        ) : hayFiltros ? (
          <EstadoVacio
            icon={Receipt}
            titulo="No hay ventas con estos filtros"
            acciones={
              <Link href="/panel/ventas" className={buttonClasses({ variant: "secondary" })}>
                Quitar filtros
              </Link>
            }
          >
            Prueba con otras fechas, otro estado o cualquier método de pago.
          </EstadoVacio>
        ) : (
          <EstadoVacio
            icon={Receipt}
            titulo="No hay ventas en los últimos 7 días"
            acciones={
              <Link href="/panel/vender" className={buttonClasses()}>
                Ir a Vender
              </Link>
            }
          >
            Cuando cobres, aquí aparece cada venta con su ticket. Para ver otras fechas, cambia el rango.
          </EstadoVacio>
        )}

        <Pagination pagina={query.pagina} paginas={paginas} href={(n) => href(query, n)} />
      </section>
    </>
  );
}
