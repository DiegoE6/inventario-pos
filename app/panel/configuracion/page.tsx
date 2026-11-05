import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Store, Tags, Truck } from "lucide-react";
import { ComingSoon } from "@/app/components/coming-soon";
import { PageHeader } from "@/app/components/page-header";
import { requireDueno } from "@/app/lib/auth";

export const metadata: Metadata = { title: "Configuración" };

const CATALOGOS = [
  { href: "/panel/configuracion/categorias", label: "Categorías", icon: Tags },
  { href: "/panel/configuracion/proveedores", label: "Proveedores", icon: Truck },
];

export default async function ConfiguracionPage() {
  await requireDueno();

  return (
    <>
      <PageHeader title="Configuración" />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Catálogos</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          {CATALOGOS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-14 items-center gap-3 px-4 text-base transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                <Icon aria-hidden className="size-5 text-muted" />
                <span className="flex-1">{label}</span>
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Negocio y usuarios</h2>
        <ComingSoon
          icon={Store}
          title="Marca, datos del negocio y usuarios"
          description="Cambia el nombre, el logo y el color del sistema, y da de alta cajeros."
        />
      </section>
    </>
  );
}
