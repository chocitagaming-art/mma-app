import { describe, expect, it } from "vitest";

import {
  MS_MAX_POR_PETICION,
  motivoDeCorte,
  sumarUso,
  TOKENS_MAX_POR_PETICION,
} from "@/lib/maestro/presupuesto";

describe("motivoDeCorte", () => {
  it("deja seguir mientras quede presupuesto", () => {
    expect(motivoDeCorte({ tokens: 1_000, msTranscurridos: 500 })).toBeNull();
  });

  it("corta al agotar los tokens", () => {
    expect(
      motivoDeCorte({ tokens: TOKENS_MAX_POR_PETICION, msTranscurridos: 0 }),
    ).toBe("tokens");
  });

  it("corta al agotar el tiempo", () => {
    expect(
      motivoDeCorte({ tokens: 0, msTranscurridos: MS_MAX_POR_PETICION }),
    ).toBe("tiempo");
  });

  it("los tokens mandan cuando se agotan los dos", () => {
    // Es el motivo accionable: el tiempo se recupera solo, el dinero no.
    expect(
      motivoDeCorte({
        tokens: TOKENS_MAX_POR_PETICION,
        msTranscurridos: MS_MAX_POR_PETICION,
      }),
    ).toBe("tokens");
  });

  it("justo por debajo del límite todavía se puede llamar", () => {
    expect(
      motivoDeCorte({
        tokens: TOKENS_MAX_POR_PETICION - 1,
        msTranscurridos: MS_MAX_POR_PETICION - 1,
      }),
    ).toBeNull();
  });

  it("acepta un presupuesto propio, para poder probar el corte sin gastar", () => {
    expect(
      motivoDeCorte({ tokens: 10, msTranscurridos: 0 }, { tokensMax: 10, msMax: 999 }),
    ).toBe("tokens");
  });

  it("el margen deja hueco para cerrar antes del límite de la plataforma", () => {
    // maxDuration está en 60 s. Cortar en el segundo 60 no sirve de nada: el
    // 504 llega igual y encima ya se ha pagado.
    expect(MS_MAX_POR_PETICION).toBeLessThan(60_000);
  });
});

describe("sumarUso", () => {
  it("suma entrada y salida", () => {
    expect(sumarUso(0, { input_tokens: 100, output_tokens: 50 })).toBe(150);
  });

  it("cuenta también los tokens de caché", () => {
    // Son más baratos, pero el presupuesto acota el TRABAJO total: una
    // conversación que reenvía 100.000 tokens cacheados en cada vuelta hay que
    // cortarla igual.
    expect(
      sumarUso(0, {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 1_000,
        cache_read_input_tokens: 20_000,
      }),
    ).toBe(21_015);
  });

  it("acumula entre llamadas", () => {
    let total = 0;
    total = sumarUso(total, { input_tokens: 100, output_tokens: 20 });
    total = sumarUso(total, { input_tokens: 200, output_tokens: 30 });
    expect(total).toBe(350);
  });

  it("un uso ausente o incompleto no rompe la cuenta", () => {
    expect(sumarUso(42, null)).toBe(42);
    expect(sumarUso(42, undefined)).toBe(42);
    expect(sumarUso(42, {})).toBe(42);
    expect(sumarUso(42, { input_tokens: 8, output_tokens: null })).toBe(50);
  });
});
