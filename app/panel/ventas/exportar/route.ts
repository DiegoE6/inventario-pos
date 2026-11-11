import type { NextRequest } from "next/server";
import { METODO_LABEL, type MetodoPago } from "@/app/components/ticket";
import { requireDueno } from "@/app/lib/auth";
import { nombreArchivo } from "@/app/lib/brand";
import { getConfiguracion } from "@/app/lib/data";
import { exportError, hoja, xlsxResponse } from "@/app/lib/excel/escribir";
import { diasEnRango, MAX_DIAS } from "@/app/lib/reportes";
import { createClient } from "@/app/lib/supabase/server";
import { dayRange, todayYmd } from "@/app/lib/tz";
import { parseVentasQuery, type EstadoVenta } from "@/app/lib/ventas";

/**
 * Ventas a Excel con los mismos filtros de la pantalla (sin fechas: los
 * últimos 7 días). Solo dueño. Sin costos: sale de las tablas con la sesión
 * del usuario (RLS), en páginas de 1,000. Hasta 366 días y 20,000 ventas.
 */

const PAGINA = 1000;
const MAX_VENTAS = 20_000;

type Renglon = {
  nombre_producto: string;
  unidad: string;
  cantidad: number | string;
  precio_unitario: number | string;
  importe: number | string;
  productos: { codigo: string } | null;
};
type Venta = {
  folio: number;
  creado_en: string;
  total: number | string;
  pago_recibido: number | string;
  cambio: number | string;
  metodo_pago: MetodoPago;
  estado: EstadoVenta;
  motivo_cancelacion: string | null;
  cancelada_en: string | null;
  atendio: { nombre: string } | null;
  cancelo: { nombre: string } | null;
  venta_detalle: Renglon[];
};

export async function GET(request: NextRequest) {
  await requireDueno();
  const hoy = todayYmd();
  const q = parseVentasQuery(Object.fromEntries(request.nextUrl.searchParams), hoy);
  const desde = q.desde ?? q.hasta;
  const hasta = q.hasta ?? hoy;
  if (!desde) return exportError("Elige la fecha Desde para exportar.");
  if (diasEnRango(desde, hasta) > MAX_DIAS) {
    return exportError(`El rango no puede ser mayor a ${MAX_DIAS} días. Elige uno más corto y vuelve a exportar.`);
  }

  const supabase = await createClient();
  const { gte, lt } = dayRange(desde, hasta);
  const ventas: Venta[] = [];
  for (let from = 0; ; from += PAGINA) {
    let req = supabase
      .from("ventas")
      .select(
        "folio, creado_en, total, pago_recibido, cambio, metodo_pago, estado, motivo_cancelacion, cancelada_en," +
          " atendio:perfiles!usuario_id(nombre), cancelo:perfiles!cancelada_por(nombre)," +
          " venta_detalle(nombre_producto, unidad, cantidad, precio_unitario, importe, productos(codigo))"
      )
      .gte("creado_en", gte!)
      .lt("creado_en", lt!);
    if (q.estado) req = req.eq("estado", q.estado);
    if (q.metodo) req = req.eq("metodo_pago", q.metodo);
    const { data, error } = await req
      .order("creado_en")
      .order("folio")
      .order("id", { referencedTable: "venta_detalle" })
      .range(from, from + PAGINA - 1);
    if (error) {
      console.error("[exportar ventas]", error);
      return exportError("No se pudieron leer las ventas. Intenta de nuevo.", 500);
    }
    ventas.push(...(data as unknown as Venta[]));
    if (ventas.length > MAX_VENTAS) {
      return exportError(`Hay más de ${MAX_VENTAS.toLocaleString("es-MX")} ventas en ese rango. Elige uno más corto.`);
    }
    if (!data || data.length < PAGINA) break;
  }

  const ESTADO: Record<EstadoVenta, string> = { completada: "Completada", cancelada: "Cancelada" };
  const hojaVentas = hoja<Venta>(
    "Ventas",
    [
      { titulo: "Folio", tipo: "folio", ancho: 9, valor: (v) => v.folio },
      { titulo: "Fecha y hora", tipo: "fechaHora", valor: (v) => v.creado_en },
      { titulo: "Atendió", tipo: "texto", ancho: 20, valor: (v) => v.atendio?.nombre },
      { titulo: "Método de pago", tipo: "texto", ancho: 15, valor: (v) => METODO_LABEL[v.metodo_pago] },
      { titulo: "Estado", tipo: "texto", ancho: 12, valor: (v) => ESTADO[v.estado] },
      { titulo: "Total", tipo: "dinero", valor: (v) => v.total },
      { titulo: "Recibido", tipo: "dinero", valor: (v) => v.pago_recibido },
      { titulo: "Cambio", tipo: "dinero", valor: (v) => v.cambio },
      { titulo: "Productos", tipo: "entero", ancho: 10, valor: (v) => v.venta_detalle.length },
      { titulo: "Cancelada el", tipo: "fechaHora", valor: (v) => v.cancelada_en },
      { titulo: "Canceló", tipo: "texto", ancho: 20, valor: (v) => v.cancelo?.nombre },
      { titulo: "Motivo de cancelación", tipo: "texto", ancho: 36, valor: (v) => v.motivo_cancelacion },
    ],
    ventas
  );

  type R = Renglon & { venta: Venta };
  const renglones: R[] = ventas.flatMap((v) => v.venta_detalle.map((d) => ({ ...d, venta: v })));
  const hojaDetalle = hoja<R>(
    "Productos vendidos",
    [
      { titulo: "Folio", tipo: "folio", ancho: 9, valor: (r) => r.venta.folio },
      { titulo: "Fecha y hora", tipo: "fechaHora", valor: (r) => r.venta.creado_en },
      { titulo: "Estado", tipo: "texto", ancho: 12, valor: (r) => ESTADO[r.venta.estado] },
      { titulo: "Código", tipo: "texto", ancho: 14, valor: (r) => r.productos?.codigo },
      { titulo: "Producto", tipo: "texto", ancho: 36, valor: (r) => r.nombre_producto },
      { titulo: "Cantidad", tipo: "numero", valor: (r) => r.cantidad },
      { titulo: "Unidad", tipo: "texto", ancho: 10, valor: (r) => r.unidad },
      { titulo: "Precio", tipo: "dinero", valor: (r) => r.precio_unitario },
      { titulo: "Importe", tipo: "dinero", valor: (r) => r.importe },
    ],
    renglones
  );

  const config = await getConfiguracion();
  return xlsxResponse([hojaVentas, hojaDetalle], nombreArchivo(config.nombre, `ventas-${desde}-a-${hasta}`));
}
