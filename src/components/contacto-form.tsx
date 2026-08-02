"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { LIMITES } from "@/lib/contacto";

// Formulario de /contacto. Cliente porque necesita estado (enviando, error,
// enviado) y porque así la página en sí sigue siendo estática salvo el POST.
//
// La validación de aquí es una COMODIDAD, no la puerta: quien quiera se la
// salta con `curl`. La que manda es la de `/api/contacto`, y detrás están los
// CHECK de la tabla. Esta solo evita el viaje de ida y vuelta cuando el fallo
// es evidente.

type Estado = "escribiendo" | "enviando" | "enviado";

const CLASE_CAMPO =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground " +
  "outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary";

export function ContactoForm() {
  const [estado, setEstado] = useState<Estado>("escribiendo");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (estado === "enviando") {
      return;
    }
    setEstado("enviando");
    setError(null);

    const datos = new FormData(evento.currentTarget);
    try {
      const respuesta = await fetch("/api/contacto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: datos.get("nombre"),
          email: datos.get("email"),
          mensaje: datos.get("mensaje"),
          web: datos.get("web"),
        }),
      });
      const json = (await respuesta.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!respuesta.ok || !json.ok) {
        setError(json.error ?? "No se pudo enviar el mensaje. Inténtalo más tarde.");
        setEstado("escribiendo");
        return;
      }
      setEstado("enviado");
    } catch {
      setError("No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.");
      setEstado("escribiendo");
    }
  }

  if (estado === "enviado") {
    return (
      <div
        role="status"
        className="rounded-md border border-primary/40 bg-primary/5 p-5 text-sm leading-6 text-foreground"
      >
        <p className="font-display text-base font-semibold uppercase tracking-wide">
          Mensaje enviado
        </p>
        <p className="mt-2 text-muted-foreground">
          Gracias. Se lee todo, aunque contestar puede llevar unos días: detrás de
          esto no hay un equipo de soporte, hay una persona.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="nombre" className="mb-1.5 block font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Nombre <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          maxLength={LIMITES.nombreMax}
          autoComplete="name"
          className={CLASE_CAMPO}
          placeholder="Cómo quieres que te llame"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Tu correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={LIMITES.emailMax}
          autoComplete="email"
          className={CLASE_CAMPO}
          placeholder="para poder contestarte"
        />
      </div>

      <div>
        <label htmlFor="mensaje" className="mb-1.5 block font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Mensaje
        </label>
        <textarea
          id="mensaje"
          name="mensaje"
          required
          rows={7}
          minLength={LIMITES.mensajeMin}
          maxLength={LIMITES.mensajeMax}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          className={`${CLASE_CAMPO} resize-y`}
          placeholder="Un dato mal, una idea, un error que has visto…"
        />
        <p className="mt-1 text-right font-mono text-[0.65rem] text-muted-foreground">
          {mensaje.length} / {LIMITES.mensajeMax}
        </p>
      </div>

      {/* Trampa para robots: invisible para una persona, irresistible para un
          bot que rellena todo lo que encuentra. `tabIndex={-1}` y
          `autoComplete="off"` evitan que un teclado o el navegador lo toquen
          por accidente, y `aria-hidden` lo saca del lector de pantalla. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="web">No rellenes esto</label>
        <input id="web" name="web" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-primary">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" className="h-10" disabled={estado === "enviando"}>
          {estado === "enviando" ? "Enviando…" : "Enviar mensaje"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Se guardan tu correo y tu mensaje, nada más.
        </p>
      </div>
    </form>
  );
}
