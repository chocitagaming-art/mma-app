"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/fighters", label: "Luchadores" },
  { href: "/clasificacion", label: "Clasificación" },
  { href: "/eventos", label: "Eventos" },
  { href: "/enfrentamiento", label: "Enfrentamiento" },
  { href: "/maestro", label: "Maestro" },
  { href: "/news", label: "Noticias" },
  { href: "/videos", label: "Vídeos" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-t-2 border-b border-t-primary border-b-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          aria-label="MMA STATUS — inicio"
          className="group flex shrink-0 items-center gap-2.5 py-2.5"
        >
          <Image
            src="/brand/mark-hex.png"
            alt=""
            width={44}
            height={43}
            preload
            className="h-9 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out group-hover:-rotate-3 group-hover:scale-105 motion-reduce:transition-none"
          />
          <span className="font-display text-xl font-extrabold uppercase leading-none tracking-tight">
            <span className="text-foreground">MMA</span>{" "}
            <span className="text-primary">STATUS</span>
          </span>
        </Link>

        {/* Desktop tabs */}
        <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
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

        {/* Right controls */}
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          {/* Hamburger — solo en móvil */}
          <button
            type="button"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {/* Mobile nav — colapsable, controlada por el botón hamburguesa */}
      <nav
        id="mobile-nav"
        hidden={!open}
        aria-label="Navegación principal"
        className="border-t border-border bg-background/95 backdrop-blur-md md:hidden"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-2 sm:px-6">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "border-l-2 px-3 py-3 font-display text-sm font-semibold uppercase tracking-wide transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
