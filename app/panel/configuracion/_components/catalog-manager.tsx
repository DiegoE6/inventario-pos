"use client";

import { useActionState, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import { Field, Input } from "@/app/components/ui/field";
import type { FormState } from "@/app/lib/types";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type CatalogField = {
  name: string;
  label: string;
  maxLength: number;
  type?: "text" | "tel";
  placeholder?: string;
  multiline?: boolean;
};

export type CatalogItem = {
  id: number;
  activo: boolean;
  values: Record<string, string>;
  subtitle?: string;
};

/**
 * Catálogo con alta, edición en línea y activar/desactivar. Sirve para
 * categorías (un campo) y proveedores (varios campos).
 */
export function CatalogManager({
  items,
  fields,
  labels,
  crear,
  actualizar,
  cambiarEstado,
}: {
  items: CatalogItem[];
  fields: CatalogField[];
  labels: { nuevo: string; agregar: string; vacio: string };
  crear: Action;
  actualizar: Action;
  cambiarEstado: Action;
}) {
  const [state, action, pending] = useActionState(crear, {});
  const activos = items.filter((i) => i.activo);
  const inactivos = items.filter((i) => !i.activo);

  return (
    <div className="flex flex-col gap-6">
      <form
        action={action}
        noValidate
        className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4"
      >
        <p className="text-base font-semibold">{labels.nuevo}</p>
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        {/* key: después de agregar, los campos se limpian. */}
        <Fields key={state.okKey ?? 0} idPrefix="nuevo" fields={fields} errors={state.fieldErrors} />
        <Button
          type="submit"
          pending={pending}
          pendingLabel="Agregando…"
          icon={<Plus aria-hidden className="size-[18px]" />}
          className="self-start"
        >
          {labels.agregar}
        </Button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-6 py-10 text-center text-base text-muted">
          {labels.vacio}
        </p>
      ) : (
        <>
          <ItemList items={activos} fields={fields} actualizar={actualizar} cambiarEstado={cambiarEstado} />
          {inactivos.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-muted">Desactivados</h2>
              <ItemList items={inactivos} fields={fields} actualizar={actualizar} cambiarEstado={cambiarEstado} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function ItemList({
  items,
  fields,
  actualizar,
  cambiarEstado,
}: {
  items: CatalogItem[];
  fields: CatalogField[];
  actualizar: Action;
  cambiarEstado: Action;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      {items.map((item) => (
        <Row key={item.id} item={item} fields={fields} actualizar={actualizar} cambiarEstado={cambiarEstado} />
      ))}
    </ul>
  );
}

function Row({
  item,
  fields,
  actualizar,
  cambiarEstado,
}: {
  item: CatalogItem;
  fields: CatalogField[];
  actualizar: Action;
  cambiarEstado: Action;
}) {
  const [editing, setEditing] = useState(false);
  const [saveState, saveAction, saving] = useActionState(actualizar, {});
  const [toggleState, toggleAction, toggling] = useActionState(cambiarEstado, {});

  // Al guardar con éxito, se cierra la edición (ajuste de estado durante el
  // render a partir de un cambio en props/estado; patrón documentado de React).
  const [seenOk, setSeenOk] = useState(saveState.okKey);
  if (saveState.okKey !== seenOk) {
    setSeenOk(saveState.okKey);
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="p-4">
        <form action={saveAction} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="id" value={item.id} />
          {saveState.error ? <Notice tone="danger">{saveState.error}</Notice> : null}
          <Fields idPrefix={`e${item.id}`} fields={fields} initial={item.values} errors={saveState.fieldErrors} />
          <div className="flex gap-2">
            <Button type="submit" pending={saving} pendingLabel="Guardando…">
              Guardar
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
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
        <div className="min-w-0 flex-1">
          <p className={`text-base font-medium ${item.activo ? "" : "text-muted"}`}>{item.values.nombre}</p>
          {item.subtitle ? <p className="text-sm text-muted">{item.subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label={`Editar ${item.values.nombre}`}
            className="px-3"
            icon={<Pencil aria-hidden className="size-[18px]" />}
          >
            <span className="hidden sm:inline">Editar</span>
          </Button>
          <form action={toggleAction}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="activo" value={item.activo ? "false" : "true"} />
            <Button
              type="submit"
              variant={item.activo ? "ghost" : "secondary"}
              pending={toggling}
              className={item.activo ? "px-3 text-danger" : "px-3"}
            >
              {item.activo ? "Desactivar" : "Activar"}
            </Button>
          </form>
        </div>
      </div>
      {toggleState.error ? <Notice tone="danger">{toggleState.error}</Notice> : null}
    </li>
  );
}

/** Campos controlados (React 19 limpia los no controlados tras cada envío). */
function Fields({
  idPrefix,
  fields,
  initial = {},
  errors = {},
}: {
  idPrefix: string;
  fields: CatalogField[];
  initial?: Record<string, string>;
  errors?: Record<string, string>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? ""]))
  );

  return (
    <div className={`grid gap-4 ${fields.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {fields.map((f) => {
        const id = `${idPrefix}-${f.name}`;
        const error = errors[f.name];
        const common = {
          id,
          name: f.name,
          value: values[f.name],
          maxLength: f.maxLength,
          placeholder: f.placeholder,
          onChange: (e: { target: { value: string } }) =>
            setValues((prev) => ({ ...prev, [f.name]: e.target.value })),
        };
        return (
          <div key={f.name} className={f.multiline ? "sm:col-span-2" : ""}>
            <Field id={id} label={f.label} error={error}>
              {f.multiline ? (
                <textarea
                  {...common}
                  rows={2}
                  className="w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2.5 text-base text-foreground transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              ) : (
                <Input
                  {...common}
                  type={f.type ?? "text"}
                  inputMode={f.type === "tel" ? "tel" : undefined}
                  autoComplete="off"
                  invalid={Boolean(error)}
                  describedBy={error ? "error" : undefined}
                />
              )}
            </Field>
          </div>
        );
      })}
    </div>
  );
}
