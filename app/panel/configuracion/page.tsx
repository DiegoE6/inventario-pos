import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Palette, Tags, Truck, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";

export const metadata: Metadata = { title: "Configuración" };

type Item = { href: string; label: string; detalle: string; icon: LucideIcon };

const SECCIONES: { titulo: string; items: Item[] }[] = [
  {
    titulo: "Negocio",
    items: [
      {
        href: "/panel/configuracion/negocio",
        label: "Negocio y marca",
        detalle: "Nombre, color, logo y datos del ticket",
        icon: Palette,
      },
      {
        href: "/panel/configuracion/usuarios",
        label: "Usuarios",
        detalle: "Quién entra al sistema y con qué rol",
        icon: Users,
      },
    ],
  },
  {
    titulo: "Catálogos",
    items: [
      { href: "/panel/configuracion/categorias", label: "Categorías", detalle: "Agrupan tus productos", icon: Tags },
      { href: "/panel/configuracion/proveedores", label: "Proveedores", detalle: "A quién le compras", icon: Truck },
    ],
  },
];

export default async function ConfiguracionPage() {
  await requireDueno();

  return (
    <>
      <PageHeader title="Configuración" />

      {SECCIONES.map((seccion) => (
        <section key={seccion.titulo} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{seccion.titulo}</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
            {seccion.items.map(({ href, label, detalle, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex min-h-16 items-center gap-3 px-4 py-2.5 text-base transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ink"
                >
                  <Icon aria-hidden className="size-5 shrink-0 text-muted" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span>{label}</span>
                    <span className="text-sm text-muted">{detalle}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
