import Image from "next/image";
import Link from "next/link";

// El pie enseñaba 6 de las 15 rutas públicas: media web no tenía ni un enlace
// interno. Son EXACTAMENTE las mismas que le faltaban al sitemap, por eso las
// dos cosas se arreglaron juntas — ver el comentario de `src/app/sitemap.ts`.
// ⚠️ Fuera a propósito: `/estado` (oculto, y enlazarlo sería anunciarlo),
// `/offline` (la sirve el service worker, no se navega) y `/compare` y
// `/predict`, que son redirecciones permanentes a `/enfrentamiento`.
const explore = [
  { href: "/fighters", label: "Luchadores" },
  { href: "/clasificacion", label: "Clasificación" },
  { href: "/eventos", label: "Eventos" },
  { href: "/ufc-hoy", label: "¿Hay UFC hoy?" },
  { href: "/en-vivo", label: "En vivo" },
];

const tools = [
  { href: "/enfrentamiento", label: "Enfrentamiento" },
  { href: "/tendencias", label: "Tendencias" },
  { href: "/maestro", label: "Maestro" },
];

const more = [
  { href: "/videos", label: "Vídeos" },
  { href: "/gimnasios", label: "Gimnasios" },
  { href: "/salon-de-la-fama", label: "Salón de la Fama" },
];

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-brand-ink-foreground/70">
        {title}
      </h2>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="font-display text-sm font-semibold uppercase tracking-wide text-brand-ink-foreground/80 transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t-2 border-t-primary bg-brand-ink text-brand-ink-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Image
            src="/brand/horizontal.png"
            alt="MMA STATUS"
            width={1024}
            height={250}
            className="h-11 w-auto"
          />
          <p className="mt-5 max-w-sm text-sm leading-6 text-brand-ink-foreground/75">
            Estadísticas de MMA en vivo: perfiles de peleadores, historial,
            clasificación y predicción por machine learning, sobre datos reales
            de UFC.
          </p>
        </div>

        <FooterColumn title="Explorar" links={explore} />
        <FooterColumn title="Herramientas" links={tools} />
        <FooterColumn title="Más" links={more} />
      </div>

      <div className="border-t border-brand-ink-foreground/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-brand-ink-foreground/70">
            © {year} MMA STATUS
          </span>
          {/* «Datos en vivo · Neon PostgreSQL» se retiró (encargo del dueño del
              31-jul): al visitante no le dice nada y a quien mira con otras
              intenciones le regala el motor de base de datos que hay detrás.
              Su sitio lo ocupan ahora los dos enlaces legales. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
            {[
              { href: "/contacto", label: "Contacto" },
              { href: "/aviso-legal", label: "Aviso legal" },
              { href: "/privacidad", label: "Privacidad" },
              { href: "/creditos", label: "Créditos de imágenes" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-mono text-xs uppercase tracking-[0.16em] text-brand-ink-foreground/70 transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
