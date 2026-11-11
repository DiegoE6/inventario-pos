"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Check, FlaskConical, ImageUp, RotateCcw, Save, Trash2 } from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";
import { Notice } from "@/app/components/notice";
import { Button } from "@/app/components/ui/button";
import { Field, Input } from "@/app/components/ui/field";
import { brandStyle, contrastRatio, isHexColor, onColorFor, primaryInk } from "@/app/lib/brand";
import type { Configuracion, FormState } from "@/app/lib/types";
import { guardarNegocio, quitarLogo, restaurarMarcaDemo, subirLogo } from "../actions";

/** Colores sugeridos: un clic para enseñar el cambio de marca en el demo. */
const SUGERIDOS = [
  { hex: "#c2410c", nombre: "Naranja" },
  { hex: "#1d4ed8", nombre: "Azul" },
  { hex: "#047857", nombre: "Verde" },
  { hex: "#7c3aed", nombre: "Morado" },
  { hex: "#be123c", nombre: "Rojo" },
  { hex: "#fde047", nombre: "Amarillo" },
  { hex: "#1c1917", nombre: "Negro" },
];

const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_MB = 3;

type Datos = { nombre: string; giro: string; telefono: string; direccion: string; color: string };

function datosDe(config: Configuracion): Datos {
  return {
    nombre: config.nombre,
    giro: config.giro ?? "",
    telefono: config.telefono ?? "",
    direccion: config.direccion ?? "",
    color: config.color_primario.toLowerCase(),
  };
}

export function NegocioForm({ config, logoActual }: { config: Configuracion; logoActual: string | null }) {
  const [state, action, pending] = useActionState(guardarNegocio, {});
  const [datos, setDatos] = useState<Datos>(() => datosDe(config));
  const [colorTexto, setColorTexto] = useState(config.color_primario);
  const [logoLocal, setLogoLocal] = useState<string | null>(null);

  // Si la configuración guardada cambia desde fuera (restaurar la marca del
  // demo, otro dispositivo), el formulario toma los valores nuevos. Después
  // de guardar aquí, los valores ya coinciden y no se nota nada.
  const guardado = datosDe(config);
  const claveGuardado = JSON.stringify(guardado);
  const [vistoGuardado, setVistoGuardado] = useState(claveGuardado);
  if (claveGuardado !== vistoGuardado) {
    setVistoGuardado(claveGuardado);
    setDatos(guardado);
    setColorTexto(guardado.color);
  }

  const { nombre, color } = datos;
  const set = (campo: keyof Datos) => (e: { target: { value: string } }) =>
    setDatos((d) => ({ ...d, [campo]: e.target.value }));

  const colorValido = isHexColor(color) ? color.toLowerCase() : guardado.color;
  const sinGuardar = JSON.stringify({ ...datos, color: colorValido }) !== claveGuardado;
  const cambioMarca = nombre.trim() !== guardado.nombre || colorValido !== guardado.color;

  function elegirColor(hex: string) {
    setDatos((d) => ({ ...d, color: hex }));
    setColorTexto(hex);
  }

  return (
    // Dos columnas según el ancho del ÁREA DE CONTENIDO (container query), no
    // de la ventana: con la barra lateral, a 800–1024 px no caben las dos.
    <div className="@container/negocio">
    <div className="grid gap-6 @3xl/negocio:grid-cols-[minmax(0,1fr)_300px] @3xl/negocio:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        <form
          action={action}
          noValidate
          className="@container flex flex-col gap-5 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:p-5"
        >
          <h2 className="text-base font-semibold">Datos del negocio</h2>
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
          {state.ok && !sinGuardar ? <Notice tone="success">{state.message}</Notice> : null}

          <Field id="nombre" label="Nombre" error={state.fieldErrors?.nombre}>
            <Input
              id="nombre"
              value={nombre}
              onChange={set("nombre")}
              maxLength={100}
              required
              autoComplete="organization"
              invalid={Boolean(state.fieldErrors?.nombre)}
              describedBy={state.fieldErrors?.nombre ? "error" : undefined}
            />
          </Field>

          {/* Giro y teléfono lado a lado solo si el formulario mide ≥ 32rem. */}
          <div className="grid gap-5 @lg:grid-cols-2">
          <Field id="giro" label="Giro" hint="Opcional. Ej. Ferretería, Papelería." error={state.fieldErrors?.giro}>
            <Input
              id="giro"
              value={datos.giro}
              onChange={set("giro")}
              maxLength={60}
              invalid={Boolean(state.fieldErrors?.giro)}
              describedBy={state.fieldErrors?.giro ? "error" : "hint"}
            />
          </Field>
            <Field id="telefono" label="Teléfono" hint="Sale en el ticket." error={state.fieldErrors?.telefono}>
              <Input
                id="telefono"
                type="tel"
                value={datos.telefono}
                onChange={set("telefono")}
                maxLength={30}
                autoComplete="tel"
                invalid={Boolean(state.fieldErrors?.telefono)}
                describedBy={state.fieldErrors?.telefono ? "error" : "hint"}
              />
            </Field>
          </div>

          {/* Dirección: siempre en su propia fila, a todo el ancho. */}
          <Field id="direccion" label="Dirección" hint="Sale en el ticket." error={state.fieldErrors?.direccion}>
            <Input
              id="direccion"
              value={datos.direccion}
              onChange={set("direccion")}
              maxLength={200}
              autoComplete="street-address"
              invalid={Boolean(state.fieldErrors?.direccion)}
              describedBy={state.fieldErrors?.direccion ? "error" : "hint"}
            />
          </Field>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 text-sm font-medium">Color de la marca</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colores sugeridos">
              {SUGERIDOS.map((s) => {
                const activo = colorValido === s.hex;
                return (
                  <button
                    key={s.hex}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    aria-label={s.nombre}
                    title={s.nombre}
                    onClick={() => elegirColor(s.hex)}
                    className="flex size-11 items-center justify-center rounded-full border border-black/10 transition-transform duration-150 ease-out motion-safe:active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
                    style={{ backgroundColor: s.hex, color: onColorFor(s.hex) }}
                  >
                    {activo ? <Check aria-hidden className="size-5" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="flex items-start gap-3">
              <input
                type="color"
                aria-label="Elegir otro color"
                value={colorValido}
                onChange={(e) => elegirColor(e.target.value)}
                className="h-11 w-14 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-border-strong bg-surface p-1"
              />
              <div className="flex-1">
                <Field id="color_primario" label={<span className="sr-only">Código del color</span>} error={state.fieldErrors?.color_primario}>
                  <Input
                    id="color_primario"
                    value={colorTexto}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setColorTexto(v);
                      if (isHexColor(v)) setDatos((d) => ({ ...d, color: v.toLowerCase() }));
                    }}
                    maxLength={7}
                    spellCheck={false}
                    autoCapitalize="off"
                    className="font-mono"
                    invalid={!isHexColor(colorTexto) || Boolean(state.fieldErrors?.color_primario)}
                  />
                </Field>
              </div>
            </div>
            <ContrasteInfo color={colorValido} />
          </fieldset>

          {/* Una columna: la vista previa va aquí, junto al color y antes de Guardar. */}
          <div className="flex flex-col gap-2 @3xl/negocio:hidden">
            <PreviewLabel sinGuardar={cambioMarca || Boolean(logoLocal)} />
            <Preview nombre={nombre.trim() || config.nombre} color={colorValido} logo={logoLocal ?? logoActual} />
          </div>

          <Button
            type="submit"
            pending={pending}
            pendingLabel="Guardando…"
            icon={<Save aria-hidden className="size-[18px]" />}
            className="self-start"
          >
            Guardar
          </Button>
        </form>

        <LogoForm
          nombre={nombre}
          logoActual={logoActual}
          onPreview={setLogoLocal}
        />
      </div>

      {/* Dos columnas: vista previa fija a la derecha. */}
      <aside className="hidden flex-col gap-2 @3xl/negocio:sticky @3xl/negocio:top-6 @3xl/negocio:flex" aria-label="Vista previa">
        <PreviewLabel sinGuardar={cambioMarca || Boolean(logoLocal)} />
        <Preview nombre={nombre.trim() || config.nombre} color={colorValido} logo={logoLocal ?? logoActual} />
      </aside>
    </div>
    </div>
  );
}

function PreviewLabel({ sinGuardar }: { sinGuardar: boolean }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-muted">
      Vista previa
      {sinGuardar ? (
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] font-medium text-muted">sin guardar</span>
      ) : null}
    </p>
  );
}

/** Qué color de texto lleva encima y qué tinta se usa para texto sobre blanco. */
function ContrasteInfo({ color }: { color: string }) {
  const on = onColorFor(color);
  const ink = primaryInk(color);
  const ratio = contrastRatio(ink, "#ffffff");
  return (
    <p className="text-sm text-muted">
      Texto sobre el color: <span className="font-medium text-foreground">{on === "#ffffff" ? "blanco" : "negro"}</span>
      {" · "}
      {ink === color ? (
        <>Se lee bien como texto sobre blanco ({ratio.toFixed(1)}:1).</>
      ) : (
        <>
          Para texto sobre blanco se usa una versión más oscura,{" "}
          <span className="font-mono text-foreground">{ink}</span> ({ratio.toFixed(1)}:1).
        </>
      )}
    </p>
  );
}

/**
 * Vista previa con los colores elegidos, antes de guardar. Usa los mismos
 * tokens que la app (data-brand + brandStyle), así que lo que se ve aquí es
 * lo que se verá en el panel.
 */
function Preview({ nombre, color, logo }: { nombre: string; color: string; logo: string | null }) {
  const barras = [38, 62, 45, 80, 56, 92, 70];
  return (
    <div
      data-brand
      style={brandStyle(color)}
      className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-background"
    >
      <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <BrandMark config={{ nombre, logo_url: null }} src={logo} size={32} />
        <p className="line-clamp-2 text-[15px] font-semibold leading-tight">{nombre}</p>
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex gap-1.5">
          <span className="rounded-[var(--radius-control)] bg-primary-soft px-3 py-1.5 text-sm font-semibold text-primary-ink">
            Inicio
          </span>
          <span className="px-3 py-1.5 text-sm text-muted">Vender</span>
          <span className="px-3 py-1.5 text-sm text-muted">Productos</span>
        </div>
        <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-surface p-3">
          <p className="text-[13px] text-muted">Ventas de la semana</p>
          <div aria-hidden className="flex h-16 items-end gap-1.5">
            {barras.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-[4px] bg-primary-ink" style={{ height: `${h}%` }} />
            ))}
          </div>
          <p className="text-sm font-medium text-primary-ink">Ver todas las ventas</p>
        </div>
        <span className="flex h-11 items-center justify-center rounded-[var(--radius-control)] bg-primary text-[15px] font-medium text-on-primary">
          Cobrar $1,250.00
        </span>
      </div>
    </div>
  );
}

function LogoForm({
  nombre,
  logoActual,
  onPreview,
}: {
  nombre: string;
  logoActual: string | null;
  onPreview: (url: string | null) => void;
}) {
  const [state, action, pending] = useActionState(subirLogo, {});
  const [quitarState, setQuitarState] = useState<FormState>({});
  const [quitando, startQuitar] = useTransition();
  const [local, setLocal] = useState<{ url: string; nombre: string } | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // La vista previa de la derecha sigue a la imagen elegida; la URL local
  // (blob:) se libera al cambiarla o al salir.
  useEffect(() => {
    onPreview(local?.url ?? null);
    return () => {
      if (local) URL.revokeObjectURL(local.url);
    };
  }, [local, onPreview]);

  // Cada respuesta del servidor limpia la selección. Si salió bien, el logo
  // nuevo ya viene del servidor; si no, React ya vació el <input type=file>
  // al terminar la acción, así que hay que volver a elegir la imagen.
  const [visto, setVisto] = useState(state);
  if (state !== visto) {
    setVisto(state);
    setLocal(null);
  }

  function elegir(file: File | undefined) {
    setErrorLocal(null);
    setQuitarState({});
    if (!file) {
      setLocal(null);
      return;
    }
    // Revisión rápida para avisar antes de subir; el servidor revisa de verdad.
    if (!TIPOS_LOGO.includes(file.type)) {
      setErrorLocal("Sube una imagen PNG, JPG o WEBP.");
    } else if (file.size > MAX_LOGO_MB * 1024 * 1024) {
      setErrorLocal(`La imagen pesa más de ${MAX_LOGO_MB} MB. Usa una más ligera.`);
    }
    setLocal({ url: URL.createObjectURL(file), nombre: file.name });
  }

  const error = errorLocal ?? state.fieldErrors?.logo ?? state.error ?? quitarState.error;
  const exito = !local && (state.ok ? state.message : quitarState.ok ? quitarState.message : null);

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 md:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Logo</h2>
        <p className="text-sm text-muted">
          PNG, JPG o WEBP de hasta {MAX_LOGO_MB} MB. Se ajusta a 512 px como máximo, sin recortarla, y se quitan los datos de la cámara. Si no hay
          logo, se usan las iniciales del nombre.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <BrandMark config={{ nombre, logo_url: null }} src={local?.url ?? logoActual} size={64} />
        <div className="flex min-w-0 flex-col gap-2">
          <label
            htmlFor="logo"
            className="inline-flex h-11 w-fit cursor-pointer whitespace-nowrap items-center gap-2 rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 text-[15px] font-medium transition-[transform,background-color] duration-150 ease-out hover:bg-surface-muted motion-safe:active:scale-[0.97] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-ink"
          >
            <ImageUp aria-hidden className="size-[18px]" />
            {local ? "Elegir otra" : "Elegir imagen"}
            <input
              ref={input}
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => elegir(e.target.files?.[0])}
            />
          </label>
          {local ? <p className="truncate text-sm text-muted">{local.nombre}</p> : null}
        </div>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {exito ? <Notice tone="success">{exito}</Notice> : null}

      <div className="flex flex-wrap gap-2">
        {local ? (
          <Button
            type="submit"
            pending={pending}
            pendingLabel="Subiendo…"
            disabled={Boolean(errorLocal)}
            icon={<Save aria-hidden className="size-[18px]" />}
          >
            Guardar logo
          </Button>
        ) : null}
        {local ? (
          <Button
            variant="ghost"
            onClick={() => {
              if (input.current) input.current.value = "";
              elegir(undefined);
            }}
          >
            Cancelar
          </Button>
        ) : null}
        {!local && logoActual ? (
          <Button
            variant="secondary"
            pending={quitando}
            pendingLabel="Quitando…"
            icon={<Trash2 aria-hidden className="size-[18px]" />}
            onClick={() => startQuitar(async () => setQuitarState(await quitarLogo()))}
          >
            Quitar logo
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Aviso y botón del demo. Fuera del formulario: sobrevive a la restauración. */
export function AvisoDemo() {
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <p className="flex items-start gap-2 text-[15px]">
        <FlaskConical aria-hidden className="mt-0.5 size-[18px] shrink-0 text-primary-ink" />
        <span>En el demo, los cambios de marca los ven todos y se restauran solos en 30 minutos.</span>
      </p>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Button
        variant="secondary"
        className="self-start"
        pending={pending}
        pendingLabel="Restaurando…"
        icon={<RotateCcw aria-hidden className="size-[18px]" />}
        onClick={() => start(async () => setState(await restaurarMarcaDemo()))}
      >
        Restaurar marca del demo
      </Button>
    </section>
  );
}
