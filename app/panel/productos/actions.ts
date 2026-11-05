"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireDueno } from "@/app/lib/auth";
import { isUuid } from "@/app/lib/data";
import { dbErrorMessage, errorKind } from "@/app/lib/errors";
import { createClient } from "@/app/lib/supabase/server";
import type { FormState, Unidad } from "@/app/lib/types";
import {
  decimalNotAllowed,
  field,
  fieldErrors,
  money,
  optionalId,
  optionalText,
  quantity,
  requiredText,
} from "@/app/lib/validation";

/**
 * Escrituras de productos. Endpoints públicos: cada una valida la sesión y el
 * rol (requireDueno) y los datos (zod). Usan la sesión del usuario: la BD
 * vuelve a validar el rol (RLS y crear_producto). Nada de service_role.
 */

const unidad = z.enum(["pieza", "caja", "metro", "kilo", "litro"], {
  error: "Elige una unidad.",
});

const productoSchema = z.object({
  codigo: requiredText("El código", 50),
  nombre: requiredText("El nombre", 150),
  descripcion: optionalText(500),
  categoria_id: optionalId,
  proveedor_id: optionalId,
  unidad,
  costo: money("el costo"),
  precio: money("el precio"),
  stock_minimo: quantity("el stock mínimo"),
  activo: z.boolean(),
});

const crearSchema = productoSchema.extend({
  stock_inicial: quantity("el stock inicial"),
});

function readProducto(formData: FormData) {
  return {
    codigo: field(formData, "codigo"),
    nombre: field(formData, "nombre"),
    descripcion: field(formData, "descripcion"),
    categoria_id: field(formData, "categoria_id"),
    proveedor_id: field(formData, "proveedor_id"),
    unidad: field(formData, "unidad"),
    costo: field(formData, "costo"),
    precio: field(formData, "precio"),
    stock_minimo: field(formData, "stock_minimo"),
    stock_inicial: field(formData, "stock_inicial"),
    activo: formData.get("activo") === "on",
  };
}

/** Decimales en pieza/caja: mismo criterio que la BD, con mensaje por campo. */
function checkDecimals(u: Unidad, values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    if (decimalNotAllowed(value, u)) {
      errors[name] = `Los productos por ${u} no aceptan decimales.`;
    }
  }
  return errors;
}

export async function crearProducto(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireDueno();

  const parsed = crearSchema.safeParse(readProducto(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const p = parsed.data;

  const decimals = checkDecimals(p.unidad, {
    stock_minimo: p.stock_minimo,
    stock_inicial: p.stock_inicial,
  });
  if (Object.keys(decimals).length) return { fieldErrors: decimals };

  const supabase = await createClient();
  // Producto + entrada de stock inicial en una sola transacción (docs/sql/09).
  const { data, error } = await supabase
    .rpc("crear_producto", {
      p_codigo: p.codigo,
      p_nombre: p.nombre,
      p_unidad: p.unidad,
      p_costo: p.costo,
      p_precio: p.precio,
      p_stock_minimo: p.stock_minimo,
      p_stock_inicial: p.stock_inicial,
      p_categoria_id: p.categoria_id,
      p_proveedor_id: p.proveedor_id,
      p_descripcion: p.descripcion,
      p_activo: p.activo,
    })
    .single<{ id: string }>();

  if (error || !data) {
    const message = dbErrorMessage(error);
    // Código repetido: el error va junto al campo.
    if (errorKind(error) === "conflict") return { fieldErrors: { codigo: message } };
    return { error: message };
  }

  revalidatePath("/panel/productos");
  redirect(`/panel/productos/${data.id}?guardado=creado`);
}

export async function actualizarProducto(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireDueno();
  if (!isUuid(id)) return { error: "Producto no válido." };

  const parsed = productoSchema.safeParse(readProducto(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const p = parsed.data;

  const decimals = checkDecimals(p.unidad, { stock_minimo: p.stock_minimo });
  if (Object.keys(decimals).length) return { fieldErrors: decimals };

  const supabase = await createClient();

  // Cambiar a pieza/caja no puede dejar un stock con decimales.
  const { data: actual } = await supabase
    .from("productos")
    .select("stock")
    .eq("id", id)
    .maybeSingle<{ stock: number }>();
  if (!actual) return { error: "El producto no existe." };
  if (decimalNotAllowed(String(actual.stock), p.unidad)) {
    return {
      fieldErrors: {
        unidad: `El stock actual tiene decimales (${actual.stock}); no puede venderse por ${p.unidad}.`,
      },
    };
  }

  // Sin `stock`: no tiene permiso de columna y solo cambia por movimientos.
  const { data, error } = await supabase
    .from("productos")
    .update({
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      categoria_id: p.categoria_id,
      proveedor_id: p.proveedor_id,
      unidad: p.unidad,
      costo: p.costo,
      precio: p.precio,
      stock_minimo: p.stock_minimo,
      activo: p.activo,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    const message = dbErrorMessage(error, { duplicate: "Ya existe un producto con ese código." });
    if (error.code === "23505") return { fieldErrors: { codigo: message } };
    return { error: message };
  }
  // Sin filas: RLS lo filtró (sin permiso) o ya no existe.
  if (!data) return { error: "No se pudo guardar: el producto no existe o no tienes permiso." };

  revalidatePath("/panel/productos");
  revalidatePath(`/panel/productos/${id}`);
  return { ok: true, message: "Cambios guardados.", okKey: Date.now() };
}
