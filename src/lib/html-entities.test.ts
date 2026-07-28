import { describe, expect, it } from "vitest";

import { decodeHtmlEntities, decodeHtmlEntitiesOrNull } from "@/lib/html-entities";

describe("decodeHtmlEntities", () => {
  // Todos los casos salen de la BD de producción (28-jul-2026), no inventados.
  it("resuelve las entidades que los scrapers dejan crudas", () => {
    expect(decodeHtmlEntities("Bronx&#039;s Gold Team")).toBe("Bronx's Gold Team");
    expect(decodeHtmlEntities("Glory MMA &amp; Fitness")).toBe("Glory MMA & Fitness");
    expect(decodeHtmlEntities("Mick Doyle&#039;s Kickboxing - Omaha, NE")).toBe(
      "Mick Doyle's Kickboxing - Omaha, NE",
    );
    expect(
      decodeHtmlEntities("Team Alpha Male  (Urijah Faber&#039;s Ultimate Fitness)"),
    ).toBe("Team Alpha Male  (Urijah Faber's Ultimate Fitness)");
  });

  it("resuelve el doble codificado que hay en birth_place", () => {
    expect(decodeHtmlEntities("Ponte dell&amp;#039;Olio, Italy")).toBe(
      "Ponte dell'Olio, Italy",
    );
    expect(decodeHtmlEntities("St. Pierre &amp;amp; Miquelon, France")).toBe(
      "St. Pierre & Miquelon, France",
    );
  });

  it("acepta también las entidades hexadecimales y con nombre", () => {
    expect(decodeHtmlEntities("caf&#xe9; &quot;X&quot; &lt;y&gt;")).toBe('café "X" <y>');
  });

  it("se detiene a las dos pasadas y no se deja arrastrar por el dato", () => {
    // Triple codificado: se desenrolla dos veces y para. Que quede una entidad
    // a medias es MEJOR que un bucle gobernado por la entrada.
    expect(decodeHtmlEntities("&amp;amp;amp;lt;")).toBe("&amp;lt;");
  });

  it("deja intacto un texto limpio", () => {
    expect(decodeHtmlEntities("Chute Boxe Diego Lima")).toBe("Chute Boxe Diego Lima");
    expect(decodeHtmlEntities("")).toBe("");
  });

  it("es idempotente: aplicarlo dos veces no cambia el resultado", () => {
    // Importa porque el dato pasa por el mapper Y por los datos estructurados.
    const una = decodeHtmlEntities("Bronx&#039;s Gold Team");
    expect(decodeHtmlEntities(una)).toBe(una);
  });
});

describe("decodeHtmlEntitiesOrNull", () => {
  it("convierte en null lo que no aporta nada", () => {
    expect(decodeHtmlEntitiesOrNull(null)).toBeNull();
    expect(decodeHtmlEntitiesOrNull(undefined)).toBeNull();
    expect(decodeHtmlEntitiesOrNull("")).toBeNull();
    expect(decodeHtmlEntitiesOrNull("   ")).toBeNull();
  });

  it("decodifica y recorta el resto", () => {
    expect(decodeHtmlEntitiesOrNull("  Glory MMA &amp; Fitness  ")).toBe(
      "Glory MMA & Fitness",
    );
  });
});
