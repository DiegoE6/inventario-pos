import type { NextRequest } from "next/server";
import { METODO_LABEL } from "@/app/components/ticket";
import { requireDueno } from "@/app/lib/auth";
import { getConfiguracion } from "@/app/lib/data";
import { exportError, hoja, hojaResumen, xlsxResponse } from "@/app/lib/excel/escribir";
import {
  getMasVendidosExport,
  getReporteResumen,
  getSinMovimiento,
  getVentasPorCategoria,
  getVentasPorMetodo,
  getVentasPorPeriodo,
  parseRango,
  type VentaCategoria,
  type VentaMetodo,
  type VentaPeriodo,
  type SinMovimiento,
  type MasVendidoExport,
} from "@/app/lib/reportes";
import { todayYmd } from "@/app/lib/tz";

/**
 * Reportes del rango elegido a Excel. Solo dueño. Los costos y ganancias
 * salen de las mismas funciones de dueño que la pantalla (24 y mas_vendidos).
 */

const pesos = (cents: number) => cents / 100;

export async function GET(request: NextRequest) {
  await requireDueno();
  const rango = parseRango(Object.fromEntries(request.nextUrl.searchParams), todayYmd());
  if (!rango.ok) return exportError(rango.error);
  const { desde, hasta } = rango;

  const [config, resumen, porPeriodo, porCategoria, porMetodo, top, sinMov] = await Promise.all([
    getConfiguracion(),
    getReporteResumen(desde, hasta),
    getVentasPorPeriodo(desde, hasta),
    getVentasPorCategoria(desde, hasta),
    getVentasPorMetodo(desde, hasta),
    getMasVendidosExport(desde, hasta),
    getSinMovimiento(desde, hasta, 200),
  ]);
  if (!resumen || !porPeriodo || !porCategoria || !porMetodo || !top || !sinMov) {
    return exportError("No se pudo armar el reporte. Intenta de nuevo.", 500);
  }

  const margen = resumen.ventasCents > 0 ? resumen.gananciaCents / resumen.ventasCents : null;
  const hResumen = hojaResumen("Resumen", [
    { dato: config.nombre, valor: null, titulo: true },
    { dato: "Desde", valor: desde, tipo: "fecha" },
    { dato: "Hasta", valor: hasta, tipo: "fecha" },
    { dato: "Generado", valor: new Date().toISOString(), tipo: "fechaHora" },
    { dato: "", valor: null },
    { dato: "Ventas", valor: pesos(resumen.ventasCents), tipo: "dinero" },
    { dato: "Costo de lo vendido", valor: pesos(resumen.costoCents), tipo: "dinero" },
    { dato: "Ganancia", valor: pesos(resumen.gananciaCents), tipo: "dinero" },
    { dato: "Margen", valor: margen, tipo: "porcentaje" },
    { dato: "Número de ventas", valor: resumen.numVentas, tipo: "entero" },
    { dato: "Ticket promedio", valor: pesos(resumen.ticketPromedioCents), tipo: "dinero" },
    { dato: "Ventas canceladas (no cuentan)", valor: resumen.numCanceladas, tipo: "entero" },
    { dato: "Importe cancelado", valor: pesos(resumen.canceladasCents), tipo: "dinero" },
  ]);

  const tituloPeriodo = { dia: "Día", semana: "Semana desde", mes: "Mes desde" }[porPeriodo.agrupacion];
  const hPeriodo = hoja<VentaPeriodo>(
    porPeriodo.agrupacion === "dia" ? "Por día" : porPeriodo.agrupacion === "semana" ? "Por semana" : "Por mes",
    [
      { titulo: tituloPeriodo, tipo: "fecha", valor: (p) => p.desde },
      ...(porPeriodo.agrupacion === "dia"
        ? []
        : [{ titulo: "Hasta", tipo: "fecha" as const, valor: (p: VentaPeriodo) => p.hasta }]),
      { titulo: "Ventas", tipo: "entero", valor: (p) => p.numVentas },
      { titulo: "Importe", tipo: "dinero", valor: (p) => pesos(p.ventasCents) },
      { titulo: "Costo", tipo: "dinero", valor: (p) => pesos(p.costoCents) },
      { titulo: "Ganancia", tipo: "dinero", valor: (p) => pesos(p.gananciaCents) },
    ],
    porPeriodo.periodos
  );

  const hCategoria = hoja<VentaCategoria>(
    "Por categoría",
    [
      { titulo: "Categoría", tipo: "texto", valor: (c) => c.nombre },
      { titulo: "Ventas", tipo: "entero", valor: (c) => c.numVentas },
      { titulo: "Importe", tipo: "dinero", valor: (c) => pesos(c.ventasCents) },
      { titulo: "Costo", tipo: "dinero", valor: (c) => pesos(c.costoCents) },
      { titulo: "Ganancia", tipo: "dinero", valor: (c) => pesos(c.gananciaCents) },
      {
        titulo: "Margen",
        tipo: "porcentaje",
        valor: (c) => (c.ventasCents > 0 ? c.gananciaCents / c.ventasCents : null),
      },
    ],
    porCategoria
  );

  const hMetodo = hoja<VentaMetodo>(
    "Por método de pago",
    [
      { titulo: "Método", tipo: "texto", ancho: 16, valor: (m) => METODO_LABEL[m.metodo] },
      { titulo: "Ventas", tipo: "entero", valor: (m) => m.numVentas },
      { titulo: "Importe", tipo: "dinero", valor: (m) => pesos(m.ventasCents) },
    ],
    porMetodo
  );

  const hTop = hoja<MasVendidoExport>(
    "Más vendidos",
    [
      { titulo: "Código", tipo: "texto", ancho: 14, valor: (p) => p.codigo },
      { titulo: "Producto", tipo: "texto", ancho: 36, valor: (p) => p.nombre },
      { titulo: "Cantidad", tipo: "numero", valor: (p) => p.cantidad },
      { titulo: "Unidad", tipo: "texto", ancho: 10, valor: (p) => p.unidad },
      { titulo: "Importe", tipo: "dinero", valor: (p) => pesos(p.importeCents) },
      { titulo: "Costo", tipo: "dinero", valor: (p) => pesos(p.costoCents) },
      { titulo: "Ganancia", tipo: "dinero", valor: (p) => pesos(p.gananciaCents) },
    ],
    top
  );

  const hSin = hoja<SinMovimiento>(
    "Sin movimiento",
    [
      { titulo: "Código", tipo: "texto", ancho: 14, valor: (p) => p.codigo },
      { titulo: "Producto", tipo: "texto", ancho: 36, valor: (p) => p.nombre },
      { titulo: "Categoría", tipo: "texto", ancho: 18, valor: (p) => p.categoria },
      { titulo: "Existencia", tipo: "numero", valor: (p) => p.stock },
      { titulo: "Unidad", tipo: "texto", ancho: 10, valor: (p) => p.unidad },
      { titulo: "Dinero detenido (a costo)", tipo: "dinero", ancho: 16, valor: (p) => pesos(p.valorCents) },
      { titulo: "Última venta", tipo: "fechaHora", valor: (p) => p.ultimaVenta },
    ],
    sinMov
  );

  return xlsxResponse([hResumen, hPeriodo, hCategoria, hMetodo, hTop, hSin], `reporte_${desde}_a_${hasta}.xlsx`);
}
