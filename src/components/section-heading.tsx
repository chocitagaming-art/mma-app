import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  // Ancho máximo del párrafo de descripción. Por defecto max-w-2xl (≈672px)
  // para una lectura cómoda; pásalo (p.ej. "max-w-none") cuando la descripción
  // deba ocupar todo el contenedor y quepa en una sola línea.
  descriptionClassName?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  descriptionClassName = "max-w-2xl",
}: SectionHeadingProps) {
  return (
    <div className="space-y-1.5">
      {eyebrow ? (
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-display text-3xl font-bold uppercase leading-none tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            descriptionClassName,
            "text-sm leading-6 text-muted-foreground sm:text-base",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
