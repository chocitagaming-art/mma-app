import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ETIQUETA_TIER,
  EVENT_TIERS,
  eventoPrincipalSql,
  TIER_DESTACABLE,
  TIERS_SECUNDARIOS,
  type EventTier,
} from "@/lib/event-tier";

// EL FALLO QUE ESTE FICHERO NO DEJA VOLVER. El 26-ago-2026 el "Road To UFC:
// Maheshate vs. Flowers" (id 1094, viernes 28, 2 combates, sin sede ni póster)
// desplazó al UFC Fight Night del sábado (id 1065, 13 combates) en la portada,
// en /eventos, en /en-vivo, en /ufc-hoy, en /estado y en /directo, y también en
// el centinela y en el vigilante del directo. Los dos son `promotion_id = 1`:
// la promotora NO los distingue, así que nada en la base separaba una velada de
// verdad de un torneo de cantera.
//
// LA REGLA no vive aquí: vive en la columna generada `events.tier` (migración
// 028), que Postgres calcula del slug y del nombre. Lo que se prueba aquí es lo
// único que sí decide este fichero, y es lo que se puede romper en silencio: DE
// QUÉ LADO cae cada tipo, y la FORMA EXACTA del predicado que se cuela en las
// nueve consultas de "¿cuál es EL evento?".

describe("eventoPrincipalSql", () => {
  it("usa el alias 'e' por defecto: el de las consultas que hacen FROM events e", () => {
    expect(eventoPrincipalSql()).toBe(
      "e.tier NOT IN ('road_to_ufc','dwcs','tuf_series')",
    );
  });

  it("honra el alias que se le pasa", () => {
    expect(eventoPrincipalSql("events")).toBe(
      "events.tier NOT IN ('road_to_ufc','dwcs','tuf_series')",
    );
  });

  // 🪤 DOS CONSULTAS MIRAN LA TABLA SIN ALIAS: CARTELERA_SQL del panel /estado
  // (`select id from events where ...`) y EVENTO_SQL de /directo, que es el que
  // resuelve QUÉ velada se graba el sábado. Las dos llaman con "".
  //
  // Con el punto delante, lo que se concatena es `and .tier NOT IN (...)`, y eso
  // NO es SQL: Postgres lo rechaza con un error de sintaxis y se cae la consulta
  // entera. No degrada ni esconde un evento — revienta el panel de estado y deja
  // al vigilante del directo sin saber qué evento mirar. Y no lo caza ni el
  // compilador ni la revisión: es un carácter dentro de una cadena que se monta
  // en tiempo de ejecución.
  it("con alias vacío no deja el punto delante", () => {
    expect(eventoPrincipalSql("")).toBe(
      "tier NOT IN ('road_to_ufc','dwcs','tuf_series')",
    );
  });

  // Invertir el sentido del predicado dejaría el sitio enseñando SOLO Road To
  // UFC y Contender Series. Es un cambio de tres letras y no rompe ninguna
  // consulta: todas siguen devolviendo una fila, la contraria.
  it("excluye, no incluye: es un NOT IN", () => {
    expect(eventoPrincipalSql()).toMatch(/\btier NOT IN \(/);
  });

  it("nombra a los tres tipos secundarios", () => {
    for (const tier of TIERS_SECUNDARIOS) {
      expect(eventoPrincipalSql()).toContain(`'${tier}'`);
    }
  });

  // El otro lado del aserto anterior: si alguien mete 'fight_night' o 'unknown'
  // en la lista negra, el sábado de velada la portada se queda muda.
  it("no nombra a ninguno de los destacables", () => {
    for (const tier of EVENT_TIERS.filter((t) => TIER_DESTACABLE[t])) {
      expect(eventoPrincipalSql()).not.toContain(`'${tier}'`);
    }
  });
});

describe("de qué lado cae cada tipo", () => {
  // ⚠️ ESTE ASERTO PROTEGE UNA DECISIÓN, NO UN DESPISTE.
  //
  // 'unknown' es destacable A PROPÓSITO. La regla de la 028 es una LISTA NEGRA:
  // lo que no reconoce cae en 'unknown', y 'unknown' se VE. Un formato nuevo que
  // no clasifiquemos aparece en la portada — molesto, visible y de un renglón,
  // que es el fallo de hoy y se arregla en una tarde. El fallo contrario —un UFC
  // Fight Night de verdad que desaparece del hero, de /en-vivo, de /directo y
  // del centinela, en silencio, un sábado por la noche— es muchísimo peor y
  // nadie se entera hasta que empieza la velada.
  //
  // Y no es teórico: los 8 'unknown' de la base son veladas UFC completas
  // (Ultimate Japan, Ultimate Brazil, UFC Macao, UFC Freedom 250...). Ponerlo en
  // false las borraría del bloque "Último evento".
  it("'unknown' es destacable, y es deliberado: la lista negra falla enseñando de más", () => {
    expect(TIER_DESTACABLE.unknown).toBe(true);
  });

  // Las 28 "... Finale" son carteles UFC completos. La función de la 028 tiene
  // dos ramas para 'ultimate fighter' y el orden entre ellas importa; esto
  // vigila que el lado TypeScript diga lo mismo que esas dos ramas.
  it("una Finale del TUF es un cartel UFC de verdad, no el programa", () => {
    expect(TIER_DESTACABLE.tuf_finale).toBe(true);
    expect(TIER_DESTACABLE.tuf_series).toBe(false);
  });

  it.each(["road_to_ufc", "dwcs", "tuf_series"] as const)(
    "%s no puede ser el evento destacado",
    (tier) => {
      expect(TIER_DESTACABLE[tier]).toBe(false);
    },
  );

  it.each(["numbered", "fight_night"] as const)(
    "%s sí puede ser el evento destacado",
    (tier) => {
      expect(TIER_DESTACABLE[tier]).toBe(true);
    },
  );

  // TIERS_SECUNDARIOS se deriva hoy de TIER_DESTACABLE con un filter, así que
  // esto parece trivial. Lo es MIENTRAS siga derivándose: escribir la lista a
  // mano ("total, son tres") es justo lo que las desincroniza, y entonces el SQL
  // filtra una cosa y el rótulo de la tarjeta dice otra.
  it("TIERS_SECUNDARIOS y TIER_DESTACABLE no se contradicen", () => {
    for (const tier of EVENT_TIERS) {
      expect(TIERS_SECUNDARIOS.includes(tier)).toBe(!TIER_DESTACABLE[tier]);
    }
  });

  it("quedan tipos de los dos lados: ni todo dentro ni todo fuera", () => {
    expect(TIERS_SECUNDARIOS).toEqual(["road_to_ufc", "dwcs", "tuf_series"]);
    expect(TIERS_SECUNDARIOS.length).toBeLessThan(EVENT_TIERS.length);
  });
});

// Tres listas describen el mismo conjunto de valores. TypeScript ya obliga a que
// los dos Record los cubran... mientras estén tipados con la unión. El día que
// alguien afloje uno a Record<string, ...> —el atajo natural del que tiene
// prisa— la red desaparece sin que nadie lo note, y un tier sin entrada en
// ETIQUETA_TIER se pinta como `undefined` en la tarjeta.
describe("las tres tablas cubren exactamente los mismos tiers", () => {
  const ordenados = [...EVENT_TIERS].sort();

  it("EVENT_TIERS no tiene duplicados", () => {
    expect(new Set(EVENT_TIERS).size).toBe(EVENT_TIERS.length);
  });

  it("TIER_DESTACABLE tiene una entrada por tier y ninguna de más", () => {
    expect(Object.keys(TIER_DESTACABLE).sort()).toEqual(ordenados);
  });

  it("ETIQUETA_TIER tiene una entrada por tier y ninguna de más", () => {
    expect(Object.keys(ETIQUETA_TIER).sort()).toEqual(ordenados);
  });

  // El rótulo existe para que un Road To UFC en /eventos se vea por lo que es y
  // no parezca la velada de la semana. Un secundario sin rótulo es un secundario
  // disfrazado; un destacable CON rótulo ensucia la portada.
  it("solo los secundarios llevan rótulo", () => {
    for (const tier of EVENT_TIERS) {
      if (TIER_DESTACABLE[tier]) {
        expect(ETIQUETA_TIER[tier]).toBeNull();
      } else {
        expect(ETIQUETA_TIER[tier]).toEqual(expect.any(String));
        expect(ETIQUETA_TIER[tier]).not.toBe("");
      }
    }
  });
});

// LA OTRA MITAD DE LA VERDAD ESTÁ EN EL OTRO REPO. Los valores de EVENT_TIERS no
// se los inventa este fichero: son los que la base puede devolver, y los fija el
// CHECK de `events_tier_override_check` en mma-ingesta/db/migrations/028. Si los
// dos repos se separan, aquí no falla nada —el tipo sigue compilando— y el
// desajuste solo se ve en producción: un tier que TypeScript no conoce, o un
// override manual escrito a mano una noche de velada que el CHECK rechaza.
//
// Se lee del .sql, no de memoria. Y si mma-ingesta no está clonado al lado (el
// CI de mma-app clona un repo, no dos), el bloque se SALTA entero: ponerse rojo
// por un fichero que no existe sería ruido, no una alarma.
const RUTA_MIGRACION = fileURLToPath(
  new URL(
    "../../../mma-ingesta/db/migrations/028_events_tier.sql",
    import.meta.url,
  ),
);
const MIGRACION = existsSync(RUTA_MIGRACION)
  ? readFileSync(RUTA_MIGRACION, "utf8")
  : null;

describe.skipIf(MIGRACION === null)(
  "migración 028 · el contrato con la base",
  () => {
    // Dentro del bloque MIGRACION nunca es null: si lo fuera, no se ejecutaría.
    const sql = MIGRACION ?? "";

    it("EVENT_TIERS son exactamente los siete que permite el CHECK", () => {
      // La primera aparición de `events_tier_override_check` es el DROP; el
      // `tier_override IN` más cercano hacia abajo es ya el del CHECK bueno.
      const lista =
        /events_tier_override_check[\s\S]*?tier_override IN\s*\(([^)]*)\)/.exec(
          sql,
        );
      expect(lista).not.toBeNull();
      const delCheck = [...(lista?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map(
        (m) => m[1],
      );
      expect(delCheck.sort()).toEqual([...EVENT_TIERS].sort());
    });

    // El CHECK solo vigila el override manual. Lo que rellena la columna de
    // verdad es el CASE de public.event_tier(), y ahí es donde entraría un tier
    // nuevo ('pfl', 'ufc_apex'...) sin acordarse de este repo: la base lo
    // devolvería, TIER_DESTACABLE no lo conocería y el evento se colaría en la
    // portada con `undefined` por rótulo.
    it("el CASE de event_tier() no devuelve ningún tier que este repo no conozca", () => {
      const cuerpo = sql.slice(
        sql.indexOf("$funcion$") + "$funcion$".length,
        sql.lastIndexOf("$funcion$"),
      );
      const devueltos = [
        ...cuerpo.matchAll(/(?:THEN|ELSE)\s+'([a-z_]+)'/g),
      ].map((m) => m[1] as EventTier);

      expect(devueltos.length).toBeGreaterThan(0);
      for (const tier of devueltos) {
        expect(EVENT_TIERS).toContain(tier);
      }
      // Y al revés: los tres que el predicado excluye tienen que poder salir de
      // la función. Una lista negra que filtra por un valor que la base no
      // produce nunca no filtra nada.
      for (const tier of TIERS_SECUNDARIOS) {
        expect(devueltos).toContain(tier);
      }
    });
  },
);
