"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { ProductPicker } from "@/app/components/product-search/product-picker";
import { Button } from "@/app/components/ui/button";
import { Field, Input } from "@/app/components/ui/field";
import { aceptaDecimales, milliToString, parseQtyMilli, stockMilli } from "@/app/lib/cart";
import { formatMoney, formatQuantity, UNIDAD_CORTA, unidadCorta, type Unidad } from "@/app/lib/format";
import { toCents } from "@/app/lib/money";
import { uuidv4 } from "@/app/lib/uuid";
import {
  registrarConteo,
  registrarEntrada,
  registrarMerma,
  type InventarioResult,
} from "../actions";

export type Operacion = "entrada" | "merma" | "conteo";

export type ProductoOperacion = {
  id: string;
  codigo: string;
  nombre: string;
  unidad: Unidad;
  stock: number;
  costo: number;
  activo: boolean;
};

/**
 * Entrada, merma o conteo de UN producto. El producto se elige con el
 * buscador y queda en la URL (?producto=id): así el servidor lee sus datos
 * (incluido el costo, solo dueño) y sus últimos movimientos.
 */
export function OperacionForm({
  operacion,
  producto,
  recientes,
}: {
  operacion: Operacion;
  producto: ProductoOperacion | null;
  /** Últimos movimientos del producto (renderizados en el servidor). */
  recientes: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, startNav] = useTransition();
  // Aviso de la última entrada/merma, visible junto al buscador.
  const [aviso, setAviso] = useState<string | null>(null);

  function elegir(id: string | null) {
    if (id) setAviso(null);
    startNav(() => router.replace(id ? `${pathname}?producto=${id}` : pathname, { scroll: false }));
  }

  if (!producto) {
    return (
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        {aviso ? <Notice tone="success">{aviso}</Notice> : null}
        <p className="text-base font-semibold">{aviso ? "Siguiente producto" : "Elige el producto"}</p>
        {/* autoFocus: después de registrar, el foco queda aquí para seguir capturando. */}
        <ProductPicker id={`${operacion}-buscar`} onSelect={(p) => elegir(p.id)} />
        {navegando ? <p className="text-sm text-muted">Cargando producto…</p> : null}
      </section>
    );
  }

  return (
    // key: otro producto = formulario y clave nuevos.
    <Formulario
      key={producto.id}
      operacion={operacion}
      producto={producto}
      recientes={recientes}
      onCambiar={() => elegir(null)}
      cambiando={navegando}
      // Entrada y merma: al registrar, regresa al buscador (pedido completo
      // seguido). El conteo se queda en el producto para revisar el resultado.
      onRegistrado={
        operacion === "conteo"
          ? undefined
          : (mensaje) => {
              setAviso(mensaje);
              elegir(null);
            }
      }
    />
  );
}

/** "0", "0.0" → 0 milésimas (el conteo sí acepta cero). */
function parseConteoMilli(value: string, unidad: Unidad): number | null {
  if (/^0+(\.0{0,3})?$/.test(value.trim())) return 0;
  return parseQtyMilli(value, unidad);
}

const qty = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 });
const signed = (milli: number, unidad: Unidad) =>
  `${milli > 0 ? "+" : milli < 0 ? "−" : ""}${qty.format(Math.abs(milli) / 1000)} ${unidadCorta(unidad, Math.abs(milli) / 1000)}`;

function Formulario({
  operacion,
  producto,
  recientes,
  onCambiar,
  cambiando,
  onRegistrado,
}: {
  operacion: Operacion;
  producto: ProductoOperacion;
  recientes: ReactNode;
  onCambiar: () => void;
  cambiando: boolean;
  onRegistrado?: (mensaje: string) => void;
}) {
  const router = useRouter();
  const u = UNIDAD_CORTA[producto.unidad];
  const [clave, setClave] = useState(uuidv4);
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState(producto.costo.toFixed(2));
  const [nota, setNota] = useState("");
  // Stock contra el que se calculó la diferencia del conteo. Se fija cuando la
  // BD responde que cambió; si no, es el que trae la página.
  const [stockOverride, setStockOverride] = useState<number | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [perdida, setPerdida] = useState(false);
  // Se tocó Registrar: desde aquí se muestran los campos que faltan.
  const [intento, setIntento] = useState(false);
  const [enviando, startEnvio] = useTransition();
  const bloqueo = useRef(false); // doble toque antes del re-render

  const stockBase = stockOverride ?? producto.stock;
  const baseMilli = stockMilli(stockBase);
  const milli =
    operacion === "conteo"
      ? parseConteoMilli(cantidad, producto.unidad)
      : parseQtyMilli(cantidad, producto.unidad);

  // Vista previa del resultado.
  let previa: { nuevo: number; diff: number } | null = null;
  if (milli !== null) {
    if (operacion === "entrada") previa = { nuevo: baseMilli + milli, diff: milli };
    if (operacion === "merma") previa = { nuevo: baseMilli - milli, diff: -milli };
    if (operacion === "conteo") previa = { nuevo: milli, diff: milli - baseMilli };
  }

  const cantidadError =
    cantidad.trim() && milli === null
      ? aceptaDecimales(producto.unidad)
        ? "Usa una cantidad como 10 o 2.5 (hasta 3 decimales)."
        : `Los productos por ${producto.unidad} no aceptan decimales.`
      : operacion === "merma" && milli !== null && milli > baseMilli
        ? `Solo hay ${formatQuantity(stockBase, producto.unidad)}.`
        : undefined;
  const costoInvalido = operacion === "entrada" && costo.trim() !== "" && toCents(costo) === null;
  const notaFalta = operacion === "merma" && nota.trim() === "";

  // La nota faltante NO apaga el botón: al tocarlo se marca el campo.
  const valido = milli !== null && !cantidadError && !costoInvalido && !enviando;
  const notaError = fieldErrors.nota ?? (intento && notaFalta ? "Escribe qué pasó." : undefined);

  function registrar() {
    if (notaFalta) {
      setIntento(true);
      document.getElementById(`${operacion}-nota`)?.focus();
      return;
    }
    if (bloqueo.current || !valido || milli === null) return;
    bloqueo.current = true;
    setError(null);
    setExito(null);
    setPerdida(false);

    const comun = { clave, producto_id: producto.id };
    const cantidadTexto = milliToString(milli);

    startEnvio(async () => {
      try {
        let res: InventarioResult;
        if (operacion === "entrada") {
          res = await registrarEntrada({ ...comun, cantidad: cantidadTexto, costo, nota });
        } else if (operacion === "merma") {
          res = await registrarMerma({ ...comun, cantidad: cantidadTexto, nota });
        } else {
          res = await registrarConteo({ ...comun, contado: cantidadTexto, stock_esperado: stockBase, nota });
        }

        if (res.ok) {
          const mensaje = mensajeExito(res, producto.unidad);
          setClave(uuidv4()); // la siguiente operación es otra
          setCantidad("");
          setNota("");
          setIntento(false);
          setStockOverride(null);
          setFieldErrors({});
          if (onRegistrado) {
            onRegistrado(mensaje); // regresa al buscador con el aviso
            return;
          }
          setExito(mensaje);
          router.refresh(); // stock y últimos movimientos desde el servidor
          return;
        }
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        // Conteo: el stock cambió. Se recalcula la diferencia contra el stock
        // actual; lo capturado se queda y la misma clave sirve (no se registró).
        // router.refresh() actualiza también el "Stock actual" y los movimientos.
        if (res.stockActual !== undefined) {
          setStockOverride(res.stockActual);
          router.refresh();
        }
      } catch {
        // No se sabe si quedó registrado: se muestran los últimos movimientos.
        // Reintentar con la misma clave nunca lo registra dos veces.
        setPerdida(true);
        router.refresh();
      } finally {
        bloqueo.current = false;
      }
    });
  }

  const stockCambio = operacion === "conteo" && stockOverride !== null && error;
  const titulo = { entrada: "Entrada", merma: "Merma", conteo: "Conteo" }[operacion];

  return (
    <div className="flex flex-col gap-6">
      {/* Producto elegido */}
      <section className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-lg font-semibold leading-snug">{producto.nombre}</p>
          <p className="text-[13px] text-muted">
            <span className="font-mono">{producto.codigo}</span>
            {producto.activo ? null : " · Inactivo"}
          </p>
          <p className="mt-2 text-sm text-muted">Stock actual</p>
          <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
            {formatQuantity(producto.stock, producto.unidad)}
          </p>
        </div>
        <Button variant="secondary" onClick={onCambiar} pending={cambiando} pendingLabel="Cambiando…">
          Cambiar producto
        </Button>
      </section>

      {/* Formulario */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          registrar();
        }}
        noValidate
        className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4"
      >
        <p className="text-base font-semibold">{titulo}</p>

        {exito ? <Notice tone="success">{exito}</Notice> : null}

        {perdida ? (
          <div className="flex flex-col gap-2">
            <Notice tone="danger">
              No se pudo confirmar si quedó registrado. Revisa abajo los últimos movimientos: si ya aparece, no
              lo repitas; si no, vuelve a tocar el botón (no se registrará dos veces).
            </Notice>
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => router.refresh()}
              icon={<RefreshCw aria-hidden className="size-[18px]" />}
            >
              Actualizar movimientos
            </Button>
          </div>
        ) : null}

        {stockCambio ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-danger-soft p-3 text-sm text-danger">
            <p className="font-medium">
              El stock cambió mientras contabas: ahora hay {formatQuantity(stockBase, producto.unidad)}.
            </p>
            {previa ? (
              <p>
                Con tu conteo de {qty.format(milli! / 1000)} {unidadCorta(producto.unidad, milli! / 1000)}, la diferencia es{" "}
                <span className="font-semibold tabular-nums">{signed(previa.diff, producto.unidad)}</span>.
              </p>
            ) : null}
            <Button type="submit" className="self-start" pending={enviando} pendingLabel="Confirmando…">
              Confirmar con el stock actual
            </Button>
          </div>
        ) : error ? (
          <Notice tone="danger">{error}</Notice>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={`${operacion}-cantidad`}
            label={operacion === "conteo" ? `¿Cuánto contaste? (${unidadCorta(producto.unidad)})` : `Cantidad (${unidadCorta(producto.unidad)})`}
            error={cantidadError ?? fieldErrors.cantidad ?? fieldErrors.contado}
          >
            <Input
              id={`${operacion}-cantidad`}
              inputMode={aceptaDecimales(producto.unidad) ? "decimal" : "numeric"}
              autoComplete="off"
              autoFocus
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(",", "."))}
              invalid={Boolean(cantidadError)}
              describedBy={cantidadError ? "error" : undefined}
            />
          </Field>

          {operacion === "entrada" ? (
            <Field
              id="entrada-costo"
              label={`Costo por ${u}`}
              hint={`Último costo: ${formatMoney(producto.costo)}. Se guarda como el costo del producto.`}
              error={costoInvalido ? "Usa un monto como 12.50." : fieldErrors.costo}
            >
              <Input
                id="entrada-costo"
                prefix="$"
                inputMode="decimal"
                autoComplete="off"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                invalid={costoInvalido}
                describedBy={costoInvalido ? "error" : "hint"}
              />
            </Field>
          ) : null}
        </div>

        <Field
          id={`${operacion}-nota`}
          label={operacion === "merma" ? "¿Qué pasó?" : "Nota (opcional)"}
          error={notaError}
        >
          <Input
            id={`${operacion}-nota`}
            autoComplete="off"
            maxLength={300}
            placeholder={
              operacion === "merma"
                ? "Ej. Se cayó y se rompió"
                : operacion === "entrada"
                  ? "Ej. Factura 1234"
                  : "Ej. Conteo de fin de mes"
            }
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            invalid={Boolean(notaError)}
            describedBy={notaError ? "error" : undefined}
          />
        </Field>

        {/* Vista previa (solo con una cantidad válida: nunca un stock negativo) */}
        {previa && !cantidadError ? (
          <p className="flex flex-wrap items-center gap-2 text-base tabular-nums" aria-live="polite">
            <span className="text-muted">Stock</span>
            <span>{formatQuantity(stockBase, producto.unidad)}</span>
            <ArrowRight aria-hidden className="size-4 text-muted" />
            <span className="font-semibold">{qty.format(previa.nuevo / 1000)} {unidadCorta(producto.unidad, previa.nuevo / 1000)}</span>
            {operacion === "conteo" ? (
              <span
                className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${
                  previa.diff === 0
                    ? "bg-surface-muted text-muted"
                    : previa.diff > 0
                      ? "bg-success-soft text-success"
                      : "bg-danger-soft text-danger"
                }`}
              >
                {previa.diff === 0 ? "Sin diferencia" : signed(previa.diff, producto.unidad)}
              </span>
            ) : null}
          </p>
        ) : null}

        {stockCambio ? null : (
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:self-start" disabled={!valido} pending={enviando} pendingLabel="Registrando…">
            {operacion === "entrada" ? "Registrar entrada" : operacion === "merma" ? "Registrar merma" : "Confirmar conteo"}
          </Button>
        )}
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Últimos movimientos de este producto</h2>
        {recientes}
      </section>
    </div>
  );
}

function mensajeExito(res: Extract<InventarioResult, { ok: true }>, unidad: Unidad): string {
  const pre = res.repetido ? "Ya se había registrado; no se aplicó de nuevo. " : "";
  const m = res.movimiento;
  if (!m) return `${pre}El conteo coincide con el sistema: no se registró ningún ajuste.`;
  const nombre = { entrada: "Entrada registrada", merma: "Merma registrada", ajuste: "Ajuste registrado" }[m.tipo];
  return `${pre}${nombre}: ${signed(Math.round(m.cantidad * 1000), unidad)} (${qty.format(m.stock_anterior)} → ${qty.format(m.stock_nuevo)} ${unidadCorta(unidad, m.stock_nuevo)}).`;
}
