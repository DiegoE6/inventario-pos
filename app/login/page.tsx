import type { Metadata } from "next";
import { BrandMark } from "@/app/components/brand-mark";
import { brandStyle } from "@/app/lib/brand";
import { getConfiguracion } from "@/app/lib/data";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const NOTICES: Record<string, string> = {
  inactivo: "Tu cuenta está desactivada. Pide al dueño del negocio que la active.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [config, sp] = await Promise.all([getConfiguracion(), searchParams]);
  const errorKey = typeof sp.error === "string" ? sp.error : "";

  return (
    <div data-brand style={brandStyle(config.color_primario)} className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-12">
        <header className="flex flex-col items-center gap-4 text-center">
          <BrandMark config={config} size={56} />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{config.nombre}</h1>
            <p className="text-base text-muted">Inventario y punto de venta</p>
          </div>
        </header>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <LoginForm notice={NOTICES[errorKey]} />
        </div>
      </main>
    </div>
  );
}
