"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/fighters", label: "Luchadores" },
  { href: "/compare", label: "Comparar" },
  { href: "/predict", label: "Predicción" },
  { href: "/news", label: "Noticias" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-t-2 border-b border-t-primary border-b-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5 py-3">
          <span className="octagon grid size-9 place-items-center bg-primary font-display text-lg font-extrabold leading-none text-primary-foreground">
            M
          </span>
          <span className="font-display text-xl font-extrabold uppercase leading-none tracking-tight">
            <span className="text-foreground">MMA</span>
            <span className="text-primary"> Stats</span>
          </span>
        </Link>

        {/* Tabs */}
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative whitespace-nowrap border-b-2 px-3 py-4 font-display text-sm font-semibold uppercase tracking-wide transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle className="shrink-0" />
      </div>
    </header>
  );
}
