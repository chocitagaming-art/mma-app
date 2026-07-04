import { describe, expect, it } from "vitest";

import { pickBodyPhotoUrl } from "@/lib/fighter-photo";

const STANDING = "https://cdn.example.com/standing.png";
const FULL = "https://cdn.example.com/full-body.png";

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
