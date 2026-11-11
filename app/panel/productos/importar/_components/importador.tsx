"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { CircleAlert, Download, FileSpreadsheet, RotateCcw, TriangleAlert, Upload } from "lucide-react";
import { Notice } from "@/app/components/notice";
import { Button, buttonClasses } from "@/app/components/ui/button";
import { formatMoney, formatQuantity } from "@/app/lib/format";
import type { Vista } from "@/app/lib/importar";
import { uuidv4 } from "@/app/lib/uuid";
import { descargarErrores, guardarImportacion, previsualizar, type Resumen } from "../actions";

const MOSTRAR = 50;

/**
 * Importar en tres pasos: plantilla, archivo y vista previa. El archivo se lee
 * y valida en el servidor; aquí solo se muestra lo que regresó. Guardar manda
 * las filas válidas con una clave: un doble clic no importa dos veces.
 */
export function Importador({ maxBytes, maxFilas }: { maxBytes: number; maxFilas: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [leyendo, startLeer] = useTransition();
  const [guardando, startGuardar] = useTransition();
  const [bajando, startBajar] = useTransition();
  const [archivo, setArchivo] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [clave, setClave] = useState("");
  const [actualizar, setActualizar] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  function reiniciar() {
    setArchivo(null);
    setVista(null);
    setError(null);
    setResumen(null);
    setActualizar(false);
    setAcepto(false);
    if (input.current) input.current.value = "";
  }

  function elegir(file: File | undefined) {
    if (!file) return;
    reiniciar();
    setArchivo(file.name);
    if (file.size > maxBytes) {
      setError("El archivo pesa más de 1 MB. Divídelo en partes.");
      return;
    }
    const fd = new FormData();
    fd.set("archivo", file);
    startLeer(async () => {
      const r = await previsualizar(fd);
      if (r.ok) {
        setVista(r.vista);
        setClave(uuidv4()); // una clave por vista previa
      } else setError(r.error);
    });
  }

  function guardar() {
    if (!vista) return;
    setError(null);
    const filas = [...vista.nuevas, ...vista.existentes].map((f) => ({ fila: f.fila, datos: f.datos }));
    startGuardar(async () => {
      const r = await guardarImportacion({ clave, actualizar, filas });
      if (r.ok) setResumen(r.resumen);
      else setError(r.error);
    });
  }

  function bajarErrores() {
    if (!vista) return;
    startBajar(async () => {
      const r = await descargarErrores(vista.errores);
      if (!r.ok) return setError(r.error);
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "filas-con-error.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ---------------------------------------------------------------------------
  if (resumen) {
    return (
      <section aria-live="polite" className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <Notice tone="success">
          {resumen.repetida ? "Esta importación ya se había guardado; no se repitió. " : "Importación guardada. "}
          {conteo(resumen.creados, "producto nuevo", "productos nuevos")}
          {resumen.actualizados > 0 ? `, ${conteo(resumen.actualizados, "actualizado", "actualizados")}` : ""}
          {resumen.omitidos > 0 ? `, ${conteo(resumen.omitidos, "omitido", "omitidos")}` : ""}.
        </Notice>
        {resumen.categorias_creadas.length > 0 ? (
          <p className="text-sm text-muted">Categorías nuevas: {resumen.categorias_creadas.join(", ")}.</p>
        ) : null}
        {resumen.proveedores_creados.length > 0 ? (
          <p className="text-sm text-muted">Proveedores nuevos: {resumen.proveedores_creados.join(", ")}.</p>
        ) : null}
        <p className="text-sm text-muted">El stock inicial de cada producto quedó como entrada en Inventario.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/panel/productos" className={buttonClasses()}>
            Ver productos
          </Link>
          <Button variant="secondary" onClick={reiniciar} icon={<RotateCcw aria-hidden className="size-[18px]" />}>
            Importar otro archivo
          </Button>
        </div>
      </section>
    );
  }

  const conCambios = vista?.existentes.filter((e) => e.precio || e.costo) ?? [];
  const aGuardar = (vista?.nuevas.length ?? 0) + (actualizar ? conCambios.length : 0);
  const errores = vista?.errores.length ?? 0;

  return (
    <>
      <Paso n={1} titulo="Descarga la plantilla">
        <p className="text-[15px] text-muted">
          Trae las columnas que se esperan, una fila de ejemplo y las categorías y proveedores que ya tienes.
        </p>
        <a
          href="/panel/productos/importar/plantilla"
          download
          className={buttonClasses({ variant: "secondary", className: "self-start" })}
        >
          <Download aria-hidden className="size-[18px]" />
          Descargar plantilla
        </a>
      </Paso>

      <Paso n={2} titulo="Sube tu archivo">
        <p className="text-[15px] text-muted">
          Excel (.xlsx) o CSV, hasta 1 MB y {maxFilas} productos.
        </p>
        <label
          className={buttonClasses({
            variant: vista ? "secondary" : "primary",
            className: `self-start cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-ink ${leyendo ? "pointer-events-none opacity-60" : ""}`,
          })}
        >
          <Upload aria-hidden className="size-[18px]" />
          {vista || archivo ? "Elegir otro archivo" : "Elegir archivo"}
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            disabled={leyendo || guardando}
            onChange={(e) => elegir(e.target.files?.[0])}
          />
        </label>
        {archivo ? (
          <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
            <FileSpreadsheet aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{archivo}</span>
            {leyendo ? <span>· Revisando…</span> : null}
          </p>
        ) : null}
        {error && !vista ? <Notice tone="danger">{error}</Notice> : null}
      </Paso>

      {vista ? (
        <>
          <Paso n={3} titulo="Revisa antes de guardar">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cifra label="Nuevos" valor={vista.nuevas.length} tono="success" />
              <Cifra label="Ya existen" valor={vista.existentes.length} />
              <Cifra label="Con error" valor={errores} tono={errores ? "danger" : undefined} />
              <Cifra label="Filas en el archivo" valor={vista.totalFilas} />
            </div>
            {vista.avisos.map((a) => (
              <p key={a} className="flex items-start gap-1.5 text-sm text-muted">
                <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                {a}
              </p>
            ))}
            {vista.columnasIgnoradas.length > 0 ? (
              <p className="text-sm text-muted">
                {vista.columnasIgnoradas.length === 1 ? "Columna que no se usa" : "Columnas que no se usan"}:{" "}
                {vista.columnasIgnoradas.join(", ")}.
              </p>
            ) : null}
          </Paso>

          {errores > 0 ? (
            <Bloque titulo={`Con error (${errores})`} tono="danger">
              <p className="-mt-1 text-sm text-muted">
                Estas filas no se importan. Descárgalas, corrígelas y vuelve a importar ese archivo.
              </p>
              <ul className="flex flex-col divide-y divide-border">
                {vista.errores.slice(0, MOSTRAR).map((e) => (
                  <li key={e.fila} className="flex flex-col gap-0.5 py-2.5">
                    <p className="text-[15px] font-medium [overflow-wrap:anywhere]">
                      Fila {e.fila}
                      {e.valores.codigo || e.valores.nombre ? (
                        <span className="font-normal text-muted"> · {[e.valores.codigo, e.valores.nombre].filter(Boolean).join(" · ")}</span>
                      ) : null}
                    </p>
                    {e.motivos.map((m) => (
                      <p key={m} className="flex items-start gap-1.5 text-sm text-danger">
                        <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                        {m}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
              {errores > MOSTRAR ? <p className="text-sm text-muted">Y {errores - MOSTRAR} más en el archivo.</p> : null}
              <Button
                variant="secondary"
                className="self-start"
                onClick={bajarErrores}
                pending={bajando}
                pendingLabel="Preparando…"
                icon={<Download aria-hidden className="size-[18px]" />}
              >
                Descargar filas con error
              </Button>
            </Bloque>
          ) : null}

          {vista.existentes.length > 0 ? (
            <Bloque titulo={`Ya existen (${vista.existentes.length})`}>
              <p className="-mt-1 text-sm text-muted">
                Su código ya está registrado. {actualizar ? "Se actualizan solo precio y costo." : "Se omiten."}
              </p>
              {conCambios.length > 0 ? (
                <label className="flex items-start gap-3 rounded-[var(--radius-control)] bg-surface-muted p-3 text-[15px]">
                  <input
                    type="checkbox"
                    checked={actualizar}
                    onChange={(e) => setActualizar(e.target.checked)}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary-ink)]"
                  />
                  <span>
                    Actualizar precio y costo de los {conCambios.length === 1 ? "que cambió" : `${conCambios.length} que cambiaron`}
                    <span className="block text-sm text-muted">El stock, el nombre y la categoría no se tocan.</span>
                  </span>
                </label>
              ) : (
                <p className="text-sm text-muted">Ninguno trae cambios de precio o costo.</p>
              )}
              {conCambios.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border">
                  {conCambios.slice(0, MOSTRAR).map((e) => (
                    <li key={e.fila} className="flex flex-col gap-0.5 py-2.5 text-[15px]">
                      <p className="font-medium [overflow-wrap:anywhere]">
                        {e.nombreActual} <span className="font-normal text-muted">· {e.datos.codigo}</span>
                      </p>
                      <p className="text-sm tabular-nums text-muted">
                        {[
                          e.precio ? `precio ${formatMoney(e.precio.antes)} → ${formatMoney(e.precio.despues)}` : null,
                          e.costo ? `costo ${formatMoney(e.costo.antes)} → ${formatMoney(e.costo.despues)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {vista.existentes.length > conCambios.length ? (
                <p className="text-sm text-muted">
                  {conteo(vista.existentes.length - conCambios.length, "sin cambios", "sin cambios")}:{" "}
                  {vista.existentes.length - conCambios.length === 1 ? "se omite" : "se omiten"}.
                </p>
              ) : null}
            </Bloque>
          ) : null}

          {vista.categoriasNuevas.length > 0 || vista.proveedoresNuevos.length > 0 ? (
            <Bloque titulo="Se van a crear">
              {vista.categoriasNuevas.length > 0 ? <Chips label="Categorías" items={vista.categoriasNuevas} /> : null}
              {vista.proveedoresNuevos.length > 0 ? <Chips label="Proveedores" items={vista.proveedoresNuevos} /> : null}
            </Bloque>
          ) : null}

          {vista.nuevas.length > 0 ? (
            <Bloque titulo={`Nuevos (${vista.nuevas.length})`}>
              <ul className="flex flex-col divide-y divide-border">
                {vista.nuevas.slice(0, MOSTRAR).map((n) => (
                  <li key={n.fila} className="flex items-start gap-3 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{n.datos.nombre}</p>
                      <p className="text-[13px] text-muted tabular-nums">
                        {n.datos.codigo} · stock {formatQuantity(n.datos.stock_inicial, n.datos.unidad)}
                        {n.datos.categoria ? ` · ${n.datos.categoria}` : ""}
                      </p>
                      {n.avisos.map((a) => (
                        <p key={a} className="flex items-start gap-1.5 text-[13px] text-muted">
                          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                          {a}
                        </p>
                      ))}
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatMoney(n.datos.precio)}</span>
                  </li>
                ))}
              </ul>
              {vista.nuevas.length > MOSTRAR ? (
                <p className="text-sm text-muted">Y {vista.nuevas.length - MOSTRAR} más.</p>
              ) : null}
            </Bloque>
          ) : null}

          <section aria-label="Confirmar" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border-strong bg-surface p-4">
            <p className="text-[15px]">
              {aGuardar === 0
                ? "No hay nada que guardar con este archivo."
                : resumenGuardar(vista.nuevas.length, actualizar ? conCambios.length : 0)}
              {errores > 0 && aGuardar > 0
                ? errores === 1
                  ? " La fila con error no se importa."
                  : ` Las ${conteo(errores, "fila", "filas")} con error no se importan.`
                : ""}
            </p>
            {errores > 0 && aGuardar > 0 ? (
              <label className="flex items-start gap-3 text-[15px]">
                <input
                  type="checkbox"
                  checked={acepto}
                  onChange={(e) => setAcepto(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--color-primary-ink)]"
                />
                {errores === 1
                  ? "Entiendo que la fila con error no se importa."
                  : "Entiendo que las filas con error no se importan."}
              </label>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button
              size="lg"
              onClick={guardar}
              pending={guardando}
              pendingLabel="Importando…"
              disabled={aGuardar === 0 || (errores > 0 && !acepto)}
              className="sm:self-start"
            >
              {textoBoton(vista.nuevas.length, actualizar ? conCambios.length : 0)}
            </Button>
          </section>
        </>
      ) : null}
    </>
  );
}

/**
 * "Se creará 1 producto.", "Se crearán 6 productos y se actualizará 1.",
 * "Se actualizarán 2 productos."
 */
function resumenGuardar(nuevos: number, actualizados: number) {
  const crear = nuevos === 1 ? "Se creará 1 producto" : `Se crearán ${conteo(nuevos, "producto", "productos")}`;
  if (nuevos > 0 && actualizados > 0) {
    return `${crear} y ${actualizados === 1 ? "se actualizará 1" : `se actualizarán ${actualizados.toLocaleString("es-MX")}`}.`;
  }
  if (nuevos > 0) return `${crear}.`;
  return actualizados === 1
    ? "Se actualizará 1 producto."
    : `Se actualizarán ${conteo(actualizados, "producto", "productos")}.`;
}

/** "Importar 6 productos", "Importar 6 y actualizar 1", "Actualizar 1 producto". */
function textoBoton(nuevos: number, actualizados: number) {
  if (nuevos > 0 && actualizados > 0) return `Importar ${nuevos} y actualizar ${actualizados}`;
  if (nuevos > 0) return `Importar ${conteo(nuevos, "producto", "productos")}`;
  if (actualizados > 0) return `Actualizar ${conteo(actualizados, "producto", "productos")}`;
  return "Importar";
}

function conteo(n: number, uno: string, varios: string) {
  return `${n.toLocaleString("es-MX")} ${n === 1 ? uno : varios}`;
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold">
        <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink">
          {n}
        </span>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Bloque({ titulo, tono, children }: { titulo: string; tono?: "danger"; children: ReactNode }) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-[var(--radius-card)] border bg-surface p-4 ${
        tono === "danger" ? "border-danger/30" : "border-border"
      }`}
    >
      <h3 className={`text-base font-semibold ${tono === "danger" ? "text-danger" : ""}`}>{titulo}</h3>
      {children}
    </section>
  );
}

function Cifra({ label, valor, tono }: { label: string; valor: number; tono?: "success" | "danger" }) {
  const color = tono === "success" ? "text-success" : tono === "danger" ? "text-danger" : "";
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-control)] bg-surface-muted px-3 py-2.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${color}`}>{valor.toLocaleString("es-MX")}</span>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((x) => (
          <li key={x} className="rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary-ink">
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}
