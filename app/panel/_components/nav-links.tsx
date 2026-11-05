"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BottomNav } from "@/app/components/bottom-nav";
import { isActive, MAIN_NAV, MORE_NAV, navFor } from "@/app/lib/nav";
import type { Rol } from "@/app/lib/types";

/** Barra inferior con la ruta actual (solo celular). */
export function PanelBottomNav() {
  const pathname = usePathname();
  return <BottomNav pathname={pathname} />;
}

/** Enlaces de la barra lateral (escritorio). "Más" se despliega aquí mismo. */
export function SidebarLinks({ rol }: { rol: Rol }) {
  const pathname = usePathname();
  const main = MAIN_NAV.filter((i) => i.href !== "/panel/mas");
  const more = navFor(MORE_NAV, rol);

  return (
    <nav aria-label="Secciones" className="flex flex-col gap-6">
      <ul className="flex flex-col gap-0.5">
        {main.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item.href, pathname)} />
        ))}
      </ul>
      <ul className="flex flex-col gap-0.5">
        {more.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item.href, pathname)} />
        ))}
      </ul>
    </nav>
  );
}

function SidebarLink({ item, active }: { item: (typeof MAIN_NAV)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[15px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
          active
            ? "bg-primary-soft font-semibold text-primary"
            : "text-muted hover:bg-surface-muted hover:text-foreground"
        }`}
      >
        <Icon aria-hidden className="size-5" strokeWidth={active ? 2.25 : 1.75} />
        {item.label}
      </Link>
    </li>
  );
}
