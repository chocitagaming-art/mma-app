import { describe, expect, it } from "vitest";

import {
  OVERPASS_SPORT_REGEX,
  buildGym,
  composeAddress,
  formatDistance,
  haversineKm,
  isExcludedGym,
  normalizeWebsite,
  parseSportTokens,
  sportLabels,
} from "@/lib/gyms";

describe("parseSportTokens", () => {
  it("separa por ; y normaliza espacios y mayúsculas", () => {
    expect(parseSportTokens("Boxing; muay_thai ;MMA")).toEqual(["boxing", "muay_thai", "mma"]);
  });

  it("devuelve vacío sin tag", () => {
    expect(parseSportTokens(undefined)).toEqual([]);
  });
});

describe("isExcludedGym", () => {
  it("descarta si sport contiene el token fitness", () => {
    expect(isExcludedGym("Club de Boxeo Norte", "fitness;boxing")).toBe(true);
  });

  it("no descarta kickboxing aunque contenga 'boxing' como substring", () => {
    expect(isExcludedGym("Kickboxing Vallecas", "kickboxing")).toBe(false);
  });

  it("descarta cadenas fitness conocidas por nombre", () => {
    expect(isExcludedGym("Basic-Fit Madrid Centro", "boxing")).toBe(true);
    expect(isExcludedGym("McFIT Barcelona", "martial_arts")).toBe(true);
    expect(isExcludedGym("Anytime Fitness Getafe", "boxing")).toBe(true);
    expect(isExcludedGym("VivaGym Sevilla", "boxing")).toBe(true);
    expect(isExcludedGym("Brooklyn Fitboxing Chamberí", "boxing")).toBe(true);
  });

  it("mantiene gimnasios de lucha normales", () => {
    expect(isExcludedGym("Climent Club", "boxing;muay_thai")).toBe(false);
  });
});

describe("sportLabels", () => {
  it("traduce tokens conocidos y omite desconocidos", () => {
    expect(sportLabels("boxing;muay_thai;yoga")).toEqual(["Boxeo", "Muay Thai"]);
  });

  it("deduplica etiquetas", () => {
    expect(sportLabels("boxing;boxing")).toEqual(["Boxeo"]);
  });
});

describe("composeAddress", () => {
  it("compone calle, número, CP y ciudad", () => {
    expect(
      composeAddress({
        "addr:street": "Calle Mayor",
        "addr:housenumber": "5",
        "addr:postcode": "28013",
        "addr:city": "Madrid",
      }),
    ).toBe("Calle Mayor, 5, 28013 Madrid");
  });

  it("funciona con datos parciales", () => {
    expect(composeAddress({ "addr:street": "Calle Mayor" })).toBe("Calle Mayor");
    expect(composeAddress({ "addr:city": "Madrid" })).toBe("Madrid");
  });

  it("devuelve null sin tags addr (no inventa direcciones)", () => {
    expect(composeAddress({ name: "Gimnasio X" })).toBeNull();
  });
});

describe("normalizeWebsite", () => {
  it("añade https:// cuando falta el protocolo", () => {
    expect(normalizeWebsite("www.gym.es")).toBe("https://www.gym.es");
  });

  it("respeta el protocolo existente", () => {
    expect(normalizeWebsite("http://gym.es")).toBe("http://gym.es");
  });

  it("devuelve null para vacío", () => {
    expect(normalizeWebsite(undefined)).toBeNull();
    expect(normalizeWebsite("  ")).toBeNull();
  });
});

describe("haversineKm / formatDistance", () => {
  it("Madrid Sol → Retiro ≈ 1.6 km", () => {
    const km = haversineKm(40.4168, -3.7038, 40.4153, -3.6845);
    expect(km).toBeGreaterThan(1.4);
    expect(km).toBeLessThan(1.9);
  });

  it("formatea metros por debajo de 1 km", () => {
    expect(formatDistance(0.35)).toBe("a 350 m");
  });

  it("formatea km con coma decimal es-ES", () => {
    expect(formatDistance(2.34)).toBe("a 2,3 km");
  });
});

describe("OVERPASS_SPORT_REGEX", () => {
  const re = new RegExp(OVERPASS_SPORT_REGEX);

  it("matchea tokens anclados en listas ;", () => {
    expect(re.test("boxing")).toBe(true);
    expect(re.test("fitness;boxing")).toBe(true);
    expect(re.test("judo; karate")).toBe(true);
  });

  it("no matchea substrings dentro de otros tokens", () => {
    expect(re.test("shadowboxing_club")).toBe(false);
    expect(re.test("judoteca")).toBe(false);
  });
});

describe("buildGym", () => {
  const center: [number, number] = [40.4168, -3.7038];

  it("construye la tarjeta completa desde un elemento Overpass", () => {
    const gym = buildGym(
      {
        type: "node",
        id: 123,
        lat: 40.42,
        lon: -3.7,
        tags: {
          name: "Club de Lucha",
          sport: "boxing;muay_thai",
          "addr:street": "Calle Mayor",
          "addr:housenumber": "5",
          "addr:city": "Madrid",
          website: "www.clublucha.es",
          phone: "+34 600 000 000",
        },
      },
      center,
    );
    expect(gym).not.toBeNull();
    expect(gym?.id).toBe("node/123");
    expect(gym?.sports).toEqual(["Boxeo", "Muay Thai"]);
    expect(gym?.address).toBe("Calle Mayor, 5, Madrid");
    expect(gym?.website).toBe("https://www.clublucha.es");
    expect(gym?.phone).toBe("+34 600 000 000");
    expect(gym?.distanceKm).toBeGreaterThan(0);
  });

  it("usa center para ways/relations sin lat/lon directos", () => {
    const gym = buildGym(
      { type: "way", id: 9, center: { lat: 40.41, lon: -3.71 }, tags: { name: "Dojo", sport: "judo" } },
      center,
    );
    expect(gym?.id).toBe("way/9");
    expect(gym?.sports).toEqual(["Judo"]);
    expect(gym?.address).toBeNull();
    expect(gym?.website).toBeNull();
    expect(gym?.phone).toBeNull();
  });

  it("descarta elementos sin nombre o excluidos", () => {
    expect(buildGym({ type: "node", id: 1, lat: 40.4, lon: -3.7, tags: { sport: "boxing" } }, center)).toBeNull();
    expect(
      buildGym(
        { type: "node", id: 2, lat: 40.4, lon: -3.7, tags: { name: "Basic-Fit Sol", sport: "boxing" } },
        center,
      ),
    ).toBeNull();
  });
});
