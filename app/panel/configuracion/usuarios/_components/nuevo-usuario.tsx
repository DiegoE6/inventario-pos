"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Copy, Info, UserPlus } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import { Field, Input, Select } from "@/app/components/ui/field";
import { crearUsuario, type CrearUsuarioState } from "../actions";

export function NuevoUsuario({ motivoSinAlta }: { motivoSinAlta: string | null }) {
  const [abierto, setAbierto] = useState(false);

  if (motivoSinAlta) {
    return (
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <p className="flex items-start gap-2 text-[15px] text-muted">
          <Info aria-hidden className="mt-0.5 size-[18px] shrink-0" />
          <span>{motivoSinAlta}</span>
        </p>
        <Button variant="secondary" disabled className="self-start" icon={<UserPlus aria-hidden className="size-[18px]" />}>
          Nuevo usuario
        </Button>
      </section>
    );
  }

  if (!abierto) {
    return (
      <Button className="self-start" onClick={() => setAbierto(true)} icon={<UserPlus aria-hidden className="size-[18px]" />}>
        Nuevo usuario
      </Button>
    );
  }

  return <Formulario onClose={() => setAbierto(false)} />;
}

function Formulario({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<CrearUsuarioState, FormData>(crearUsuario, {});
  const [valores, setValores] = useState({ nombre: "", correo: "", rol: "cajero" });

  if (state.creado) return <Creado creado={state.creado} onClose={onClose} />;

  const set = (campo: keyof typeof valores) => (e: { target: { value: string } }) =>
    setValores((v) => ({ ...v, [campo]: e.target.value }));

  return (
    <form
      action={action}
      noValidate
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Nuevo usuario</h2>
        <p className="text-sm text-muted">Se crea activo, con una contraseña temporal que verás una sola vez.</p>
      </div>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nuevo-nombre" label="Nombre" error={state.fieldErrors?.nombre}>
          <Input
            id="nuevo-nombre"
            name="nombre"
            value={valores.nombre}
            onChange={set("nombre")}
            maxLength={80}
            autoComplete="off"
            invalid={Boolean(state.fieldErrors?.nombre)}
            describedBy={state.fieldErrors?.nombre ? "error" : undefined}
          />
        </Field>
        <Field id="nuevo-correo" label="Correo" error={state.fieldErrors?.correo}>
          <Input
            id="nuevo-correo"
            name="correo"
            type="email"
            inputMode="email"
            value={valores.correo}
            onChange={set("correo")}
            maxLength={254}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            invalid={Boolean(state.fieldErrors?.correo)}
            describedBy={state.fieldErrors?.correo ? "error" : undefined}
          />
        </Field>
      </div>
      <Field id="nuevo-rol" label="Rol" hint="El cajero vende y consulta productos. El dueño puede todo." error={state.fieldErrors?.rol}>
        <Select id="nuevo-rol" name="rol" value={valores.rol} onChange={set("rol")} describedBy="hint">
          <option value="cajero">Cajero</option>
          <option value="dueno">Dueño</option>
        </Select>
      </Field>

      <div className="flex gap-2">
        <Button type="submit" pending={pending} pendingLabel="Creando…" icon={<UserPlus aria-hidden className="size-[18px]" />}>
          Crear usuario
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** La contraseña temporal se ve solo aquí: al cerrar, no hay forma de volver a verla. */
function Creado({ creado, onClose }: { creado: { correo: string; password: string }; onClose: () => void }) {
  const [copia, setCopia] = useState<"lista" | "copiada" | "manual">("lista");
  const codigo = useRef<HTMLElement>(null);

  /** Deja la contraseña seleccionada (para copiar a mano si todo lo demás falla). */
  function seleccionar() {
    const el = codigo.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const rango = document.createRange();
    rango.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(rango);
  }

  async function copiar() {
    // navigator.clipboard solo existe en HTTPS o localhost; por la IP de la red
    // local (http://192.168…) no está. Respaldo: copiar la selección.
    try {
      await navigator.clipboard.writeText(creado.password);
      setCopia("copiada");
    } catch {
      seleccionar();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      setCopia(ok ? "copiada" : "manual");
    }
    setTimeout(() => setCopia((c) => (c === "copiada" ? "lista" : c)), 2000);
  }

  return (
    <section
      aria-label="Usuario creado"
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:p-5"
    >
      <Notice tone="success">Usuario creado y activo.</Notice>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">Correo</p>
        <p className="text-base font-medium [overflow-wrap:anywhere]">{creado.correo}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm text-muted">Contraseña temporal</p>
        <div className="flex flex-wrap items-center gap-2">
          <code
            ref={codigo}
            className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2 font-mono text-lg tracking-wide select-all"
          >
            {creado.password}
          </code>
          <Button
            variant="secondary"
            onClick={copiar}
            icon={copia === "copiada" ? <Check aria-hidden className="size-[18px]" /> : <Copy aria-hidden className="size-[18px]" />}
          >
            {copia === "copiada" ? "Copiada" : "Copiar"}
          </Button>
        </div>
        <p aria-live="polite" className="text-sm text-muted">
          {copia === "manual" ? "No se pudo copiar sola: ya está seleccionada, cópiala con el menú del navegador." : ""}
        </p>
        <p className="text-sm text-muted">Compártela ahora con la persona: no se vuelve a mostrar.</p>
      </div>
      <Button variant="ghost" className="self-start" onClick={onClose}>
        Listo
      </Button>
    </section>
  );
}
