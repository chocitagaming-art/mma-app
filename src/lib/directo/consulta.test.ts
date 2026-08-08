import { describe, expect, it } from "vitest";

import { decidir, UMBRALES } from "@/lib/directo/consulta";

// POR QUÉ ESTE FICHERO EXISTE: las ramas de `decidir` sólo se ejercitan unas
// horas a la semana, la noche de una velada. Son exactamente las que nadie
// prueba nunca y las que tienen que funcionar cuando importa.
//
// El caso que las motiva está medido: el 8-ago-2026 ESPN empezó a devolver 403
// y el bucle habría corrido 235 minutos escribiendo CERO, con la franja roja de
// la portada encendida todo el rato porque se enciende por reloj. El estado
// "ventana abierta + cero muestras" tiene que gritar, y el gemelo de terminal
// tenía un bug justo ahí: su ventana no tenía fin, así que una velada PASADA
// también gritaba. Los dos casos van abajo.

const base = { ventanaAbierta: false, yaTermino: false, muestras: 0, ritmo: 0, silencioSegundos: null };

describe("decidir · antes de la velada", () => {
  it("no alarma cuando aún no ha empezado", () => {
    expect(decidir(base).nivel).toBe("esperando");
  });

  it("tampoco alarma con la ventana cerrada aunque no haya nada escrito", () => {
    // Es el estado normal durante toda la semana. Si esto gritara, el panel
    // gritaría siempre y dejaría de mirarse.
    expect(decidir({ ...base, muestras: 0, ritmo: 0 }).nivel).toBe("esperando");
  });
});

describe("decidir · con la velada en marcha", () => {
  const enVentana = { ...base, ventanaAbierta: true };

  it("GRITA si no se ha escrito ni una muestra", () => {
    const r = decidir(enVentana);
    expect(r.nivel).toBe("perdiendose");
    expect(r.parte.join(" ")).toContain("ni una muestra");
  });

  it("y avisa de que la franja roja no sirve de prueba", () => {
    // La confusión que costó el susto del 8-ago: mirar la portada y ver rojo.
    expect(decidir(enVentana).parte.join(" ")).toContain("por reloj");
  });

  it("GRITA si hay muestras viejas pero el ritmo es cero", () => {
    // "Grabó un rato y se paró" es un fallo que un contador total NO ve: 200
    // muestras parecen muchas hasta que te fijas en que no crecen.
    const r = decidir({ ...enVentana, muestras: 200, ritmo: 0, silencioSegundos: 400 });
    expect(r.nivel).toBe("perdiendose");
    expect(r.parte.join(" ")).toContain("ritmo es CERO");
  });

  it("se extraña si lleva más de un minuto sin escribir", () => {
    const r = decidir({ ...enVentana, muestras: 120, ritmo: 3, silencioSegundos: 90 });
    expect(r.nivel).toBe("atencion");
  });

  it("da por muerto el corazón pasados 3 minutos", () => {
    const r = decidir({ ...enVentana, muestras: 120, ritmo: 1, silencioSegundos: 400 });
    expect(r.nivel).toBe("perdiendose");
  });

  it("dice que todo va bien cuando el ritmo es sano", () => {
    const r = decidir({ ...enVentana, muestras: 120, ritmo: 15, silencioSegundos: 12 });
    expect(r.nivel).toBe("grabando");
    expect(r.parte.join(" ")).toContain("nada que hacer");
  });
});

describe("decidir · velada terminada", () => {
  // EL BUG QUE ESTO FIJA, y es real: el gemelo de terminal tenía una ventana con
  // principio y sin fin, así que CUALQUIER velada pasada daba "el corazón se ha
  // parado". El domingo por la mañana habría gritado por el 1062, que salió
  // perfecto. Una alarma que salta siempre enseña a no mirar las alarmas.
  const term = { ...base, yaTermino: true };

  it("una velada buena NO alarma, aunque lleve horas sin escribir", () => {
    const r = decidir({ ...term, muestras: 345, ritmo: 0, silencioSegundos: 1_200_000 });
    expect(r.nivel).toBe("grabando");
    expect(r.parte.join(" ")).toContain("Salió bien");
  });

  it("una velada a medias avisa sin dramatizar", () => {
    expect(decidir({ ...term, muestras: 120 }).nivel).toBe("atencion");
  });

  it("una velada perdida sí se marca como perdida", () => {
    // El 1063 real: 14 muestras.
    const r = decidir({ ...term, muestras: 14 });
    expect(r.nivel).toBe("perdiendose");
    expect(r.parte.join(" ")).toContain("PERDIDA");
  });

  it("los umbrales son los medidos, no otros", () => {
    // Si alguien los toca, que sea a propósito: son el 1062 (345, patrón bueno)
    // y el 1063 (14, perdida).
    expect(UMBRALES.MUESTRAS_EXITO).toBe(250);
    expect(UMBRALES.MUESTRAS_PERDIDA).toBe(50);
  });

  it("justo en el umbral de perdida cuenta como a medias, no como perdida", () => {
    // Off-by-one real: el gemelo de terminal daba "perdida" con exactamente 50
    // porque comparaba con `>` en vez de `>=`.
    expect(decidir({ ...term, muestras: UMBRALES.MUESTRAS_PERDIDA }).nivel).toBe("atencion");
  });

  it("justo en el umbral de éxito cuenta como éxito", () => {
    expect(decidir({ ...term, muestras: UMBRALES.MUESTRAS_EXITO }).nivel).toBe("grabando");
  });
});
