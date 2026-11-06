"use client";

import { startTransition, useActionState, useState } from "react";
import { Save } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import { Field, Input, Select } from "@/app/components/ui/field";
import { MarginPill } from "@/app/components/ui/margin-pill";
import { UNIDAD_CORTA, unidadCorta } from "@/app/lib/format";
import { toCents } from "@/app/lib/money";
import { UNIDADES, UNIDADES_ENTERAS, type FormState, type Unidad } from "@/app/lib/types";

type Option = { id: number; nombre: string };

export type ProductFormValues = {
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria_id: string;
  proveedor_id: string;
  unidad: Unidad;
  costo: string;
  precio: string;
  stock_minimo: string;
  stock_inicial: string;
  activo: boolean;
};

export const EMPTY_PRODUCT: ProductFormValues = {
  codigo: "",
  nombre: "",
  descripcion: "",
  categoria_id: "",
  proveedor_id: "",
  unidad: "pieza",
  costo: "",
  precio: "",
  stock_minimo: "0",
  stock_inicial: "0",
  activo: true,
};

/**
 * Alta y edición de producto. Campos controlados: React 19 limpia los
 * formularios no controlados después de cada envío, y aquí hay que conservar
 * lo capturado cuando hay errores (y el margen se calcula en vivo).
 */
export function ProductForm({
  mode,
  action,
  initial,
  categorias,
  proveedores,
}: {
  mode: "crear" | "editar";
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: ProductFormValues;
  categorias: Option[];
  proveedores: Option[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [v, setV] = useState(initial);
  const set =
    <K extends keyof ProductFormValues>(key: K) =>
    (value: ProductFormValues[K]) =>
      setV((prev) => ({ ...prev, [key]: value }));

  const errors = state.fieldErrors ?? {};
  const entera = UNIDADES_ENTERAS.includes(v.unidad);
  const qtyMode = entera ? "numeric" : "decimal";
  const u = UNIDAD_CORTA[v.unidad];

  return (
    <form
      // onSubmit + startTransition en lugar de action={...}: con action, React 19
      // hace form.reset() al terminar y la casilla "Activo" (controlada) se
      // quedaba mostrando su valor inicial aunque se guardara otro.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      noValidate
      className="flex flex-col gap-6"
    >
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok && state.message ? <Notice tone="success">{state.message}</Notice> : null}

      <Section title="Datos del producto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="codigo" label="Código" hint="El del código de barras o uno tuyo." error={errors.codigo}>
            <Input
              id="codigo"
              value={v.codigo}
              onChange={(e) => set("codigo")(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={50}
              invalid={Boolean(errors.codigo)}
              describedBy={errors.codigo ? "error" : "hint"}
            />
          </Field>
          <Field id="nombre" label="Nombre" error={errors.nombre}>
            <Input
              id="nombre"
              value={v.nombre}
              onChange={(e) => set("nombre")(e.target.value)}
              placeholder="Ej. Flexómetro 5 m"
              maxLength={150}
              invalid={Boolean(errors.nombre)}
              describedBy={errors.nombre ? "error" : undefined}
            />
          </Field>
        </div>

        <Field id="descripcion" label="Descripción (opcional)" error={errors.descripcion}>
          <textarea
            id="descripcion"
            name="descripcion"
            rows={2}
            maxLength={500}
            value={v.descripcion}
            onChange={(e) => set("descripcion")(e.target.value)}
            className="w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2.5 text-base text-foreground transition-[border-color,box-shadow] duration-150 ease-out focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="categoria_id" label="Categoría" error={errors.categoria_id}>
            <Select
              id="categoria_id"
              value={v.categoria_id}
              onChange={(e) => set("categoria_id")(e.target.value)}
              invalid={Boolean(errors.categoria_id)}
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="proveedor_id" label="Proveedor" error={errors.proveedor_id}>
            <Select
              id="proveedor_id"
              value={v.proveedor_id}
              onChange={(e) => set("proveedor_id")(e.target.value)}
              invalid={Boolean(errors.proveedor_id)}
            >
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="unidad" label="Se vende por" error={errors.unidad}>
            <Select
              id="unidad"
              value={v.unidad}
              onChange={(e) => set("unidad")(e.target.value as Unidad)}
              invalid={Boolean(errors.unidad)}
              describedBy={errors.unidad ? "error" : undefined}
            >
              {UNIDADES.map((un) => (
                <option key={un.value} value={un.value}>
                  {un.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Precio">
        <div className="grid grid-cols-2 gap-4">
          <Field id="costo" label={`Costo por ${u}`} error={errors.costo}>
            <Input
              id="costo"
              prefix="$"
              inputMode="decimal"
              autoComplete="off"
              value={v.costo}
              onChange={(e) => set("costo")(e.target.value)}
              placeholder="0.00"
              invalid={Boolean(errors.costo)}
              describedBy={errors.costo ? "error" : undefined}
            />
          </Field>
          <Field id="precio" label={`Precio por ${u}`} error={errors.precio}>
            <Input
              id="precio"
              prefix="$"
              inputMode="decimal"
              autoComplete="off"
              value={v.precio}
              onChange={(e) => set("precio")(e.target.value)}
              placeholder="0.00"
              invalid={Boolean(errors.precio)}
              describedBy={errors.precio ? "error" : undefined}
            />
          </Field>
        </div>
        <div>
          <MarginPill costoCents={toCents(v.costo)} precioCents={toCents(v.precio)} unidad={v.unidad} />
        </div>
      </Section>

      <Section title="Inventario">
        <div className="grid grid-cols-2 gap-4">
          {mode === "crear" ? (
            <Field
              id="stock_inicial"
              label={`Stock inicial (${unidadCorta(v.unidad)})`}
              hint="Se registra como entrada de inventario."
              error={errors.stock_inicial}
            >
              <Input
                id="stock_inicial"
                inputMode={qtyMode}
                autoComplete="off"
                value={v.stock_inicial}
                onChange={(e) => set("stock_inicial")(e.target.value)}
                invalid={Boolean(errors.stock_inicial)}
                describedBy={errors.stock_inicial ? "error" : "hint"}
              />
            </Field>
          ) : null}
          <Field
            id="stock_minimo"
            label={`Stock mínimo (${unidadCorta(v.unidad)})`}
            hint="Debajo de esto, te avisa."
            error={errors.stock_minimo}
          >
            <Input
              id="stock_minimo"
              inputMode={qtyMode}
              autoComplete="off"
              value={v.stock_minimo}
              onChange={(e) => set("stock_minimo")(e.target.value)}
              invalid={Boolean(errors.stock_minimo)}
              describedBy={errors.stock_minimo ? "error" : "hint"}
            />
          </Field>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="activo"
            type="checkbox"
            name="activo"
            checked={v.activo}
            onChange={(e) => set("activo")(e.target.checked)}
            aria-describedby="activo-hint"
            className="mt-3 size-5 shrink-0 rounded accent-[var(--color-primary)]"
          />
          <div className="flex flex-col">
            <label htmlFor="activo" className="flex min-h-11 cursor-pointer items-center text-base">
              Activo
            </label>
            <p id="activo-hint" className="-mt-2 text-sm text-muted">
              Si lo desactivas, no aparece para vender.
            </p>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] z-10 md:static">
        <Button
          type="submit"
          size="lg"
          className="w-full shadow-sm md:w-auto"
          pending={pending}
          pendingLabel="Guardando…"
          icon={<Save aria-hidden className="size-[18px]" />}
        >
          {mode === "crear" ? "Crear producto" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="text-base font-semibold">
        {title}
      </p>
      {children}
    </fieldset>
  );
}
