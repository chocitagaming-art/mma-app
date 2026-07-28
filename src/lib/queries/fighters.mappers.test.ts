import { describe, expect, it } from "vitest";

import { mapFighter } from "@/lib/queries/fighters.mappers";
import type { FighterRow } from "@/lib/queries/fighters.types";

// Fila mínima con las columnas obligatorias; cada test sobreescribe lo suyo.
function fila(extra: Partial<FighterRow> = {}): FighterRow {
  return {
    id: 6493,
    name: "Charles Oliveira",
    nickname: null,
    headshot_url: null,
    nationality: null,
    birth_date: null,
    height_cm: null,
    reach_cm: null,
    stance: null,
    weight_grams: null,
    wins: 37,
    losses: 11,
    draws: 0,
    updated_at: null,
    ...extra,
  } as FighterRow;
}

describe("mapFighter", () => {
  // El bug que esto arregla era VISIBLE: la ficha pintaba literalmente
  // "Bronx&#039;s Gold Team" en el apartado Gimnasio. React escapa el texto que
  // recibe, y el navegador no vuelve a decodificar lo ya escapado, así que la
  // entidad cruda de la BD llegaba tal cual a los ojos del usuario.
  it("resuelve las entidades HTML del gimnasio y del lugar de nacimiento", () => {
    const f = mapFighter(
      fila({
        trains_at: "Bronx&#039;s Gold Team",
        birth_place: "Ponte dell&amp;#039;Olio, Italy",
      }),
    );

    expect(f.trainsAt).toBe("Bronx's Gold Team");
    expect(f.birthPlace).toBe("Ponte dell'Olio, Italy");
  });

  it("deja en null lo que viene vacío, en vez de una cadena en blanco", () => {
    const f = mapFighter(fila({ trains_at: "   ", birth_place: null }));

    expect(f.trainsAt).toBeNull();
    expect(f.birthPlace).toBeNull();
  });

  it("no toca un gimnasio que ya venía limpio", () => {
    expect(mapFighter(fila({ trains_at: "Chute Boxe Diego Lima" })).trainsAt).toBe(
      "Chute Boxe Diego Lima",
    );
  });

  it("sigue mapeando el resto de la fila sin cambios", () => {
    const f = mapFighter(fila({ height_cm: "177.8", nickname: "Do Bronxs" }));

    expect(f.id).toBe(6493);
    expect(f.name).toBe("Charles Oliveira");
    expect(f.nickname).toBe("Do Bronxs");
    expect(f.heightCm).toBe(177.8);
    expect(f.wins).toBe(37);
  });
});
