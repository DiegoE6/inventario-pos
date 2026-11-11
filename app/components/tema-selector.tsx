"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { COOKIE_TEMA, type Tema } from "@/app/lib/tema";

const OPCIONES: { valor: Tema; label: string; icon: LucideIcon }[] = [
  { valor: "claro", label: "Claro", icon: Sun },
  { valor: "oscuro", label: "Oscuro", icon: Moon },
  { valor: "sistema", label: "Sistema", icon: Monitor },
];

/** Aplica el tema en <html> y lo guarda en la cookie del dispositivo. */
function aplicarTema(valor: Tema) {
  const html = document.documentElement;
  if (valor === "sistema") html.removeAttribute("data-theme");
  else html.setAttribute("data-theme", valor);
  document.cookie = `${COOKIE_TEMA}=${valor}; path=/; max-age=31536000; samesite=lax`;
  // Otro selector en la misma pantalla (barra lateral y "Más") se entera.
  window.dispatchEvent(new CustomEvent<Tema>("tema-cambio", { detail: valor }));
}

/**
 * Claro / Oscuro / Sistema. Cambia <html data-theme> al instante (sin
 * recargar) y lo guarda en la cookie para que el servidor lo ponga desde el
 * primer HTML la próxima vez. Sin animación: es un cambio de colores.
 */
export function TemaSelector({ inicial, className = "" }: { inicial: Tema; className?: string }) {
  const [tema, setTema] = useState<Tema>(inicial);

  useEffect(() => {
    const sincronizar = (e: Event) => setTema((e as CustomEvent<Tema>).detail);
    window.addEventListener("tema-cambio", sincronizar);
    return () => window.removeEventListener("tema-cambio", sincronizar);
  }, []);

  function elegir(valor: Tema) {
    setTema(valor);
    aplicarTema(valor);
  }

  return (
    <div role="radiogroup" aria-label="Apariencia" className={`grid grid-cols-3 gap-1 rounded-[var(--radius-control)] bg-surface-muted p-1 ${className}`}>
      {OPCIONES.map(({ valor, label, icon: Icon }) => {
        const activo = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => elegir(valor)}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-[8px] px-2 text-sm font-medium transition-[transform,background-color,color] duration-150 ease-out motion-safe:active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-primary-ink ${
              activo ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
