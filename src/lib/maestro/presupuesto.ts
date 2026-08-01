// Presupuesto de una petición al Maestro: cuánto puede gastar y cuánto puede
// tardar antes de que haya que cortar y devolver lo que se tenga.
//
// EL PROBLEMA. Una sola petición HTTP puede disparar hasta SIETE llamadas al
// modelo (6 vueltas de herramientas más la de cierre), cada una con timeout
// propio de 30 s. Eso son 210 s teóricos y una factura sin techo, con dos
// consecuencias que se notan por separado:
//   · sin tope de TIEMPO, la función muere en el límite de la plataforma
//     DESPUÉS de haber pagado las llamadas: se gasta y no se entrega nada.
//   · sin tope de GASTO, una conversación larga con herramientas que devuelven
//     mucho texto reenvía todo el historial en cada vuelta, y el coste crece
//     con el cuadrado de la conversación sin que nada lo mire.
//
// El límite de iteraciones que ya existía (MAX_TOOL_ITERATIONS = 6) acota las
// VUELTAS, que no es lo mismo: seis vueltas baratas y seis carísimas cuentan
// igual. Esto mide lo que de verdad se gasta.

export type Presupuesto = {
  /** Tokens (entrada + salida) acumulados que no se deben rebasar. */
  tokensMax: number;
  /** Milisegundos desde que entró la petición. */
  msMax: number;
};

export type Gasto = {
  tokens: number;
  msTranscurridos: number;
};

export type MotivoCorte = "tokens" | "tiempo";

// 120.000 tokens acumulados por petición. Referencia: una conversación normal
// del Maestro ronda los 15.000-25.000 entre las 7 llamadas, así que esto deja
// margen de sobra para el uso legítimo y aun así pone un techo.
export const TOKENS_MAX_POR_PETICION = 120_000;

// 45 s de las 60 que da `maxDuration`. Los 15 restantes son el margen para
// cerrar la última llamada y serializar la respuesta: cortar justo en el límite
// de la plataforma es lo mismo que no cortar, porque el 504 llega igual.
export const MS_MAX_POR_PETICION = 45_000;

export const PRESUPUESTO_POR_DEFECTO: Presupuesto = {
  tokensMax: TOKENS_MAX_POR_PETICION,
  msMax: MS_MAX_POR_PETICION,
};

/**
 * ¿Hay que dejar de llamar al modelo? Devuelve el motivo, o null si se puede
 * seguir.
 *
 * Se consulta ANTES de cada llamada, no después: comprobarlo al final serviría
 * para el informe pero no para evitar el gasto, que es de lo que se trata.
 */
export function motivoDeCorte(
  gasto: Gasto,
  presupuesto: Presupuesto = PRESUPUESTO_POR_DEFECTO,
): MotivoCorte | null {
  if (gasto.tokens >= presupuesto.tokensMax) {
    return "tokens";
  }
  if (gasto.msTranscurridos >= presupuesto.msMax) {
    return "tiempo";
  }
  return null;
}

/**
 * Suma el consumo de una respuesta de la API al acumulado.
 *
 * Cuenta también los tokens de caché. Es tentador ignorarlos porque son mucho
 * más baratos, pero el presupuesto está aquí para acotar el trabajo total: una
 * conversación que reenvía 100.000 tokens leídos de caché en cada vuelta sigue
 * siendo una conversación que hay que cortar. Los campos son opcionales porque
 * la API no siempre los envía.
 */
export function sumarUso(
  acumulado: number,
  uso: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  } | null
    | undefined,
): number {
  if (!uso) {
    return acumulado;
  }
  return (
    acumulado +
    (uso.input_tokens ?? 0) +
    (uso.output_tokens ?? 0) +
    (uso.cache_creation_input_tokens ?? 0) +
    (uso.cache_read_input_tokens ?? 0)
  );
}
