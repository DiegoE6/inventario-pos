"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDueno } from "@/app/lib/auth";
import { dbErrorMessage } from "@/app/lib/errors";
import { createClient } from "@/app/lib/supabase/server";
import type { FormState } from "@/app/lib/types";
import { field, fieldErrors, optionalText, requiredId, requiredText } from "@/app/lib/validation";

/**
 * Catálogos: alta, edición y activar/desactivar (nunca se borran: los
 * productos y ventas los referencian). Solo dueño; la BD lo vuelve a validar
 * con RLS. Usan la sesión del usuario, nada de service_role.
 */

type Tabla = "categorias" | "proveedores";

const schemas = {
  categorias: z.object({ nombre: requiredText("El nombre", 60) }),
  proveedores: z.object({
    nombre: requiredText("El nombre", 120),
    contacto: optionalText(120),
    telefono: optionalText(30),
    notas: optionalText(500),
  }),
};

const DUPLICADO: Record<Tabla, string> = {
  categorias: "Ya existe una categoría con ese nombre.",
  proveedores: "Ya existe un proveedor con ese nombre.",
};

function read(tabla: Tabla, formData: FormData) {
  return tabla === "categorias"
    ? { nombre: field(formData, "nombre") }
    : {
        nombre: field(formData, "nombre"),
        contacto: field(formData, "contacto"),
        telefono: field(formData, "telefono"),
        notas: field(formData, "notas"),
      };
}

function revalidate(tabla: Tabla) {
  revalidatePath(`/panel/configuracion/${tabla}`);
  revalidatePath("/panel/productos", "layout");
}

async function crear(tabla: Tabla, formData: FormData): Promise<FormState> {
  await requireDueno();
  const parsed = schemas[tabla].safeParse(read(tabla, formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from(tabla).insert(parsed.data);
  if (error) {
    const message = dbErrorMessage(error, { duplicate: DUPLICADO[tabla] });
    return error.code === "23505" ? { fieldErrors: { nombre: message } } : { error: message };
  }

  revalidate(tabla);
  return { ok: true, message: "Agregado.", okKey: Date.now() };
}

async function actualizar(tabla: Tabla, formData: FormData): Promise<FormState> {
  await requireDueno();
  const id = requiredId.safeParse(field(formData, "id"));
  if (!id.success) return { error: "Registro no válido." };
  const parsed = schemas[tabla].safeParse(read(tabla, formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(tabla)
    .update(parsed.data)
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  if (error) {
    const message = dbErrorMessage(error, { duplicate: DUPLICADO[tabla] });
    return error.code === "23505" ? { fieldErrors: { nombre: message } } : { error: message };
  }
  if (!data) return { error: "No se pudo guardar: no existe o no tienes permiso." };

  revalidate(tabla);
  return { ok: true, message: "Guardado.", okKey: Date.now() };
}

async function cambiarEstado(tabla: Tabla, formData: FormData): Promise<FormState> {
  await requireDueno();
  const id = requiredId.safeParse(field(formData, "id"));
  const activo = field(formData, "activo");
  if (!id.success || (activo !== "true" && activo !== "false")) {
    return { error: "Solicitud no válida." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(tabla)
    .update({ activo: activo === "true" })
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  if (error) return { error: dbErrorMessage(error) };
  if (!data) return { error: "No se pudo cambiar: no existe o no tienes permiso." };

  revalidate(tabla);
  return { ok: true, okKey: Date.now() };
}

// Acciones exportadas (una por tabla, para no aceptar el nombre de la tabla
// desde el cliente).
export async function crearCategoria(_p: FormState, fd: FormData) {
  return crear("categorias", fd);
}
export async function actualizarCategoria(_p: FormState, fd: FormData) {
  return actualizar("categorias", fd);
}
export async function cambiarEstadoCategoria(_p: FormState, fd: FormData) {
  return cambiarEstado("categorias", fd);
}
export async function crearProveedor(_p: FormState, fd: FormData) {
  return crear("proveedores", fd);
}
export async function actualizarProveedor(_p: FormState, fd: FormData) {
  return actualizar("proveedores", fd);
}
export async function cambiarEstadoProveedor(_p: FormState, fd: FormData) {
  return cambiarEstado("proveedores", fd);
}
