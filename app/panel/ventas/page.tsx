import type { Metadata } from "next";
import { Notice } from "@/app/components/notice";
import { PageHeader } from "@/app/components/page-header";
import { Pagination } from "@/app/components/pagination";
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

        {error ? null : (
          <VentaList
            ventas={ventas}
            vacio={
              total > 0
                ? "No hay ventas en esta página."
                : hayFiltros
                  ? "No hay ventas con estos filtros."
                  : "No hay ventas en los últimos 7 días. Cambia las fechas para ver otras."
            }
          />
        )}

        <Pagination pagina={query.pagina} paginas={paginas} href={(n) => href(query, n)} />
      </section>
    </>
  );
}
