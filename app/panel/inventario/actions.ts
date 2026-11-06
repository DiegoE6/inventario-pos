"use server";

import { z } from "zod";
import { requireDueno } from "@/app/lib/auth";
import { dbErrorMessage } from "@/app/lib/errors";
import { createClient } from "@/app/lib/supabase/server";

/**
 * Entradas, mermas y conteos. Solo dueño (requireDueno + la BD lo vuelve a
 * validar). Con la sesión del usuario; sin service_role.
 *
 * Cada operación lleva una clave (uuid) generada en el formulario: reintentar
 * con la misma clave devuelve el mismo movimiento, sin mover el stock dos
 * veces (docs/sql/14).
 */

const QTY = /^\d{1,9}(\.\d{1,3})?$/;
const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

const base = z.object({
  clave: z.uuid(),
  producto_id: z.uuid(),
});

const entradaSchema = base.extend({
  cantidad: z.string().trim().regex(QTY, { error: "Usa una cantidad como 10 o 2.5." }),
  costo: z
    .string()
    .trim()
    .transform((s) => s.replace(/,/g, ""))
    .pipe(z.string().regex(MONEY, { error: "Usa un monto como 12.50." }))
    .optional()
    .or(z.literal("").transform(() => undefined)),
  nota: z.string().trim().max(300).optional(),
});

const mermaSchema = base.extend({
  cantidad: z.string().trim().regex(QTY, { error: "Usa una cantidad como 1 o 0.5." }),
  nota: z.string().trim().min(1, { error: "Escribe qué pasó." }).max(300),
});

const conteoSchema = base.extend({
  contado: z.string().trim().regex(QTY, { error: "Usa una cantidad como 10 o 2.5." }),
  stock_esperado: z.number().finite().min(0),
  nota: z.string().trim().max(300).optional(),
});

export type MovimientoResumen = {
  tipo: "entrada" | "merma" | "ajuste";
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
};

export type InventarioResult =
  | {
      ok: true;
      movimiento: MovimientoResumen | null; // null: conteo sin diferencia
      /** La clave ya tenía un movimiento: no se registró de nuevo. */
      repetido: boolean;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      /** Solo conteo: el stock cambió desde que se mostró. */
      stockActual?: number;
    };

function invalid(error: z.ZodError): InventarioResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  return { ok: false, error: "Revisa los datos capturados.", fieldErrors };
}

/** ¿Esta clave ya tiene movimiento? Solo para avisar; la BD es la que garantiza. */
async function yaRegistrado(clave: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("movimientos_inventario")
    .select("id")
    .eq("clave_cliente", clave)
    .maybeSingle();
  return Boolean(data);
}

function resumen(m: {
  tipo: MovimientoResumen["tipo"];
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
}): MovimientoResumen {
  return {
    tipo: m.tipo,
    cantidad: Number(m.cantidad),
    stock_anterior: Number(m.stock_anterior),
    stock_nuevo: Number(m.stock_nuevo),
  };
}

type MovRow = Parameters<typeof resumen>[0];

export async function registrarEntrada(input: z.input<typeof entradaSchema>): Promise<InventarioResult> {
  await requireDueno();
  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { clave, producto_id, cantidad, costo, nota } = parsed.data;

  const repetido = await yaRegistrado(clave);
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("registrar_movimiento", {
      p_producto_id: producto_id,
      p_tipo: "entrada",
      p_cantidad: cantidad,
      p_costo_unitario: costo ?? null,
      p_nota: nota || null,
      p_clave: clave,
    })
    .single<MovRow>();

  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  return { ok: true, movimiento: resumen(data), repetido };
}

export async function registrarMerma(input: z.input<typeof mermaSchema>): Promise<InventarioResult> {
  await requireDueno();
  const parsed = mermaSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { clave, producto_id, cantidad, nota } = parsed.data;

  const repetido = await yaRegistrado(clave);
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("registrar_movimiento", {
      p_producto_id: producto_id,
      p_tipo: "merma",
      p_cantidad: cantidad,
      p_nota: nota,
      p_clave: clave,
    })
    .single<MovRow>();

  if (error || !data) return { ok: false, error: dbErrorMessage(error) };
  return { ok: true, movimiento: resumen(data), repetido };
}

export async function registrarConteo(input: z.input<typeof conteoSchema>): Promise<InventarioResult> {
  await requireDueno();
  const parsed = conteoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { clave, producto_id, contado, stock_esperado, nota } = parsed.data;

  const repetido = await yaRegistrado(clave);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_ajuste", {
    p_producto_id: producto_id,
    p_stock_contado: contado,
    p_nota: nota || null,
    p_clave: clave,
    p_stock_esperado: stock_esperado,
  });

  if (error) {
    // El stock cambió mientras contaban: se regresa el stock actual para
    // recalcular la diferencia y dejar confirmar, sin borrar lo capturado.
    if (error.code === "LT409" && error.hint === "stock_cambio") {
      const { data: p } = await supabase
        .from("productos")
        .select("stock")
        .eq("id", producto_id)
        .maybeSingle<{ stock: number }>();
      return {
        ok: false,
        error: dbErrorMessage(error),
        stockActual: p ? Number(p.stock) : undefined,
      };
    }
    return { ok: false, error: dbErrorMessage(error) };
  }

  // registrar_ajuste devuelve null cuando el conteo coincide (no hay movimiento).
  const row = data as MovRow | null;
  return { ok: true, movimiento: row && row.tipo ? resumen(row) : null, repetido };
}
