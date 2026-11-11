"use client";

import { useActionState, useState } from "react";
import { Lock, Pencil } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import { Field, Input, Select } from "@/app/components/ui/field";
import { formatFechaHora } from "@/app/lib/tz";
import type { Rol } from "@/app/lib/types";
import { actualizarUsuario } from "../actions";

export type Usuario = {
  id: string;
  nombre: string;
  correo: string | null;
  rol: Rol;
  activo: boolean;
  creado_en: string;
  ultimo_acceso: string | null;
  es_demo: boolean;
};

const ROL_LABEL: Record<Rol, string> = { dueno: "Dueño", cajero: "Cajero" };

export function UsuarioRow({ usuario, esYo }: { usuario: Usuario; esYo: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(actualizarUsuario, {});
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);

  // Al guardar con éxito se cierra la edición.
  const [seenOk, setSeenOk] = useState(state.okKey);
  if (state.okKey !== seenOk) {
    setSeenOk(state.okKey);
    setEditing(false);
  }

  function cancelar() {
    setNombre(usuario.nombre);
    setRol(usuario.rol);
    setActivo(usuario.activo);
    setEditing(false);
  }

  if (editing) {
    const id = `u-${usuario.id}`;
    return (
      <li className="p-4">
        <form action={action} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="id" value={usuario.id} />
          <p className="text-sm text-muted">{usuario.correo}</p>
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${id}-nombre`} label="Nombre" error={state.fieldErrors?.nombre}>
              <Input
                id={`${id}-nombre`}
                name="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={80}
                invalid={Boolean(state.fieldErrors?.nombre)}
                describedBy={state.fieldErrors?.nombre ? "error" : undefined}
              />
            </Field>
            <Field
              id={`${id}-rol`}
              label="Rol"
              hint={esYo ? "No puedes quitarte el rol de dueño." : undefined}
              error={state.fieldErrors?.rol}
            >
              <Select
                id={`${id}-rol`}
                name={esYo ? undefined : "rol"}
                value={rol}
                onChange={(e) => setRol(e.target.value as Rol)}
                disabled={esYo}
                describedBy={esYo ? "hint" : undefined}
              >
                <option value="cajero">Cajero</option>
                <option value="dueno">Dueño</option>
              </Select>
            </Field>
          </div>
          {/* Un control deshabilitado no se envía: se manda el valor fijo. La BD lo vuelve a revisar. */}
          {esYo ? <input type="hidden" name="rol" value={usuario.rol} /> : null}

          <label className={`flex items-start gap-3 text-[15px] ${esYo ? "text-muted" : ""}`}>
            <input
              type="checkbox"
              name={esYo ? undefined : "activo"}
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              disabled={esYo}
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary-ink)]"
            />
            <span>
              Activo
              <span className="block text-sm text-muted">
                {esYo ? "No puedes desactivarte a ti mismo." : "Si lo desactivas, ya no puede entrar."}
              </span>
            </span>
          </label>
          {esYo ? <input type="hidden" name="activo" value="on" /> : null}

          <div className="flex gap-2">
            <Button type="submit" pending={pending} pendingLabel="Guardando…">
              Guardar
            </Button>
            <Button variant="ghost" onClick={cancelar} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium ${usuario.activo ? "" : "text-muted"}`}>
            <span className="min-w-0 [overflow-wrap:anywhere]">{usuario.nombre}</span>
            {esYo ? <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] font-medium text-muted">Tú</span> : null}
            <span
              className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${
                usuario.rol === "dueno" ? "bg-primary-soft text-primary-ink" : "bg-surface-muted text-muted"
              }`}
            >
              {ROL_LABEL[usuario.rol]}
            </span>
          </p>
          {usuario.correo ? <p className="truncate text-sm text-muted">{usuario.correo}</p> : null}
          <p className="text-[13px] text-muted">
            {usuario.ultimo_acceso ? `Último acceso: ${formatFechaHora(usuario.ultimo_acceso)}` : "Nunca ha entrado"}
          </p>
        </div>
        {usuario.es_demo ? null : (
          <Button
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label={`Editar ${usuario.nombre}`}
            className="shrink-0 px-3"
            icon={<Pencil aria-hidden className="size-[18px]" />}
          >
            <span className="hidden sm:inline">Editar</span>
          </Button>
        )}
      </div>
      {usuario.es_demo ? (
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          Usuario del demo: no se puede modificar.
        </p>
      ) : null}
    </li>
  );
}
