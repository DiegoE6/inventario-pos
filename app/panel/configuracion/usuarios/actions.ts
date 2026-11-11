"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDueno } from "@/app/lib/auth";
import { demoActivo } from "@/app/lib/demo";
import { dbErrorMessage } from "@/app/lib/errors";
import { adminDisponible, createAdminClient } from "@/app/lib/supabase/admin";
import { createClient } from "@/app/lib/supabase/server";
import type { FormState } from "@/app/lib/types";
import { field, fieldErrors } from "@/app/lib/validation";

/**
 * Usuarios. Editar (nombre, rol, activo) va por actualizar_usuario() con la
 * sesión del dueño: la BD valida el rol, que no se quite su propio rol ni se
 * desactive, y que los usuarios demo no se toquen (docs/sql/28).
 *
 * Crear es lo único que usa la secret key (app/lib/supabase/admin.ts), y
 * solo para el alta en Auth. Nunca en el demo.
 */

const nombre = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, { error: "El nombre es obligatorio." })
      .max(80, { error: "El nombre: máximo 80 caracteres." })
  );
const rol = z.enum(["dueno", "cajero"], { error: "Elige un rol." });

const editarSchema = z.object({
  id: z.uuid({ error: "Usuario no válido." }),
  nombre,
  rol,
  activo: z.boolean(),
});

export async function actualizarUsuario(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireDueno();
  const parsed = editarSchema.safeParse({
    id: field(formData, "id"),
    nombre: field(formData, "nombre"),
    rol: field(formData, "rol"),
    activo: field(formData, "activo") === "on",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_usuario", {
    p_id: parsed.data.id,
    p_nombre: parsed.data.nombre,
    p_rol: parsed.data.rol,
    p_activo: parsed.data.activo,
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/panel/configuracion/usuarios");
  return { ok: true, message: "Guardado.", okKey: Date.now() };
}

// -----------------------------------------------------------------------------
// Crear usuario
// -----------------------------------------------------------------------------

export type CrearUsuarioState = FormState & {
  /** Contraseña temporal: se muestra UNA vez y no se guarda en ningún lado. */
  creado?: { correo: string; password: string };
};

const crearSchema = z.object({
  nombre,
  correo: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "Escribe un correo válido." }).max(254, { error: "Correo demasiado largo." })),
  rol,
});

/** "Kp7m-Qx3z-Hr9w": mayúsculas, minúsculas, números y guion; sin letras que se confunden. */
function passwordTemporal(): string {
  const may = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const min = "abcdefghijkmnpqrstuvwxyz";
  const num = "23456789";
  const todos = may + min + num;
  const pick = (s: string) => s[randomInt(s.length)];
  const grupo = () => pick(may) + pick(min) + pick(num) + pick(todos);
  return [grupo(), grupo(), grupo()].join("-");
}

export async function crearUsuario(_prev: CrearUsuarioState, formData: FormData): Promise<CrearUsuarioState> {
  await requireDueno();
  // El demo nunca crea usuarios (y no necesita la secret key para nada).
  if (demoActivo()) return { error: "En el demo no se pueden crear usuarios." };
  if (!adminDisponible()) {
    return { error: "Para crear usuarios falta configurar SUPABASE_SECRET_KEY en el servidor." };
  }

  const parsed = crearSchema.safeParse({
    nombre: field(formData, "nombre"),
    correo: field(formData, "correo"),
    rol: field(formData, "rol"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  // Antes de usar la secret key, la BD confirma con la sesión del usuario
  // que de verdad es dueño activo (no solo lo que dice verifySession).
  const supabase = await createClient();
  const { data: esDueno, error: errorRol } = await supabase.rpc("es_dueno");
  if (errorRol || esDueno !== true) return { error: "No tienes permiso para hacer esto." };

  const admin = createAdminClient();
  const password = passwordTemporal();
  const { data: creado, error: errorAlta } = await admin.auth.admin.createUser({
    email: parsed.data.correo,
    password,
    email_confirm: true,
    user_metadata: { nombre: parsed.data.nombre },
  });
  if (errorAlta || !creado.user) {
    if (errorAlta?.code === "email_exists" || /already (been )?registered/i.test(errorAlta?.message ?? "")) {
      return { fieldErrors: { correo: "Ya existe un usuario con ese correo." } };
    }
    if (errorAlta?.code === "weak_password") {
      console.error("[crear usuario] la contraseña temporal no cumple la política de Auth", errorAlta.message);
    } else {
      console.error("[crear usuario]", errorAlta);
    }
    return { error: "No se pudo crear el usuario. Intenta de nuevo." };
  }

  // El trigger de la BD lo creó como cajero INACTIVO. Se activa y se le da
  // el rol con la sesión del dueño (pasa por actualizar_usuario y sus reglas).
  const { error: errorPerfil } = await supabase.rpc("actualizar_usuario", {
    p_id: creado.user.id,
    p_nombre: parsed.data.nombre,
    p_rol: parsed.data.rol,
    p_activo: true,
  });
  if (errorPerfil) {
    // Sin perfil activo el usuario no sirve: se borra para poder reintentar.
    const { error: errorBorrar } = await admin.auth.admin.deleteUser(creado.user.id);
    if (errorBorrar) console.error("[crear usuario] no se pudo deshacer el alta", creado.user.id, errorBorrar);
    return { error: dbErrorMessage(errorPerfil) };
  }

  revalidatePath("/panel/configuracion/usuarios");
  return {
    ok: true,
    okKey: Date.now(),
    creado: { correo: parsed.data.correo, password },
  };
}
