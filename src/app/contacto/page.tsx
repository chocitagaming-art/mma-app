import type { Metadata } from "next";
import Link from "next/link";

import { ContactoForm } from "@/components/contacto-form";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Escribe a MMA STATUS: correcciones de datos, ideas, errores o cualquier otra cosa.",
  alternates: { canonical: "/contacto" },
};

export default function ContactoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-foreground sm:text-4xl">
        Contacto
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
        Esto lo lleva una persona, no una empresa. Escribe para lo que quieras:
        un dato que está mal, una sección que echas de menos, algo que se ve raro
        en tu móvil, o si eres titular de una imagen y quieres que se retire.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr]">
        <ContactoForm />

        <aside className="flex flex-col gap-6 text-sm leading-6 text-muted-foreground">
          <div>
            <h2 className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
              Si vienes por un dato mal
            </h2>
            <p className="mt-2">
              Ayuda mucho que pegues el enlace de la página donde lo has visto.
              Los resultados, récords y carteleras se recogen automáticamente de
              fuentes públicas, así que un fallo suele venir de origen y se
              arregla antes si se sabe dónde mirar.
            </p>
          </div>

          <div>
            <h2 className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
              Qué se guarda
            </h2>
            <p className="mt-2">
              Tu correo y tu mensaje, y el nombre si lo pones. No se guarda tu IP
              ni se usa nada de esto para otra cosa. Está contado entero en la{" "}
              <Link
                href="/privacidad"
                className="text-primary underline-offset-2 hover:underline"
              >
                política de privacidad
              </Link>
              .
            </p>
          </div>

          <div>
            <h2 className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
              Un aviso honesto
            </h2>
            <p className="mt-2">
              No hay horario de atención ni compromiso de respuesta. Se lee todo,
              pero contestar puede tardar. Si es urgente y tiene que ver con
              seguridad, dilo en el asunto del mensaje.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
