import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/app/components/page-header";
import { verifySession } from "@/app/lib/auth";
import { MORE_NAV, navFor } from "@/app/lib/nav";
import { getTema } from "@/app/lib/tema-servidor";
import { TemaSelector } from "@/app/components/tema-selector";
import { LogoutForm } from "../_components/logout-form";

export const metadata: Metadata = { title: "Más" };

const ROL_LABEL = { dueno: "Dueño", cajero: "Cajero" } as const;

export default async function MasPage() {
  const [session, tema] = await Promise.all([verifySession(), getTema()]);
  const items = navFor(MORE_NAV, session.rol);

  return (
    <>
      <PageHeader title="Más" />

      <nav aria-label="Más secciones">
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
          {items.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-14 items-center gap-3 px-4 text-base transition-colors duration-150 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ink"
              >
                <Icon aria-hidden className="size-5 text-muted" />
                <span className="flex-1">{label}</span>
                <ChevronRight aria-hidden className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="apariencia" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <h2 id="apariencia" className="text-base font-semibold">
          Apariencia
        </h2>
        <TemaSelector inicial={tema} />
        <p className="text-sm text-muted">Se guarda en este dispositivo. El ticket siempre sale en claro.</p>
      </section>

      <section className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <div>
          <p className="font-medium">{session.nombre || session.email}</p>
          <p className="text-sm text-muted">
            {ROL_LABEL[session.rol]}
            {session.email ? ` · ${session.email}` : null}
          </p>
        </div>
        <LogoutForm className="-mx-1" />
      </section>
    </>
  );
}
