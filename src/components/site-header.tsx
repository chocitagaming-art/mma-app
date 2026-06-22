"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
