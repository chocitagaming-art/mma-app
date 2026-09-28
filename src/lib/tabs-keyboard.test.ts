import { describe, expect, it } from "vitest";

import { nextTabIndex } from "@/lib/tabs-keyboard";

// Teclado de una lista de pestañas horizontal, según el patrón WAI-ARIA APG
// «Tabs with automatic activation»: las flechas mueven la selección (y dan la
// vuelta), Inicio y Fin saltan a los extremos, y el resto de teclas no se tocan
// para no robarle al navegador el Tab, el Intro o el scroll.

describe("nextTabIndex", () => {
  it("→ avanza y da la vuelta al final", () => {
    expect(nextTabIndex(0, "ArrowRight", 2)).toBe(1);
    expect(nextTabIndex(1, "ArrowRight", 2)).toBe(0);
  });

  it("← retrocede y da la vuelta al principio", () => {
    expect(nextTabIndex(1, "ArrowLeft", 2)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 2)).toBe(1);
  });

  it("Inicio y Fin van a los extremos", () => {
    expect(nextTabIndex(1, "Home", 3)).toBe(0);
    expect(nextTabIndex(0, "End", 3)).toBe(2);
  });

  it("cualquier otra tecla no es asunto suyo: null", () => {
    for (const key of ["Tab", "Enter", " ", "ArrowDown", "ArrowUp", "a"]) {
      expect(nextTabIndex(0, key, 2), key).toBeNull();
    }
  });

  it("sin pestañas no hay a dónde ir", () => {
    expect(nextTabIndex(0, "ArrowRight", 0)).toBeNull();
  });
});
