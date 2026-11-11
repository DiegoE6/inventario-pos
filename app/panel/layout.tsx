import { FlaskConical } from "lucide-react";
import { BrandMark } from "@/app/components/brand-mark";
import { verifySession } from "@/app/lib/auth";
import { getConfiguracion } from "@/app/lib/data";
import { demoActivo } from "@/app/lib/demo";
import { getTema } from "@/app/lib/tema-servidor";
import { TemaSelector } from "@/app/components/tema-selector";
import { LogoutForm } from "./_components/logout-form";
import { PanelBottomNav, SidebarLinks } from "./_components/nav-links";

const ROL_LABEL = { dueno: "Dueño", cajero: "Cajero" } as const;

export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  const [session, config, tema] = await Promise.all([verifySession(), getConfiguracion(), getTema()]);

  return (
    // La marca (colores) ya viene en <html> desde app/layout.tsx.
    <div className="flex min-h-dvh flex-1">
      {/* Barra lateral: escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-5 md:flex">
        <div className="flex items-center gap-3 px-2">
          <BrandMark config={config} size={36} />
          <p className="line-clamp-2 text-[15px] font-semibold leading-tight">{config.nombre}</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <SidebarLinks rol={session.rol} />
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <TemaSelector inicial={tema} className="[&_button]:px-1 [&_button]:text-[13px] [&_svg]:hidden" />
          <div className="px-3">
            <p className="truncate text-sm font-medium">{session.nombre || session.email}</p>
            <p className="text-[13px] text-muted">{ROL_LABEL[session.rol]}</p>
          </div>
          <LogoutForm />
        </div>
      </aside>

      {/* Contenido. En celular deja espacio para la barra inferior. */}
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom)+1.5rem)] md:pb-0">
        {demoActivo() ? (
          <p
            role="note"
            className="flex items-center justify-center gap-2 border-b border-border bg-primary/8 px-4 py-2 text-center text-[13px] leading-snug text-muted"
          >
            <FlaskConical aria-hidden className="size-4 shrink-0 text-primary-ink" />
            <span>Estás viendo un demo · los datos se reinician cada noche</span>
          </p>
        ) : null}
        <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </div>

      <PanelBottomNav rol={session.rol} />
    </div>
  );
}
