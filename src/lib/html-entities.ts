// Decodificación de las entidades HTML que los scrapers dejan crudas en la BD.
//
// NO ES TEÓRICO. Medido contra la base de datos de producción el 28-jul-2026:
// **54 de las 1.127** filas con `trains_at` traen entidades (`Bronx&#039;s Gold
// Team`, `Glory MMA &amp; Fitness`) y **2 de 1.515** `birth_place`, una de ellas
// DOBLEMENTE codificada (`Ponte dell&amp;#039;Olio, Italy`). Se veían tal cual
// en la ficha del luchador: el navegador no vuelve a decodificar un texto que
// React ya escapó, así que el usuario leía literalmente "Bronx&#039;s Gold Team".
// Los nombres, apodos, nacionalidades y todos los campos de evento están limpios.

// `&amp;` va la ÚLTIMA a propósito: decodificarla antes convertiría `&amp;#039;`
// en `&#039;` y de ahí en `'` dentro de la MISMA pasada, saltándose el tope.
const ENTIDADES_CON_NOMBRE: Array<[RegExp, string]> = [
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&amp;/g, "&"],
];

/**
 * Devuelve el texto con sus entidades HTML resueltas.
 *
 * Dos pasadas como mucho, por el doble codificado que hay en `birth_place`, y
 * ni una más: es el máximo observado, y un bucle sin tope estaría gobernado por
 * un dato que viene de fuera. Si el texto ya está limpio, sale intacto.
 */
export function decodeHtmlEntities(value: string): string {
  let salida = value;

  for (let pasada = 0; pasada < 2; pasada += 1) {
    const antes = salida;

    salida = salida.replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
    salida = salida.replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
    for (const [patron, literal] of ENTIDADES_CON_NOMBRE) {
      salida = salida.replace(patron, literal);
    }

    if (salida === antes) break;
  }

  return salida;
}

/** Igual, pero tolerando null/undefined: devuelve null si no hay nada que decir. */
export function decodeHtmlEntitiesOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const limpio = decodeHtmlEntities(value).trim();
  return limpio === "" ? null : limpio;
}
