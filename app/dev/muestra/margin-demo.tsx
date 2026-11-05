"use client";

import { useState } from "react";
import { Field, Input } from "@/app/components/ui/field";
import { MarginPill } from "@/app/components/ui/margin-pill";
import { toCents } from "@/app/lib/money";

/** Prueba en vivo del cálculo de margen (el mismo que usará el formulario). */
export function MarginDemo() {
  const [costo, setCosto] = useState("95");
  const [precio, setPrecio] = useState("159");
  const costoCents = toCents(costo);
  const precioCents = toCents(precio);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="demo-costo"
          label="Costo"
          error={costo !== "" && costoCents === null ? "Monto no válido" : undefined}
        >
          <Input
            id="demo-costo"
            prefix="$"
            inputMode="decimal"
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            invalid={costo !== "" && costoCents === null}
            describedBy="error"
          />
        </Field>
        <Field
          id="demo-precio"
          label="Precio"
          error={precio !== "" && precioCents === null ? "Monto no válido" : undefined}
        >
          <Input
            id="demo-precio"
            prefix="$"
            inputMode="decimal"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            invalid={precio !== "" && precioCents === null}
            describedBy="error"
          />
        </Field>
      </div>
      <div>
        <MarginPill costoCents={costoCents} precioCents={precioCents} unidad="pieza" />
      </div>
    </div>
  );
}
