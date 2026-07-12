import { describe, expect, it } from "vitest";

import { pickBodyPhotoUrl, pickCornerBodyPhoto } from "@/lib/fighter-photo";

const STANDING = "https://cdn.example.com/standing.png";
const FULL = "https://cdn.example.com/full-body.png";

// URLs estilo ufc.com con el token de esquina real (_L_ = roja/mira derecha,
// _R_ = azul/mira izquierda).
const STANDING_L =
  "https://www.ufc.com/images/styles/event_fight_card_upper_body_of_standing_athlete/s3/2026-04/MALOTT_MIKE_L_04-18.png";
const STANDING_R =
  "https://www.ufc.com/images/styles/event_fight_card_upper_body_of_standing_athlete/s3/2026-04/USMAN_KAMARU_R_04-18.png";
const FULL_L =
  "https://www.ufc.com/images/styles/athlete_bio_full_body/s3/2025-05/FINNEY_TORREZ_L_01-31.png";

describe("pickBodyPhotoUrl", () => {
  describe("standing-first (combates y /enfrentamiento)", () => {
    it("prefers the standing photo when available", () => {
      expect(pickBodyPhotoUrl("standing-first", STANDING, FULL)).toBe(STANDING);
    });

    it("falls back to the full-body photo when standing is NULL", () => {
      expect(pickBodyPhotoUrl("standing-first", null, FULL)).toBe(FULL);
    });

    it("returns null when both are missing (component falls back to headshot)", () => {
      expect(pickBodyPhotoUrl("standing-first", null, null)).toBeNull();
      expect(pickBodyPhotoUrl("standing-first", undefined, undefined)).toBeNull();
    });
  });

  describe("full-first (ficha del luchador: la foto aprobada no cambia)", () => {
    it("keeps the full-body photo even when a standing photo exists", () => {
      expect(pickBodyPhotoUrl("full-first", STANDING, FULL)).toBe(FULL);
    });

    it("uses the standing photo only as a backup", () => {
      expect(pickBodyPhotoUrl("full-first", STANDING, null)).toBe(STANDING);
    });

    it("returns null when both are missing", () => {
      expect(pickBodyPhotoUrl("full-first", undefined, null)).toBeNull();
    });
  });
});

describe("pickCornerBodyPhoto (F1: espejo definitivo del cara a cara)", () => {
  it("red usa la variante _l sin espejar (facing y logo correctos)", () => {
    expect(
      pickCornerBodyPhoto("red", { standingL: STANDING_L, standingR: STANDING_R }),
    ).toEqual({ url: STANDING_L, mirror: false });
  });

  it("blue usa la variante _r sin espejar", () => {
    expect(
      pickCornerBodyPhoto("blue", { standingL: STANDING_L, standingR: STANDING_R }),
    ).toEqual({ url: STANDING_R, mirror: false });
  });

  it("red sin _l usa _r ESPEJADA (facing correcto, logo invertido)", () => {
    expect(pickCornerBodyPhoto("red", { standingR: STANDING_R })).toEqual({
      url: STANDING_R,
      mirror: true,
    });
  });

  it("blue sin _r usa _l ESPEJADA", () => {
    expect(pickCornerBodyPhoto("blue", { standingL: STANDING_L })).toEqual({
      url: STANDING_L,
      mirror: true,
    });
  });

  it("cae a la columna legada standing y la espeja si su token mira al lado malo", () => {
    // legacy con token _R_ en la esquina roja (quiere _L_) -> espejar.
    expect(pickCornerBodyPhoto("red", { standing: STANDING_R })).toEqual({
      url: STANDING_R,
      mirror: true,
    });
    // legacy con token _L_ en la esquina roja -> sin espejar.
    expect(pickCornerBodyPhoto("red", { standing: STANDING_L })).toEqual({
      url: STANDING_L,
      mirror: false,
    });
  });

  it("legacy sin token reconocible no se espeja", () => {
    expect(pickCornerBodyPhoto("blue", { standing: STANDING })).toEqual({
      url: STANDING,
      mirror: false,
    });
  });

  it("cae al full body y lo trata por token (fallback de máxima info)", () => {
    // full body _L_ en esquina azul (quiere _R_) -> espejar.
    expect(pickCornerBodyPhoto("blue", { fullBody: FULL_L })).toEqual({
      url: FULL_L,
      mirror: true,
    });
    // full body _L_ en esquina roja -> sin espejar.
    expect(pickCornerBodyPhoto("red", { fullBody: FULL_L })).toEqual({
      url: FULL_L,
      mirror: false,
    });
  });

  it("prioriza standing exacto sobre opuesto, legado y full", () => {
    expect(
      pickCornerBodyPhoto("red", {
        standingL: STANDING_L,
        standingR: STANDING_R,
        standing: STANDING,
        fullBody: FULL_L,
      }),
    ).toEqual({ url: STANDING_L, mirror: false });
  });

  it("devuelve url null sin ninguna foto", () => {
    expect(pickCornerBodyPhoto("red", {})).toEqual({ url: null, mirror: false });
  });
});
