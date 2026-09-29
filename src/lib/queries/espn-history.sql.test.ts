import { beforeEach, describe, expect, it, vi } from "vitest";

// EL HISTORIAL DE ESPN NO PUEDE REPETIR UNA PELEA QUE YA ESTÁ EN `fights`.
//
// ESPN publica algunos eventos de la UFC —el Road to UFC— en su liga 3359, la de
// los regionales, y el scraper los guarda en fight_history_espn aunque esas
// peleas ya vivan en `fights`. El 29-sep-2026 eran 5 filas (6073, 22458, 26151,
// 27204 y 82075), y la Fase 1 del Contender Series iba a traer 2-3 más esa misma
// tarde. Se veían en dos sitios:
//
//   - la ficha pintaba la pelea DOS veces en el historial: la de `fights` y la
//     de ESPN;
//   - en la página del combate, la «Última pelea» de una esquina sin otro
//     combate UFC era EL MISMO combate que se estaba viendo: LAST_FIGHT_SQL
//     excluye la pelea abierta, cae al respaldo de ESPN y ESPN la tenía.
//     Pasaba en /fights/16146 (Maimaitijiang) y en /fights/3347 (Saeteurn).
//
// ⚠️ ESTE FICHERO SE PONE ROJO CON EL CÓDIGO ANTERIOR AL CAMBIO. Quítale el
// `not exists` a cualquiera de las dos consultas y la «base» de abajo le
// devuelve la fila duplicada, que es lo que devolvía la de verdad.
//
// LA TÉCNICA es la de `proximo-evento.sql.test.ts`: el mock de `sql()` contesta
// según el TEXTO de la consulta. Postgres solo esconde el duplicado si se lo
// PIDEN.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

// `unstable_cache` necesita el contexto de petición de Next, que aquí no existe
// (environment: "node"). Se sustituye por un paso directo, igual que en
// `proximo-evento.sql.test.ts`. El `cache()` de React, fuera de un Server
// Component, ya es un paso directo: cada llamada consulta la «base» otra vez.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import { mergeFightHistories } from "@/lib/fight-history";
import { getFighterDetail } from "@/lib/queries/fighters";
import { getFightDetail } from "@/lib/queries/fights";

const sqlMock = vi.mocked(sql);

type Fila = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Datos reales del 29-sep-2026.
// ─────────────────────────────────────────────────────────────────────────────

/** Yilizhati Maimaitijiang: su ÚNICA pelea en `fights` es la del 28-ago. */
const MAIMAITIJIANG = 9128;
/** Tre'ston Vines, su rival esa noche. Él sí tiene otra pelea UFC (UFC 320). */
const VINES = 6626;
/** Road To UFC: Maheshate vs. Flowers (evento 1094), semifinal del 28-ago. */
const SEMIFINAL = 16146;
/** La misma semifinal, tal como la publica ESPN. */
const FILA_DUPLICADA = 82075;

/** fight_history_espn de Maimaitijiang, por fecha desc (el orden de la ficha). */
const ESPN_MAIMAITIJIANG: Fila[] = [
  {
    id: FILA_DUPLICADA,
    promotion: "Road to UFC Season",
    event_name: "Road to UFC Season 5: Semifinals",
    event_date: "2026-08-28",
    opponent_name: "Tre'ston Vines",
    opponent_fighter_id: VINES,
    result: "draw",
    method: "S-DEC",
    end_round: 3,
    end_time: "5:00",
    is_title_fight: false,
  },
  {
    id: 82076,
    promotion: "WLF Zepai Cup",
    event_name: "WLF Zepai Cup: Tianshan Summit Duel",
    event_date: "2026-01-19",
    opponent_name: "Denis Chernikov",
    opponent_fighter_id: null,
    result: "win",
    method: "KO/TKO",
    end_round: 1,
    end_time: "3:51",
    is_title_fight: false,
  },
  {
    id: 82077,
    promotion: "WLF",
    event_name: "WLF: W.A.R.S. 88",
    event_date: "2025-10-24",
    opponent_name: "Maksim Lylov",
    opponent_fighter_id: null,
    result: "loss",
    method: "U-DEC",
    end_round: 3,
    end_time: "5:00",
    is_title_fight: false,
  },
  {
    id: 82078,
    promotion: "WLF",
    event_name: "WLF: W.A.R.S. 81",
    event_date: "2025-01-10",
    opponent_name: "Woo Ram Shim",
    opponent_fighter_id: null,
    result: "win",
    method: "KO/TKO",
    end_round: 1,
    end_time: "3:59",
    is_title_fight: false,
  },
];

/** La fila de `fighters` (lo justo para que la ficha pase de la primera consulta). */
const LUCHADOR: Fila = {
  id: MAIMAITIJIANG,
  name: "Yilizhati Maimaitijiang",
  nickname: null,
  nationality: "China",
  wins: 7,
  losses: 1,
  draws: 0,
  ufc_fight_count: "1",
};

/** Su historial UFC: la semifinal, empate por decisión dividida. */
const HISTORIAL_UFC: Fila = {
  fight_id: SEMIFINAL,
  event_id: 1094,
  event_name: "Road To UFC: Maheshate vs. Flowers",
  event_date: "2026-08-28",
  opponent_id: VINES,
  opponent_name: "Tre'ston Vines",
  opponent_headshot: null,
  corner: "red",
  result: "draw",
  method: "S-DEC",
  end_round: 3,
  end_time: "5:00",
  weight_class: null,
  video_url: null,
  is_title_fight: false,
};

/** La fila del combate 16146 que lee getFightDetail. */
const COMBATE: Fila = {
  id: SEMIFINAL,
  event_id: 1094,
  event_name: "Road To UFC: Maheshate vs. Flowers",
  event_date: "2026-08-28",
  method: "S-DEC",
  end_round: 3,
  end_time: "5:00",
  winner_id: null,
  status: null,
  red_fighter_name: "Yilizhati Maimaitijiang",
  red_id: MAIMAITIJIANG,
  red_name: "Yilizhati Maimaitijiang",
  blue_fighter_name: "Tre'ston Vines",
  blue_id: VINES,
  blue_name: "Tre'ston Vines",
};

/** LAST_FIGHT_SQL de Vines: su pelea UFC anterior, que no es la que se ve. */
const ULTIMA_UFC_VINES: Fila = {
  fight_id: 3297,
  event_name: "UFC 320: Ankalaev vs. Pereira 2",
  event_date: "2025-10-04",
  result: "loss",
  method: "KO/TKO - Punches",
};

// ─────────────────────────────────────────────────────────────────────────────
// La «base», en pequeño.
// ─────────────────────────────────────────────────────────────────────────────

/** La consulta en una línea: sin comentarios SQL y con los espacios normalizados. */
function plana(query: string): string {
  return query
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El cuerpo del `not exists (...)` de la consulta, ya aplanado; null si no lo
 * lleva. Se recorren los paréntesis para quedarse con la subconsulta ENTERA
 * (la de dentro tiene los suyos).
 */
function filtroDeDuplicados(query: string): string | null {
  const texto = plana(query);
  const apertura = "not exists (";
  const inicio = texto.indexOf(apertura);
  if (inicio === -1) return null;
  let profundidad = 0;
  for (let i = inicio + apertura.length - 1; i < texto.length; i++) {
    if (texto[i] === "(") profundidad++;
    if (texto[i] === ")" && --profundidad === 0) {
      return texto.slice(inicio + apertura.length, i).trim();
    }
  }
  return null;
}

/** Como Postgres: el duplicado solo desaparece si la consulta lo cruza con `fights`. */
function pideSinDuplicados(query: string): boolean {
  return filtroDeDuplicados(query)?.includes("from fights fi") ?? false;
}

function responder(query: string, params: unknown[] = []): Fila[] {
  // Primero la tabla de ESPN: con el arreglo, su consulta TAMBIÉN lleva
  // «from fights fi» (dentro del not exists) y la confundiría con las de abajo.
  if (query.includes("from fight_history_espn")) {
    const filas = params[0] === MAIMAITIJIANG ? ESPN_MAIMAITIJIANG : [];
    const visibles = pideSinDuplicados(query)
      ? filas.filter((fila) => fila.id !== FILA_DUPLICADA)
      : filas;
    // LAST_FIGHT_ESPN_SQL se queda con la primera (limit 1).
    return plana(query).endsWith("limit 1") ? visibles.slice(0, 1) : visibles;
  }
  if (/from fighters f\s+where f\.id = \$1/.test(query)) {
    return params[0] === MAIMAITIJIANG ? [LUCHADOR] : [];
  }
  if (query.includes("as opponent_name")) {
    return params[0] === MAIMAITIJIANG ? [HISTORIAL_UFC] : [];
  }
  if (query.includes("as red_fighter_name")) {
    return params[0] === SEMIFINAL ? [COMBATE] : [];
  }
  if (query.includes("fi.id <> $2")) {
    // LAST_FIGHT_SQL, que excluye el combate abierto: Maimaitijiang no tiene
    // OTRO en `fights` y cae al respaldo de ESPN. Vines tiene el UFC 320.
    return params[0] === VINES ? [ULTIMA_UFC_VINES] : [];
  }
  // Stats, noticias, ranking, récord, tarjetas de los jueces: no pintan nada
  // aquí. Vacías, y cada mapeo cae a su valor por defecto.
  return [];
}

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockImplementation((query: string, params?: unknown[]) =>
    Promise.resolve(responder(query, params) as never),
  );
});

const consultasDeEspn = () =>
  sqlMock.mock.calls
    .map(([query]) => String(query))
    .filter((query) => query.includes("from fight_history_espn"));

/** Las piezas del filtro, tal cual: si falta una, el duplicado vuelve o sobra algo. */
const PIEZAS_DEL_FILTRO = [
  // Contra `fights`, y con la fecha del EVENTO: `fights` no tiene fecha propia.
  "select 1 from fights fi join events e on e.id = fi.event_id",
  // El mismo luchador, en cualquiera de las dos esquinas.
  "(fi.fighter_red_id = h.fighter_id or fi.fighter_blue_id = h.fighter_id)",
  // Un combate cancelado no se peleó: no puede tapar nada.
  "fi.status is distinct from 'cancelled'",
  // ±1 día: la ingesta guarda la fecha de ESPN en hora del Este.
  "e.event_date between h.event_date - 1 and h.event_date + 1",
];

describe("🔴 la ficha: el historial de ESPN no repite lo que ya está en `fights`", () => {
  it("la consulta lleva el not exists contra fights: mismo luchador, sin canceladas y con ±1 día", async () => {
    await getFighterDetail(MAIMAITIJIANG);
    const [consulta] = consultasDeEspn();
    expect(consulta, "getFighterDetail ya no consulta fight_history_espn").toBeDefined();

    const filtro = filtroDeDuplicados(consulta);
    expect(filtro, "la consulta del historial ESPN no lleva `not exists`").not.toBeNull();
    for (const pieza of PIEZAS_DEL_FILTRO) {
      expect(filtro, `al not exists le falta «${pieza}»`).toContain(pieza);
    }
  });

  it("el filtro va en el WHERE y el orden de siempre sigue al final", async () => {
    // El orden importa fuera de la tabla: latestRegionalFight (la «Última
    // pelea» de la ficha para un fichaje sin UFC) se queda con la PRIMERA fila.
    await getFighterDetail(MAIMAITIJIANG);
    const [consulta] = consultasDeEspn();

    expect(plana(consulta)).toMatch(
      /from fight_history_espn h where h\.fighter_id = \$1 and not exists \(.+\) order by h\.event_date desc nulls last, h\.id desc$/,
    );
  });

  it("Maimaitijiang (9128): la semifinal del 28-ago sale UNA vez en la tabla, la de `fights`", async () => {
    const detalle = await getFighterDetail(MAIMAITIJIANG);
    expect(detalle).not.toBeNull();
    if (!detalle) return;

    // Las tres regionales siguen, y en el mismo orden.
    expect(detalle.espnHistory.map((pelea) => pelea.fightId)).toEqual([82076, 82077, 82078]);

    // Lo que pinta la ficha: las dos fuentes fusionadas.
    const tabla = mergeFightHistories(detalle.history, detalle.espnHistory);
    const semifinal = tabla.filter((pelea) => pelea.eventDate === "2026-08-28");
    expect(semifinal).toHaveLength(1);
    // Y es la de `fights`, la que enlaza con la ficha del combate.
    expect(semifinal[0].fightId).toBe(SEMIFINAL);
    expect(semifinal[0].origin).toBeUndefined();
  });
});

describe("🔴 la página del combate: la «Última pelea» de respaldo", () => {
  it("LAST_FIGHT_ESPN_SQL lleva el MISMO filtro que la ficha, letra por letra", async () => {
    // Dos copias del mismo predicado: si una se retoca y la otra no, la ficha y
    // la página del combate vuelven a contar historias distintas.
    await getFighterDetail(MAIMAITIJIANG);
    await getFightDetail(SEMIFINAL);
    const [deLaFicha, delCombate] = consultasDeEspn();
    expect(delCombate, "getFightDetail ya no consulta fight_history_espn").toBeDefined();

    const filtro = filtroDeDuplicados(delCombate);
    expect(filtro, "LAST_FIGHT_ESPN_SQL no lleva `not exists`").not.toBeNull();
    for (const pieza of PIEZAS_DEL_FILTRO) {
      expect(filtro, `al not exists le falta «${pieza}»`).toContain(pieza);
    }
    expect(filtro).toBe(filtroDeDuplicados(deLaFicha));
  });

  it("con el alias h en toda la consulta, y el mismo orden que antes", async () => {
    // Sin alias, dentro del not exists un `event_date` suelto no se sabría de
    // qué tabla es: el alias lo deja escrito.
    await getFightDetail(SEMIFINAL);
    const [consulta] = consultasDeEspn();

    expect(plana(consulta)).toMatch(
      /^select h\.event_name, h\.event_date, h\.result, h\.method from fight_history_espn h where h\.fighter_id = \$1 and h\.result in \('win', 'loss', 'draw'\) and not exists \(.+\) order by h\.event_date desc nulls last, h\.id desc limit 1$/,
    );
  });

  it("/fights/16146: la última pelea de Maimaitijiang es la de enero, no el propio combate", async () => {
    const combate = await getFightDetail(SEMIFINAL);
    expect(combate).not.toBeNull();
    if (!combate) return;

    // Lo que se veía: «Última pelea: Road to UFC Season 5: Semifinals», el
    // combate de esta misma página.
    expect(combate.red.lastFight).toEqual({
      fightId: null,
      eventName: "WLF Zepai Cup: Tianshan Summit Duel",
      eventDate: "2026-01-19",
      result: "win",
      method: "KO/TKO",
    });
    // Vines tiene otra pelea UFC: manda esa, como siempre.
    expect(combate.blue.lastFight?.fightId).toBe(3297);
  });
});
