"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";

import { LiveNavChip } from "@/components/live/live-nav-chip";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

// Navegación estilo ufc.com: logo centrado, nav de contenido a la izquierda y
// nav de herramientas a la derecha. "Inicio" no aparece en escritorio (el logo
// ya enlaza a la home), pero sí como primer item del menú móvil (accesibilidad).
// "Luchadores" ya no es un enlace plano: es un flyout (estilo ufc.com) que
// contiene "Todos los luchadores" y "Salón de la Fama". Por eso "Salón de la
// Fama" desaparece de este array como item independiente (vive dentro del flyout).
// "UFC hoy" tampoco está aquí (decisión del dueño, 6-ago): la tarjeta de próximo
// evento de la home ya contesta a quien está dentro, y el chip solo gastaba
// sitio. La página SIGUE EXISTIENDO y se llega por dos caminos: el pie
// ("¿Hay UFC hoy?") y la línea de horarios de esa tarjeta, que ahora enlaza allí
// (up-next-hero.tsx). Eso último no es adorno: /ufc-hoy es la única página del
// sitio que hace y responde la pregunta, y es la que puede ganar esa búsqueda.
const contentLinks = [
  { href: "/fighters", label: "Luchadores" },
  { href: "/clasificacion", label: "Clasificación" },
  { href: "/eventos", label: "Eventos" },
  { href: "/tendencias", label: "Tendencias" },
];

const toolLinks = [
  { href: "/gimnasios", label: "Gimnasios" },
  { href: "/videos", label: "Vídeos" },
  { href: "/enfrentamiento", label: "Enfrentamiento" },
  { href: "/maestro", label: "Maestro" },
];

// Items del flyout de "Luchadores" (desktop) y del grupo en el menú móvil.
const fightersFlyoutLinks = [
  { href: "/fighters", label: "Todos los luchadores" },
  { href: "/salon-de-la-fama", label: "Salón de la Fama" },
];

// En móvil no hay hover: el nav es plano. "Salón de la Fama" se muestra como
// sub-item indentado bajo "Luchadores" (sub: true) para conservar el acceso.
const mobileLinks: { href: string; label: string; sub?: boolean }[] = [
  { href: "/", label: "Inicio" },
  { href: "/fighters", label: "Luchadores" },
  { href: "/salon-de-la-fama", label: "Salón de la Fama", sub: true },
  { href: "/clasificacion", label: "Clasificación" },
  { href: "/eventos", label: "Eventos" },
  { href: "/tendencias", label: "Tendencias" },
  ...toolLinks,
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNavLink({
  href,
  label,
  pathname,
}: {
  href: string;
  label: string;
  pathname: string;
}) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative whitespace-nowrap border-b-2 px-2.5 py-4 font-display text-sm font-semibold uppercase tracking-wide transition-colors xl:px-3",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

// Flyout de "Luchadores" (solo escritorio): al pasar el ratón (o enfocar por
// teclado) despliega un panel flotante —mismo look que el buscador de la lupa—
// con "Todos los luchadores" y "Salón de la Fama". El propio trigger navega a
// /fighters al hacer clic (comportamiento ufc.com). El panel usa top-full (sin
// hueco) para que el hover no se corte al cruzar del trigger al panel.
function FightersNavFlyout({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active =
    isActive(pathname, "/fighters") || isActive(pathname, "/salon-de-la-fama");

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <Link
        href="/fighters"
        aria-current={active ? "page" : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            rootRef.current
              ?.querySelector<HTMLElement>("[data-flyout-item]")
              ?.focus();
          }
        }}
        className={cn(
          "relative flex items-center gap-1 whitespace-nowrap border-b-2 px-2.5 py-4 font-display text-sm font-semibold uppercase tracking-wide transition-colors xl:px-3",
          active
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        Luchadores
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </Link>
      <div
        role="menu"
        aria-label="Luchadores"
        hidden={!open}
        className="absolute left-0 top-full z-30 min-w-56 overflow-hidden rounded-lg border border-border bg-popover py-1.5 text-popover-foreground shadow-2xl backdrop-blur-xl"
      >
        {fightersFlyoutLinks.map((item) => {
          const itemActive = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              data-flyout-item
              aria-current={itemActive ? "page" : undefined}
              onClick={() => setOpen(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              className={cn(
                "block px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:outline-none",
                itemActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Cerrar el menú móvil con Escape mientras está abierto (el setState ocurre en
  // el handler del evento, no de forma síncrona en el efecto). Al cerrar, devuelve
  // el foco al botón hamburguesa para no dejarlo en un enlace ya oculto.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-t-2 border-b border-t-primary border-b-border bg-background/85 backdrop-blur-md">
      {/* Rejilla de 3 zonas con laterales de anchura idéntica (minmax(0,1fr)):
          el logo queda perfectamente centrado sin importar qué item esté activo. */}
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 sm:px-6 lg:px-8">
        {/* Zona izquierda: hamburguesa (móvil/tablet) o nav de contenido (escritorio) */}
        <div className="flex items-center justify-start">
          <button
            ref={hamburgerRef}
            type="button"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <nav
            aria-label="Navegación principal"
            className="hidden items-center gap-1 lg:flex"
          >
            {contentLinks.map((link) =>
              link.href === "/fighters" ? (
                <FightersNavFlyout key={link.href} pathname={pathname} />
              ) : (
                <DesktopNavLink key={link.href} pathname={pathname} {...link} />
              ),
            )}
          </nav>
        </div>

        {/* Zona central: el logo hace de "Inicio" */}
        <Link
          href="/"
          aria-label="MMA STATUS — inicio"
          className="group flex shrink-0 items-center justify-center gap-2.5 py-2.5"
        >
          <Image
            src="/brand/wordmark.webp"
            alt=""
            width={760}
            height={291}
            preload
            className="h-9 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transition-none sm:h-10"
          />
        </Link>

        {/* Zona derecha: nav de herramientas (escritorio) + ThemeToggle */}
        <div className="flex items-center justify-end gap-2">
          <nav
            aria-label="Herramientas"
            className="hidden items-center gap-1 lg:flex"
          >
            {toolLinks.map((link) => (
              <DesktopNavLink key={link.href} pathname={pathname} {...link} />
            ))}
          </nav>
          {/* T3-A: chip EN VIVO/HOY, solo cuando hay evento en marcha o en <24 h.
              Visible también en móvil (vive junto al ThemeToggle, fuera del menú). */}
          <LiveNavChip />
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile nav — colapsable, controlada por el botón hamburguesa */}
      <nav
        id="mobile-nav"
        hidden={!open}
        aria-label="Navegación principal"
        className="border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-2 sm:px-6">
          {mobileLinks.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "border-l-2 py-3 font-display text-sm font-semibold uppercase tracking-wide transition-colors",
                  link.sub ? "pl-8 pr-3 text-xs" : "px-3",
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
