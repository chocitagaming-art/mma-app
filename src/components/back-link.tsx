import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// Volver AL LISTADO PADRE, nunca router.back(). Decisión del dueño (6-ago): el
// historial no es predecible. Quien llega desde Google no tiene "atrás" dentro
// del sitio, y quien llega desde el buscador interno volvería al buscador, no
// al listado. Por eso el destino es SIEMPRE una ruta fija que se calcula en el
// servidor y que funciona igual en la primera visita que en la número mil.
//
// El markup es EL MISMO que ya vivía suelto en eventos/[id] (líneas 154-160 de
// be53baa): mismas clases, mismo icono, mismo tamaño. Sacarlo aquí es un
// refactor puro y lo único que se añade es el nombre accesible.
//
// NOMBRE ACCESIBLE (medido en producción sobre /eventos/357): lucide pinta el
// <svg> con aria-hidden="true", así que el nombre accesible del enlace era
// exactamente "Eventos" — el MISMO que el "Eventos" del menú de cabecera y el
// del pie. Un lector de pantalla anunciaba tres enlaces llamados igual y
// ninguno decía que este sube de nivel. `aria-label` lo convierte en "Volver a
// Eventos", que CONTIENE el texto visible y por eso cumple WCAG 2.5.3 (Label in
// Name): si el nombre accesible no contuviera la etiqueta visible, quien navega
// por voz diría "pulsa Eventos" y no pasaría nada.
//
// `label` es `string` y no `ReactNode` a propósito: hace falta poder componer
// `Volver a ${label}`. Es Server Component (sin hooks): no añade JS al cliente.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={`Volver a ${label}`}
      className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </Link>
  );
}
