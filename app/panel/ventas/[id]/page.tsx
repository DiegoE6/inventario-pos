import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Ban } from "lucide-react";
import { PageHeader } from "@/app/components/page-header";
import { formatFolio, METODO_LABEL, type TicketData } from "@/app/components/ticket";
import { verifySession } from "@/app/lib/auth";
import { getConfiguracion } from "@/app/lib/data";
import { formatMoney, formatQuantity } from "@/app/lib/format";
import { formatFechaHora } from "@/app/lib/tz";
import { getVenta } from "@/app/lib/ventas";
import { CancelVenta } from "../_components/cancel-venta";
import { ReprintButton } from "../_components/reprint-button";
import { EstadoBadge } from "../_components/venta-list";

export async function generateMetadata({ params }: PageProps<"/panel/ventas/[id]">): Promise<Metadata> {
  const { id } = await params;
  const venta = await getVenta(id);
  return { title: venta ? `Venta ${formatFolio(venta.folio)}` : "Venta" };
}

export default async function VentaPage({ params }: PageProps<"/panel/ventas/[id]">) {
  const [session, { id }] = await Promise.all([verifySession(), params]);
  // Si la RLS no deja verla (venta de otro cajero), es igual que no existir.
  const [venta, config] = await Promise.all([getVenta(id), getConfiguracion()]);
  if (!venta) notFound();

  const folio = formatFolio(venta.folio);
  const cancelada = venta.estado === "cancelada";
  const esDueno = session.rol === "dueno";

  const ticket: TicketData = {
    folio: venta.folio,
    fecha: venta.creadoEn,
    metodo: venta.metodo,
    total: venta.total,
    recibido: venta.recibido,
    cambio: venta.cambio,
    atendio: venta.atendio ?? "",
    items: venta.items,
    negocio: {
        nombre: config.nombre,
        direccion: config.direccion,
        telefono: config.telefono,
        logo_url: config.logo_url,
      },
    cancelada,
  };

  return (
    <>
      <PageHeader
        back={{ href: "/panel/ventas", label: "Ventas" }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">Venta {folio}</span>
            <EstadoBadge estado={venta.estado} />
          </span>
        }
        description={formatFechaHora(venta.creadoEn)}
      />

      {cancelada ? (
        <section
          aria-label="Cancelación"
          className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-danger/25 bg-danger-soft p-4 text-danger"
        >
          <p className="flex items-center gap-2 font-semibold">
            <Ban aria-hidden className="size-[18px]" />
            Venta cancelada
          </p>
          <p className="text-[15px] text-foreground">
            La canceló <span className="font-medium">{venta.canceladaPor ?? "el dueño"}</span>
            {venta.canceladaEn ? ` · ${formatFechaHora(venta.canceladaEn)}` : null}
          </p>
          <p className="text-[15px] text-foreground">El stock regresó al inventario y no cuenta en los reportes.</p>
          {venta.motivoCancelacion ? (
            <p className="text-[15px] text-foreground">
              <span className="font-medium">Motivo:</span> {venta.motivoCancelacion}
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-label="Datos de la venta" className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:grid-cols-4">
        <Dato label="Atendió" value={venta.atendio ?? "—"} />
        <Dato label="Método" value={METODO_LABEL[venta.metodo]} />
        <Dato label={venta.metodo === "efectivo" ? "Recibido" : "Cobrado"} value={formatMoney(venta.recibido)} numero />
        {venta.metodo === "efectivo" ? <Dato label="Cambio" value={formatMoney(venta.cambio)} numero /> : null}
      </section>

      <section aria-labelledby="productos-titulo" className="flex flex-col gap-3">
        <h2 id="productos-titulo" className="text-lg font-semibold">
          Productos
        </h2>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          <ul className="divide-y divide-border">
            {venta.items.map((item, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-[15px] font-medium leading-snug">{item.nombre}</p>
                  <p className="text-[13px] text-muted tabular-nums">
                    {formatQuantity(item.cantidad, item.unidad)} × {formatMoney(item.precio)}
                  </p>
                </div>
                <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatMoney(item.importe)}</span>
              </li>
            ))}
          </ul>
          <p className="flex items-baseline justify-between border-t border-border-strong bg-surface-muted px-4 py-3">
            <span className="font-semibold">Total</span>
            <span className={`text-xl font-semibold tabular-nums ${cancelada ? "text-muted line-through" : ""}`}>
              {formatMoney(venta.total)}
            </span>
          </p>
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <ReprintButton ticket={ticket} />
        {esDueno && !cancelada ? (
          <CancelVenta ventaId={venta.id} folio={folio} renglones={venta.items.length} />
        ) : null}
      </div>
    </>
  );
}

function Dato({ label, value, numero = false }: { label: string; value: string; numero?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className={`truncate text-[15px] font-medium ${numero ? "tabular-nums" : ""}`}>{value}</p>
    </div>
  );
}
