import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { BottomNav } from "@/app/components/bottom-nav";
import { ProductCard, type ProductCardData } from "@/app/components/product-card";
import { Button, type ButtonVariant } from "@/app/components/ui/button";
import { Field, Input, Select } from "@/app/components/ui/field";
import { MarginPill } from "@/app/components/ui/margin-pill";
import { StockBadge } from "@/app/components/ui/stock-badge";
import { brandStyle, contrastRatio, onColorFor } from "@/app/lib/brand";
import { MarginDemo } from "./margin-demo";

/*
 * Página de muestra del sistema visual. SOLO EN DESARROLLO: en producción
 * (`next build`) responde 404. Usa los componentes reales de la app, así que
 * lo que se aprueba aquí es lo que va en las pantallas.
 */

const isDev = process.env.NODE_ENV === "development";

// En producción no se publica ni el título.
export function generateMetadata(): Metadata {
  return isDev
    ? { title: "Muestra visual", robots: { index: false, follow: false } }
    : { robots: { index: false, follow: false } };
}

const SWATCHES = [
  { name: "primary", hex: "#c2410c", text: true, note: "Botones, sección activa" },
  { name: "background", hex: "#fafaf9", note: "Fondo de página" },
  { name: "surface", hex: "#ffffff", note: "Tarjetas, campos" },
  { name: "surface-muted", hex: "#f5f5f4", note: "Hover, deshabilitado" },
  { name: "border", hex: "#e7e5e4", note: "Bordes de tarjeta" },
  { name: "border-strong", hex: "#d6d3d1", note: "Bordes de campos" },
  { name: "foreground", hex: "#1c1917", text: true, note: "Texto principal" },
  { name: "muted", hex: "#57534e", text: true, note: "Texto secundario" },
  { name: "success", hex: "#047857", text: true, note: "Ganancia" },
  { name: "danger", hex: "#b91c1c", text: true, note: "Errores, agotado" },
  { name: "danger-soft", hex: "#fee2e2", note: "Stock bajo" },
];

const BRANDS = [
  { name: "La Tuerca (nuevo)", hex: "#c2410c" },
  { name: "Naranja anterior", hex: "#ea580c" },
  { name: "Otro negocio", hex: "#0e7490" },
  { name: "Color claro", hex: "#facc15" },
];

const PRODUCTS: ProductCardData[] = [
  {
    id: "1", codigo: "HER-004", nombre: "Flexómetro 5 m", categoria: "Herramienta",
    precio: 115, stock: 18, stock_minimo: 6, unidad: "pieza",
  },
  {
    id: "2", codigo: "ELE-002", nombre: "Cable THW calibre 14", categoria: "Eléctrico",
    precio: 12.5, stock: 38, stock_minimo: 50, unidad: "metro",
  },
  {
    id: "3", codigo: "JAR-003", nombre: "Tijera para podar con mango ergonómico y seguro de cierre",
    categoria: "Jardín", precio: 165, stock: 0, stock_minimo: 3, unidad: "pieza",
  },
];

const VARIANTS: { variant: ButtonVariant; label: string }[] = [
  { variant: "primary", label: "Guardar" },
  { variant: "secondary", label: "Cancelar" },
  { variant: "ghost", label: "Ver más" },
  { variant: "danger", label: "Desactivar" },
];

function Section({ id, title, note, children }: {
  id: string; title: string; note?: string; children: ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-4 border-t border-border pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {note ? <p className="text-sm text-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ratio(a: string, b: string) {
  return contrastRatio(a, b).toFixed(1);
}

export default function MuestraPage() {
  if (!isDev) notFound();

  return (
    <div data-brand style={brandStyle("#c2410c")} className="flex-1">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pb-32 pt-8 md:px-6">
        <header className="flex flex-col gap-2">
          <p className="text-[13px] font-medium uppercase tracking-wide text-primary">
            Solo desarrollo
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Muestra visual</h1>
          <p className="text-base text-muted">
            Componentes reales de la app. Toca los botones para sentir la respuesta al presionar.
          </p>
        </header>

        {/* ------------------------------------------------------------------ */}
        <Section id="colores" title="Colores" note="Contraste contra blanco; AA pide 4.5 para texto normal.">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SWATCHES.map((s) => (
              <li key={s.name} className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                <div className="h-14 border-b border-border" style={{ background: s.hex }} />
                <div className="flex flex-col gap-0.5 p-3">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="font-mono text-[13px] text-muted">{s.hex}</p>
                  <p className="text-[13px] text-muted">{s.note}</p>
                  {s.text ? (
                    <p className="text-[13px] tabular-nums text-muted">
                      Contraste {ratio(s.hex, "#ffffff")}:1
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section
          id="marca"
          title="Marca configurable"
          note="El texto del botón se elige solo (blanco o casi negro) según el color del negocio."
        >
          <ul className="grid grid-cols-2 gap-3">
            {BRANDS.map((b) => {
              const on = onColorFor(b.hex);
              return (
                <li key={b.hex} data-brand style={brandStyle(b.hex)}
                  className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3">
                  <Button className="w-full">Cobrar</Button>
                  <p className="text-[13px] font-medium">{b.name}</p>
                  <p className="font-mono text-[13px] text-muted">
                    {b.hex} · {ratio(b.hex, on)}:1 {Number(ratio(b.hex, on)) >= 4.5 ? "✓" : "✗"}
                  </p>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="tipografia" title="Tipografía" note="Geist. Números con tabular-nums para que se alineen.">
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <p className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">$1,234.50</p>
            <p className="text-[13px] text-muted">32 · totales</p>
            <p className="text-2xl font-semibold tracking-tight">Productos</p>
            <p className="text-[13px] text-muted">24 · título de página</p>
            <p className="text-lg font-semibold">Flexómetro 5 m</p>
            <p className="text-[13px] text-muted">18 · título de tarjeta</p>
            <p className="text-base">Busca por nombre o código y agrega al carrito.</p>
            <p className="text-[13px] text-muted">16 · texto e inputs</p>
            <p className="text-[13px] text-muted">HER-004 · Herramienta</p>
            <p className="text-[13px] text-muted">13 · datos secundarios</p>
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-base tabular-nums">
              <p className="flex justify-between"><span>Martillo</span><span>$159.00</span></p>
              <p className="flex justify-between"><span>Cable 12.5 m</span><span>$200.00</span></p>
              <p className="flex justify-between"><span>Taquetes 30 pza</span><span>$45.00</span></p>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="botones" title="Botones" note="Normal, deshabilitado y guardando. Tamaño md (44px) y lg (48px).">
          <div className="flex flex-col gap-4">
            {VARIANTS.map(({ variant, label }) => (
              <div key={variant} className="flex flex-col gap-2">
                <p className="text-[13px] font-medium text-muted">{variant}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant={variant}>{label}</Button>
                  <Button variant={variant} disabled>{label}</Button>
                  <Button variant={variant} pending pendingLabel="Guardando…">{label}</Button>
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-2">
              <p className="text-[13px] font-medium text-muted">Con icono · lg · ancho completo (celular)</p>
              <div className="flex flex-wrap gap-2">
                <Button icon={<Plus aria-hidden className="size-[18px]" />}>Nuevo producto</Button>
                <Button size="lg" icon={<Save aria-hidden className="size-[18px]" />}>Guardar producto</Button>
              </div>
              <Button size="lg" className="w-full">Cobrar $474.00</Button>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="campos" title="Campos" note="Etiqueta arriba; ayuda o error abajo. 16px para que iOS no haga zoom.">
          <div className="grid gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:grid-cols-2">
            <Field id="m-codigo" label="Código" hint="El del código de barras o uno tuyo.">
              <Input id="m-codigo" defaultValue="HER-004" describedBy="hint" autoComplete="off" />
            </Field>
            <Field id="m-nombre" label="Nombre" error="El nombre es obligatorio.">
              <Input id="m-nombre" defaultValue="" placeholder="Ej. Flexómetro 5 m" invalid describedBy="error" />
            </Field>
            <Field id="m-precio" label="Precio de venta">
              <Input id="m-precio" prefix="$" inputMode="decimal" defaultValue="115.00" />
            </Field>
            <Field id="m-costo" label="Costo" error="Usa un monto como 12.50">
              <Input id="m-costo" prefix="$" inputMode="decimal" defaultValue="12,5x" invalid describedBy="error" />
            </Field>
            <Field id="m-categoria" label="Categoría">
              <Select id="m-categoria" defaultValue="2">
                <option value="">Sin categoría</option>
                <option value="1">Tornillería</option>
                <option value="2">Herramienta</option>
                <option value="3">Eléctrico</option>
              </Select>
            </Field>
            <Field id="m-stock" label="Stock actual" hint="Cambia con entradas, mermas y ajustes.">
              <Input id="m-stock" defaultValue="18 pza" disabled describedBy="hint" />
            </Field>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="margen" title="Margen en vivo" note="Margen sobre el precio de venta: (precio − costo) / precio.">
          <div className="flex flex-col items-start gap-2">
            <MarginPill costoCents={9500} precioCents={15900} unidad="pieza" />
            <MarginPill costoCents={12000} precioCents={9900} unidad="pieza" />
            <MarginPill costoCents={950} precioCents={1600} unidad="metro" />
            <MarginPill costoCents={null} precioCents={null} unidad="pieza" />
          </div>
          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <p className="mb-3 text-sm font-medium">Pruébalo</p>
            <MarginDemo />
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="etiquetas" title="Etiquetas de stock" note="Con stock suficiente no se muestra ninguna etiqueta.">
          <div className="flex flex-wrap items-center gap-3">
            <StockBadge stock={0} minimo={3} />
            <StockBadge stock={2} minimo={4} />
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        <Section id="tarjetas" title="Tarjeta de producto" note="Toda la tarjeta es tocable. Nombre en máximo 2 líneas.">
          <div className="flex flex-col gap-3">
            {PRODUCTS.map((p) => (
              <ProductCard key={p.id} product={p} href="#tarjetas" />
            ))}
          </div>
        </Section>

        <Section id="barra" title="Barra inferior" note="Fija abajo en celular (aquí, con Productos activo). En escritorio se oculta: achica la ventana o ábrela en el celular.">
          <p className="text-sm text-muted">Sus enlaces todavía no llevan a ninguna pantalla.</p>
        </Section>
      </main>

      <BottomNav pathname="/panel/productos" />
    </div>
  );
}
