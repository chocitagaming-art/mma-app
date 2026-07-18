import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ sql: vi.fn() }));

import { sql } from "@/lib/db";
import { getAllGyms, getGymsNearby } from "@/lib/queries/gyms";

const mockSql = vi.mocked(sql);

// Centro: Puerta del Sol, Madrid.
const CENTER: [number, number] = [40.4168, -3.7038];

describe("getGymsNearby", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("mapea filas a Gym (etiquetas + descripción), filtra por radio y ordena por distancia", async () => {
    mockSql.mockResolvedValue([
      // ~1.6 km (Retiro)
      { osm_id: "node/1", name: "Boxeo Retiro", lat: 40.4153, lon: -3.6845, sports: ["boxing", "muay_thai"], address: "Calle X", city: "Madrid", website: null, phone: null },
      // ~65 km → fuera del radio de 15 km
      { osm_id: "node/2", name: "Lejano", lat: 41.0, lon: -3.7, sports: ["judo"], address: null, city: null, website: null, phone: null },
      // 0 km (mismo punto)
      { osm_id: "node/3", name: "MMA Centro", lat: 40.4168, lon: -3.7038, sports: ["mma"], address: null, city: "Madrid", website: "https://x.es", phone: "+34 600" },
    ] as never);

    const gyms = await getGymsNearby(CENTER[0], CENTER[1]);

    // node/2 fuera de radio; el resto ordenado por distancia ascendente.
    expect(gyms.map((g) => g.id)).toEqual(["node/3", "node/1"]);
    expect(gyms[0].sports).toEqual(["MMA"]);
    expect(gyms[0].description).toBe("Gimnasio de MMA en Madrid.");
    expect(gyms[1].sports).toEqual(["Boxeo", "Muay Thai"]);
    expect(gyms[1].description).toBe("Gimnasio de boxeo y muay thai en Madrid.");
    expect(gyms[1].distanceKm).toBeGreaterThan(0);
  });

  it("devuelve vacío si no hay filas", async () => {
    mockSql.mockResolvedValue([] as never);
    expect(await getGymsNearby(CENTER[0], CENTER[1])).toEqual([]);
  });
});

describe("getAllGyms", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });

  it("mapea todas las filas del directorio (etiquetas + descripción + provincia) sin distancia", async () => {
    mockSql.mockResolvedValue([
      { osm_id: "node/1", name: "Boxeo Retiro", lat: 40.4, lon: -3.68, sports: ["boxing", "muay_thai"], address: "Calle X", city: "Madrid", province: "Madrid", website: null, phone: null },
      { osm_id: "node/3", name: "MMA Centro", lat: 40.41, lon: -3.7, sports: ["mma"], address: null, city: "Madrid", province: "Madrid", website: "https://x.es", phone: "+34 600" },
    ] as never);

    const gyms = await getAllGyms();

    expect(gyms).toHaveLength(2);
    expect(gyms[0]).toMatchObject({
      id: "node/1",
      sports: ["Boxeo", "Muay Thai"],
      province: "Madrid",
      description: "Gimnasio de boxeo y muay thai en Madrid.",
    });
    expect(gyms[1]).toMatchObject({
      id: "node/3",
      sports: ["MMA"],
      description: "Gimnasio de MMA en Madrid.",
    });
    // El directorio no expone distancia (no hay centro de búsqueda).
    expect(gyms[0]).not.toHaveProperty("distanceKm");
  });

  it("devuelve vacío si no hay filas", async () => {
    mockSql.mockResolvedValue([] as never);
    expect(await getAllGyms()).toEqual([]);
  });
});
