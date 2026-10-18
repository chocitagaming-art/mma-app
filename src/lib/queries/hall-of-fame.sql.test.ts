import { beforeEach, describe, expect, it, vi } from "vitest";

// EL SALÓN TIENE QUE SERVIRSE ANTES Y DESPUÉS DE LA MIGRACIÓN 031.
//
// La 031 (mma-ingesta) añade a hall_of_fame video_id, video_start, video_end y
// photo_focus, y crea photo_cutout. El orden de despliegue es migración + seed
// ANTES de la web, pero la web tiene que aguantar sin ellos: sin columnas ni
// tabla, todo enmarcado y sin vídeo, y sin perder las biografías (014).
//
// Técnica de event-videos.sql.test.ts: el mock de `sql()` contesta según el
// TEXTO de la consulta, como lo haría una base sin esas columnas.
vi.mock("@/lib/db", () => ({ sql: vi.fn() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
}));

import { sql } from "@/lib/db";
import {
  SCHEMA_LADDER,
  getHallOfFame,
  hallOfFameQuery,
  isSchemaError,
} from "@/lib/queries/hall-of-fame";

const sqlMock = vi.mocked(sql);

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

const HUGHES_TRIGG = {
  wing: "fight",
  display_name: "Matt Hughes vs. Frank Trigg II",
  inductee_year: 2015,
  sort_order: 1,
  subtitle: "UFC 52",
  photo_url: null,
  bio: "La revancha.",
  photo_focus: null,
  video_id: "E2fUq7gT8z4",
  video_start: 6646,
  video_end: null,
  photo_measured_url: null,
  photo_is_cutout: null,
  fighter_id: null,
  headshot_url: null,
  nationality: null,
  corner_a_id: 1,
  corner_a_name: "Matt Hughes",
  corner_a_headshot: "https://ufc.com/hughes.png",
  corner_a_measured_url: "https://ufc.com/hughes.png",
  corner_a_cutout: true,
  corner_b_id: 8548,
  corner_b_name: "Frank Trigg",
  corner_b_headshot: null,
  corner_b_measured_url: null,
  corner_b_cutout: null,
};

const FRYE = {
  ...HUGHES_TRIGG,
  wing: "pioneer",
  display_name: "Don Frye",
  inductee_year: 2016,
  sort_order: 11,
  subtitle: null,
  photo_url: "https://www.ufc.com/images/styles/382x217_2/s3/2023-11/HOF_DFrye_16x9.jpg?h=1&itok=2",
  photo_focus: "50% 28%",
  video_id: null,
  video_start: null,
  photo_measured_url: "https://www.ufc.com/images/styles/382x217_2/s3/2023-11/HOF_DFrye_16x9.jpg?h=1&itok=2",
  photo_is_cutout: false,
  fighter_id: 42,
  corner_a_id: null,
  corner_a_name: null,
  corner_a_headshot: null,
  corner_a_measured_url: null,
  corner_a_cutout: null,
  corner_b_id: null,
  corner_b_name: null,
};

/** A database that knows (or not) each part of the schema. */
function database({ bio, salon, cutout }: { bio: boolean; salon: boolean; cutout: boolean }) {
  return async (query: string) => {
    if (!cutout && query.includes("photo_cutout")) {
      throw pgError("42P01", 'relation "photo_cutout" does not exist');
    }
    if (!salon && query.includes("h.video_id")) {
      throw pgError("42703", 'column h.video_id does not exist');
    }
    if (!bio && query.includes("h.bio")) {
      throw pgError("42703", 'column h.bio does not exist');
    }
    // What a real SELECT would return for the columns asked as NULL.
    return [HUGHES_TRIGG, FRYE].map((row) => ({
      ...row,
      bio: bio ? row.bio : null,
      ...(salon ? {} : { photo_focus: null, video_id: null, video_start: null, video_end: null }),
      ...(cutout
        ? {}
        : {
            photo_measured_url: null,
            photo_is_cutout: null,
            corner_a_measured_url: null,
            corner_a_cutout: null,
            corner_b_measured_url: null,
            corner_b_cutout: null,
          }),
    }));
  };
}

beforeEach(() => {
  sqlMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {}).mockClear();
});

describe("getHallOfFame con la migración 031 aplicada", () => {
  it("una sola consulta, y mapea vídeo, encuadre y medidas", async () => {
    sqlMock.mockImplementation(database({ bio: true, salon: true, cutout: true }) as never);
    const data = await getHallOfFame();
    expect(sqlMock).toHaveBeenCalledTimes(1);

    const fight = data.fight[0];
    expect(fight.videoId).toBe("E2fUq7gT8z4");
    expect(fight.videoStart).toBe(6646);
    expect(fight.videoEnd).toBeNull();
    expect(fight.cornerAMeasuredUrl).toBe("https://ufc.com/hughes.png");
    expect(fight.cornerACutout).toBe(true);
    expect(fight.sortOrder).toBe(1);

    const frye = data.pioneer[0];
    expect(frye.photoFocus).toBe("50% 28%");
    expect(frye.photoIsCutout).toBe(false);
    expect(frye.photoMeasuredUrl).toBe(frye.photoUrl);
    expect(frye.bio).toBe("La revancha.");
  });

  it("la consulta cruza photo_cutout por la URL exacta y ordena de la clase más nueva a la más vieja", () => {
    const query = hallOfFameQuery(SCHEMA_LADDER[0]);
    expect(query).toContain("LEFT JOIN photo_cutout pc  ON pc.url  = COALESCE(h.photo_url, f.headshot_url)");
    expect(query).toContain("LEFT JOIN photo_cutout pca ON pca.url = fa.headshot_url");
    expect(query).toContain("LEFT JOIN photo_cutout pcb ON pcb.url = fb.headshot_url");
    expect(query).toContain("ORDER BY h.wing, h.inductee_year DESC NULLS LAST, h.sort_order");
    expect(query).not.toMatch(/replace\(|lower\(/i);
  });
});

describe("getHallOfFame SIN la migración 031 (la reserva)", () => {
  it("sin columnas ni tabla: baja dos escalones, conserva la bio, sin vídeo ni medidas", async () => {
    sqlMock.mockImplementation(database({ bio: true, salon: false, cutout: false }) as never);
    const data = await getHallOfFame();
    expect(sqlMock).toHaveBeenCalledTimes(3);
    const fight = data.fight[0];
    expect(fight.bio).toBe("La revancha.");
    expect(fight.videoId).toBeNull();
    expect(fight.cornerACutout).toBeNull();
    expect(data.pioneer[0].photoFocus).toBeNull();
  });

  it("columnas sí, pero photo_cutout sin GRANT: conserva el vídeo, sin medidas", async () => {
    sqlMock.mockImplementation((async (query: string) => {
      if (query.includes("photo_cutout")) throw pgError("42501", "permission denied for table photo_cutout");
      return database({ bio: true, salon: true, cutout: false })(query);
    }) as never);
    const data = await getHallOfFame();
    expect(sqlMock).toHaveBeenCalledTimes(2);
    expect(data.fight[0].videoId).toBe("E2fUq7gT8z4");
    expect(data.fight[0].cornerACutout).toBeNull();
    // Y deja rastro: un GRANT olvidado no puede pasar en silencio un día entero.
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(console.warn).mock.calls[0][0])).toContain("42501");
  });

  it("ni siquiera la 014: el último escalón, sin bio, y el Salón sigue entero", async () => {
    sqlMock.mockImplementation(database({ bio: false, salon: false, cutout: false }) as never);
    const data = await getHallOfFame();
    expect(sqlMock).toHaveBeenCalledTimes(4);
    expect(data.fight).toHaveLength(1);
    expect(data.pioneer).toHaveLength(1);
    expect(data.fight[0].bio).toBeNull();
  });

  it("un fallo que NO es de esquema (Neon caído) no baja escalones: vacío y sin cachear", async () => {
    sqlMock.mockRejectedValue(Object.assign(new Error("Connection terminated"), { code: "57P01" }));
    const data = await getHallOfFame();
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ modern: [], pioneer: [], contributor: [], fight: [] });
  });
});

describe("isSchemaError", () => {
  it("solo columna, tabla o permiso", () => {
    expect(isSchemaError(pgError("42703", "x"))).toBe(true);
    expect(isSchemaError(pgError("42P01", "x"))).toBe(true);
    expect(isSchemaError(pgError("42501", "x"))).toBe(true);
    expect(isSchemaError(pgError("57014", "statement timeout"))).toBe(false);
    expect(isSchemaError(new Error("sin código"))).toBe(false);
    expect(isSchemaError(null)).toBe(false);
  });
});
