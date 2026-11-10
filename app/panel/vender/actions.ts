"use server";

import { z } from "zod";
import type { TicketData } from "@/app/components/ticket";
import { verifySession } from "@/app/lib/auth";
import type { PosProduct } from "@/app/lib/cart";
import { getConfiguracion } from "@/app/lib/data";
import { dbErrorMessage, errorKind } from "@/app/lib/errors";
import { formatQuantity, type Unidad } from "@/app/lib/format";
import { createClient } from "@/app/lib/supabase/server";

/**
 * Cobro. Endpoint público: valida sesión (verifySession) y datos (zod).
 * Precio y costo los pone la BD (registrar_venta); el cliente solo manda
 * qué productos y cuánto. La clave hace el cobro idempotente: reintentar con
 * la misma clave regresa la misma venta, sin cobrar doble (docs/sql/12).
 */

const cobroSchema = z.object({
  clave: z.uuid(),
  metodo: z.enum(["efectivo", "tarjeta", "transferencia"]),
  recibido: z
    .string()
    .trim()
    .transform((s) => s.replace(/,/g, ""))
    .pipe(z.string().regex(/^(\d{1,10}(\.\d{1,2})?)?$/))
    .optional(),
  items: z
    .array(
      z.object({
        producto_id: z.uuid(),
        cantidad: z.string().regex(/^\d{1,6}(\.\d{1,3})?$/),
      })
    )
    .min(1)
    .max(200),
});

export type CobroInput = z.input<typeof cobroSchema>;

export type Ticket = TicketData & {
  ventaId: string;
  /** La clave ya tenía una venta registrada (reintento): el ticket es de esa venta. */
  repetida: boolean;
};

export type CobroResult =
  | { ok: true; ticket: Ticket }
  | {
      ok: false;
      error: string;
      /** Problema por producto, para marcar el renglón. */
      problemas?: Record<string, string>;
      /** Datos frescos de los productos del carrito. */
      productos?: PosProduct[];
    };

export async function cobrar(input: CobroInput): Promise<CobroResult> {
  await verifySession();

  const parsed = cobroSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa el carrito: hay datos no válidos." };
  const { clave, metodo, recibido, items } = parsed.data;
  if (metodo === "efectivo" && !recibido) {
    return { ok: false, error: "Escribe cuánto te dieron en efectivo." };
  }

  const supabase = await createClient();

  // Solo para avisar en el ticket: ¿esta clave ya tenía venta? (La BD es la
  // que garantiza que no se cobre doble; esto es informativo.)
  const { data: previa } = await supabase
    .from("ventas")
    .select("id")
    .eq("clave_cliente", clave)
    .maybeSingle();

  const { data: venta, error } = await supabase
    .rpc("registrar_venta", {
      p_items: items.map((i) => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad) })),
      p_metodo_pago: metodo,
      p_pago_recibido: metodo === "efectivo" ? recibido : null,
      p_clave: clave,
    })
    .single<{
      id: string;
      folio: number;
      creado_en: string;
      metodo_pago: Ticket["metodo"];
      total: number;
      pago_recibido: number;
      cambio: number;
      usuario_id: string;
    }>();

  if (error || !venta) {
    const message = dbErrorMessage(error);
    if (errorKind(error) === "auth") return { ok: false, error: message };
    return { ok: false, error: message, ...(await diagnosticar(items)) };
  }

  // Ticket con los datos de la BD, no con los que calculó el cliente.
  const [{ data: detalle }, { data: perfil }, config] = await Promise.all([
    supabase
      .from("venta_detalle")
      .select("nombre_producto, unidad, cantidad, precio_unitario, importe")
      .eq("venta_id", venta.id)
      .order("id"),
    supabase.from("perfiles").select("nombre").eq("id", venta.usuario_id).maybeSingle(),
    getConfiguracion(),
  ]);

  // Sin revalidatePath: haría que Next vuelva a pedir esta página tras cada
  // venta (y reordenaría los más vendidos). Las páginas de productos son
  // dinámicas, así que siempre leen el stock actual.
  return {
    ok: true,
    ticket: {
      ventaId: venta.id,
      folio: venta.folio,
      fecha: venta.creado_en,
      metodo: venta.metodo_pago,
      total: Number(venta.total),
      recibido: Number(venta.pago_recibido),
      cambio: Number(venta.cambio),
      atendio: perfil?.nombre ?? "",
      items: (detalle ?? []).map((d) => ({
        nombre: d.nombre_producto,
        unidad: d.unidad as Unidad,
        cantidad: Number(d.cantidad),
        precio: Number(d.precio_unitario),
        importe: Number(d.importe),
      })),
      negocio: { nombre: config.nombre, direccion: config.direccion, telefono: config.telefono },
      repetida: Boolean(previa),
    },
  };
}

/**
 * La BD rechazó la venta: vuelve a leer cada producto del carrito y dice qué
 * renglón tiene el problema (en vez de depender del texto del error).
 */
async function diagnosticar(items: { producto_id: string; cantidad: string }[]) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("productos")
    .select("id, codigo, nombre, precio, stock, unidad, activo")
    .in("id", items.map((i) => i.producto_id));

  const productos = (data ?? []) as PosProduct[];
  const porId = new Map(productos.map((p) => [p.id, p]));
  const problemas: Record<string, string> = {};

  for (const item of items) {
    const p = porId.get(item.producto_id);
    if (!p) problemas[item.producto_id] = "Este producto ya no existe";
    else if (!p.activo) problemas[item.producto_id] = "Producto desactivado";
    else if (Number(p.stock) < Number(item.cantidad)) {
      problemas[item.producto_id] =
        Number(p.stock) <= 0 ? "Sin existencias" : `Solo hay ${formatQuantity(p.stock, p.unidad)}`;
    }
  }
  return { problemas, productos };
}
