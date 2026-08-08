import { timingSafeEqual } from "node:crypto";

// Puerta del panel de estado. El dueño pidió expresamente que "nadie tenga
// acceso a eso ni sepa que en la web está eso", y esas son DOS cosas distintas:
// no dejar pasar es fácil, no delatar la ruta es lo que decide el diseño.
//
// POR ESO NO SE DEVUELVE UN 401. Un 401 confirma que la ruta existe, y da lo
// mismo lo bueno que sea el secreto: ya sabes dónde está la puerta. Los
// consumidores llaman a `notFound()` de Next, de modo que `/estado` sin clave
// responde EXACTAMENTE igual que cualquier URL inventada.
//
// Y POR ESO `/estado` NO VA EN robots.txt. Es lo primero que uno hace y es
// justo lo que la delata: robots.txt es público, así que un `Disallow: /estado`
// es un cartel que anuncia la ruta. Se esconde con `noindex` en la página, no
// enlazándola desde ningún sitio y dejándola fuera del sitemap.

// Comparación en tiempo constante, mismo patrón que /api/revalidate. Ante
// longitudes distintas se sale antes: solo se filtra la longitud, que no sirve
// de nada para adivinar el secreto.
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * ¿Puede pasar quien llama?
 *
 * Sin `ESTADO_KEY` configurada la respuesta es NO, siempre: falla cerrado. Un
 * despliegue al que se le olvide la variable deja el panel inaccesible, que es
 * molesto; si fallara abierto, dejaría a la vista el estado interno del sitio
 * sin que nadie se enterase, que es bastante peor.
 *
 * La clave se acepta por parámetro `?k=` (que es como se abre desde el móvil) o
 * por cabecera `x-estado-key` (que es como la manda el cron, para que no acabe
 * escrita en los logs de acceso).
 */
export function claveValida(request: Request): boolean {
  const esperada = process.env.ESTADO_KEY;
  if (!esperada) {
    return false;
  }

  const url = new URL(request.url);
  const recibida = url.searchParams.get("k") ?? request.headers.get("x-estado-key") ?? "";

  return recibida.length > 0 && safeEqual(recibida, esperada);
}

/**
 * Igual, pero cuando solo se tiene la clave suelta (Server Component).
 *
 * Devuelve un *type predicate* y no un `boolean` a secas: si esto dice que sí,
 * `recibida` es un `string`, y quien llama puede seguir usándola sin un `!` ni
 * un cast. No es azúcar — las dos páginas del panel necesitan la clave DESPUÉS
 * de validarla para enlazarse entre ellas, y la alternativa era silenciar a
 * TypeScript justo en la línea que decide quién entra.
 */
export function claveValidaDirecta(recibida: string | undefined): recibida is string {
  const esperada = process.env.ESTADO_KEY;
  if (!esperada || !recibida) {
    return false;
  }
  return safeEqual(recibida, esperada);
}

/**
 * La misma comprobación, pero utilizable desde el proxy.
 *
 * El proxy corre en el runtime Edge, donde NO existe `node:crypto` ni
 * `Buffer`, así que `timingSafeEqual` no se puede importar. Se implementa la
 * comparación en tiempo constante a mano: se recorren TODOS los bytes
 * acumulando diferencias con XOR, sin salir antes al primero que no cuadra.
 * Un `===` normal se para en el primer byte distinto, y ese "pararse antes" es
 * medible desde fuera.
 */
export function claveValidaEdge(recibida: string | null, esperada: string | undefined): boolean {
  if (!esperada || !recibida || recibida.length !== esperada.length) {
    return false;
  }
  const a = new TextEncoder().encode(recibida);
  const b = new TextEncoder().encode(esperada);
  if (a.length !== b.length) {
    return false;
  }
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a[i] ^ b[i];
  }
  return diferencia === 0;
}
