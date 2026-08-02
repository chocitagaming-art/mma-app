import type { ReactNode } from "react";
import Link from "next/link";

// Andamio compartido por /aviso-legal y /privacidad. Las dos páginas son texto
// legal largo, así que van con el ancho de lectura de /creditos (max-w-3xl) y
// con encabezados numerados: en un documento legal la gente cita "el punto 4",
// no "el párrafo que empieza por…".

// Único sitio donde vive el canal de contacto. Las dos páginas legales y
// (cuando exista) /contacto deben decir lo mismo, y una dirección repetida a
// mano en tres ficheros acaba siendo tres direcciones distintas.
export const CONTACTO_EMAIL = "gpicomanville@gmail.com";

export function LegalPage({
  titulo,
  entradilla,
  actualizado,
  children,
}: {
  titulo: string;
  entradilla: ReactNode;
  actualizado: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-foreground sm:text-4xl">
        {titulo}
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{entradilla}</p>
      <p className="mt-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground/80">
        Última actualización: {actualizado}
      </p>

      <div className="mt-10 flex flex-col gap-8">{children}</div>

      <p className="mt-12 border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
        ¿Dudas sobre este texto? Escribe a{" "}
        <a
          href={`mailto:${CONTACTO_EMAIL}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          {CONTACTO_EMAIL}
        </a>
        . Ver también el{" "}
        <Link href="/aviso-legal" className="text-primary underline-offset-2 hover:underline">
          aviso legal
        </Link>
        , la{" "}
        <Link href="/privacidad" className="text-primary underline-offset-2 hover:underline">
          política de privacidad
        </Link>{" "}
        y los{" "}
        <Link href="/creditos" className="text-primary underline-offset-2 hover:underline">
          créditos de imágenes
        </Link>
        .
      </p>
    </div>
  );
}

export function LegalSection({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-foreground">
        <span className="mr-2 text-primary">{numero}.</span>
        {titulo}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
