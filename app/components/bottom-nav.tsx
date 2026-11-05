import Link from "next/link";
import { isActive, isMoreActive, MAIN_NAV } from "@/app/lib/nav";

/**
 * Barra inferior del celular. Presentacional: recibe la ruta actual (en el
 * panel la pasa un componente cliente con usePathname).
 *
 * Sin animación al cambiar de sección: se usa decenas de veces al día y
 * tiene que sentirse inmediata.
 */
export function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {MAIN_NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/panel/mas" ? isMoreActive(pathname) : isActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-xs transition-colors duration-150 ${
                  active ? "font-semibold text-primary" : "text-muted"
                }`}
              >
                <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
