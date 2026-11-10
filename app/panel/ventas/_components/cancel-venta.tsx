"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Ban } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import { Field } from "@/app/components/ui/field";
import type { FormState } from "@/app/lib/types";
import { cancelarVenta } from "../actions";

const MAX = 200;

/**
 * Cancelar con motivo y confirmación. Solo se pinta para el dueño; la Server
 * Action (requireDueno) y cancelar_venta en la BD lo vuelven a validar.
 * Al cancelar, la página se revalida y muestra quién, cuándo y por qué.
 */
export function CancelVenta({
  ventaId,
  folio,
  renglones,
}: {
  ventaId: string;
  folio: string;
  renglones: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(cancelarVenta, {});
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (state.okKey) ref.current?.close();
  }, [state.okKey]);

  function abrir() {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    d.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }

  const error = state.fieldErrors?.motivo;

  return (
    <>
      <Button
        variant="secondary"
        onClick={abrir}
        className="text-danger hover:bg-danger-soft"
        icon={<Ban aria-hidden className="size-[18px]" />}
      >
        Cancelar venta
      </Button>
      <dialog
        ref={ref}
        aria-labelledby="cancelar-titulo"
        className="app-dialog m-auto w-[min(100%-2rem,440px)] rounded-[var(--radius-card)] border border-border bg-surface p-0 text-foreground backdrop:bg-black/40"
      >
        <form action={action} className="flex flex-col gap-4 p-4">
          <input type="hidden" name="venta_id" value={ventaId} />
          <div className="flex flex-col gap-1.5">
            <h2 id="cancelar-titulo" className="text-lg font-semibold">
              ¿Cancelar la venta {folio}?
            </h2>
            <p className="text-[15px] text-muted">
              {renglones === 1 ? "El producto regresa" : `Los ${renglones} productos regresan`} al inventario y la
              venta deja de contar en los reportes. No se puede deshacer.
            </p>
          </div>

          <Field
            id="motivo"
            label="Motivo"
            error={error}
            hint={`${motivo.trim().length}/${MAX} · por ejemplo: "El cliente devolvió la mercancía"`}
          >
            <textarea
              id="motivo"
              name="motivo"
              rows={3}
              required
              minLength={3}
              maxLength={MAX}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "motivo-error" : "motivo-hint"}
              className={`w-full rounded-[var(--radius-control)] border bg-surface px-3 py-2.5 text-base text-foreground transition-[border-color,box-shadow] duration-150 ease-out focus:outline-none focus:ring-2 ${
                error
                  ? "border-danger focus:border-danger focus:ring-danger/20"
                  : "border-border-strong focus:border-primary focus:ring-primary/20"
              }`}
            />
          </Field>

          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => ref.current?.close()} disabled={pending}>
              No, volver
            </Button>
            <Button type="submit" variant="danger" pending={pending} pendingLabel="Cancelando…">
              Sí, cancelar venta
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
