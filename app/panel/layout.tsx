import type { Metadata } from "next";
import { BrandMark } from "@/app/components/brand-mark";
import { verifySession } from "@/app/lib/auth";
import { brandStyle } from "@/app/lib/brand";
import { getConfiguracion } from "@/app/lib/data";
import { LogoutForm } from "./_components/logout-form";
import { PanelBottomNav, SidebarLinks } from "./_components/nav-links";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfiguracion();
  return { title: { template: `%s · ${config.nombre}`, default: config.nombre } };
}

const ROL_LABEL = { dueno: "Dueño", cajero: "Cajero" } as const;

export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const [session, config] = await Promise.all([verifySession(), getConfiguracion()]);

  return (
    // brandStyle valida que color_primario sea #RRGGBB; si no, usa el default.
    <div data-brand style={brandStyle(config.color_primario)} className="flex min-h-dvh flex-1">
      {/* Barra lateral: escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-5 md:flex">
        <div className="flex items-center gap-3 px-2">
          <BrandMark config={config} size={36} />
          <p className="line-clamp-2 text-[15px] font-semibold leading-tight">{config.nombre}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <SidebarLinks rol={session.rol} />
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="px-3">
            <p className="truncate text-sm font-medium">{session.nombre || session.email}</p>
            <p className="text-[13px] text-muted">{ROL_LABEL[session.rol]}</p>
          </div>
          <LogoutForm />
        </div>
      </aside>

      {/* Contenido. En celular deja espacio para la barra inferior. */}
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+1.5rem)] md:pb-0">
        <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </div>

      <PanelBottomNav rol={session.rol} />
    </div>
  );
}
