import Image from "next/image";
import Link from "next/link";

const explore = [
  { href: "/fighters", label: "Luchadores" },
  { href: "/clasificacion", label: "Clasificación" },
  { href: "/eventos", label: "Eventos" },
];

const tools = [
  { href: "/enfrentamiento", label: "Enfrentamiento" },
  { href: "/news", label: "Noticias" },
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
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-brand-ink-foreground/45">
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
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr] lg:px-8">
        <div>
          <Image
            src="/brand/horizontal.png"
            alt="MMA STATUS"
            width={1024}
            height={250}
            className="h-11 w-auto"
          />
          <p className="mt-5 max-w-sm text-sm leading-6 text-brand-ink-foreground/55">
            Estadísticas de MMA en vivo: perfiles de peleadores, historial,
            clasificación y predicción por machine learning, sobre datos reales
            de UFC.
          </p>
        </div>

        <FooterColumn title="Explorar" links={explore} />
        <FooterColumn title="Herramientas" links={tools} />
      </div>

      <div className="border-t border-brand-ink-foreground/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-brand-ink-foreground/45">
            © {year} MMA STATUS
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-brand-ink-foreground/45">
            Datos en vivo · Neon PostgreSQL
          </span>
        </div>
      </div>
    </footer>
  );
}
