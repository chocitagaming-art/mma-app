import { describe, expect, it } from "vitest";

import { buildWatchOptions } from "@/lib/watch-options";

describe("buildWatchOptions", () => {
  it("devuelve 1 opción gratis + 3 de pago, todas con enlace https", () => {
    const options = buildWatchOptions({ hasEarlyPrelims: true });
    expect(options).toHaveLength(4);
    expect(options.filter((o) => o.kind === "free")).toHaveLength(1);
    expect(options.filter((o) => o.kind === "paid")).toHaveLength(3);
    for (const option of options) {
      expect(option.url).toMatch(/^https:\/\//);
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.detail.length).toBeGreaterThan(0);
    }
  });

  it("la opción gratis menciona early prelims solo cuando el evento los tiene", () => {
    const withEarly = buildWatchOptions({ hasEarlyPrelims: true });
    const withoutEarly = buildWatchOptions({ hasEarlyPrelims: false });
    expect(withEarly.find((o) => o.kind === "free")?.detail).toMatch(/early prelims/i);
    expect(withoutEarly.find((o) => o.kind === "free")?.detail).not.toMatch(/early prelims/i);
  });

  it("incluye las plataformas oficiales de España", () => {
    const labels = buildWatchOptions({ hasEarlyPrelims: false }).map((o) => o.label);
    expect(labels).toContain("HBO Max");
    expect(labels).toContain("Eurosport 2");
    expect(labels).toContain("UFC Fight Pass");
    expect(labels).toContain("YouTube de UFC");
  });
});
