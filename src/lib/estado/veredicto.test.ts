import { describe, expect, it } from "vitest";

import {
  comprobarCatalogo,
  comprobarFrescura,
  comprobarProxima,
  comprobarVelada,
  peorNivel,
  type DatosProxima,
  type DatosVelada,
} from "@/lib/estado/veredicto";

const nivelDe = (cs: ReturnType<typeof comprobarVelada>, titulo: string) =>
  cs.find((c) => c.titulo === titulo)?.nivel;

// La velada del 1-ago-2026 tal y como quedó: 14 combates resueltos a mano horas
// después, sin película y sin estadísticas por asalto. Es el caso que este
// panel existe para no volver a pasar por alto.
const VELADA_1063: DatosVelada = {
  combatesActivos: 14,
  combatesConGanador: 14,
  muestrasPelicula: 14,
  filasPorAsalto: 0,
  pesajes: 28,
  tieneCareo: true,
  horasDesdeElFinal: 2,
};

// El 1062 del 25-jul, que sí se grabó bien: 345 muestras.
const VELADA_1062: DatosVelada = {
  combatesActivos: 13,
  combatesConGanador: 13,
  muestrasPelicula: 345,
  filasPorAsalto: 120,
  pesajes: 26,
  tieneCareo: true,
  horasDesdeElFinal: 30,
};

describe("peorNivel", () => {
  it("manda el peor, no la media", () => {
    expect(peorNivel(["ok", "ok", "mal"])).toBe("mal");
    expect(peorNivel(["ok", "aviso"])).toBe("aviso");
    expect(peorNivel(["ok", "ok"])).toBe("ok");
    expect(peorNivel([])).toBe("ok");
  });
});

describe("comprobarVelada", () => {
  it("LA NOCHE DEL 1063: los resultados están, pero la película no", () => {
    const c = comprobarVelada(VELADA_1063);
    expect(nivelDe(c, "Resultados")).toBe("ok");
    // 14 muestras cuando se esperan ~300 es el dato que grita. Y con la velada
    // recién terminada todavía se puede relanzar el bucle, así que es ROJO:
    // hay algo que hacer AHORA.
    expect(nivelDe(c, "Película del combate")).toBe("mal");
    expect(c.find((x) => x.titulo === "Película del combate")?.detalle).toContain(
      "Aún se puede salvar",
    );
  });

  it("al día siguiente la película perdida baja a aviso: ya no hay nada que hacer", () => {
    // Rojo significa "hay algo que hacer", y es lo que despierta al guardián.
    // Dejar esto en rojo para siempre lo pondría a avisar cada hora de un
    // desastre sin remedio, y una alerta que salta siempre se deja de leer.
    const c = comprobarVelada({ ...VELADA_1063, horasDesdeElFinal: 30 });
    expect(nivelDe(c, "Película del combate")).toBe("aviso");
    expect(c.find((x) => x.titulo === "Película del combate")?.detalle).toContain(
      "no se recupera",
    );
  });

  it("una velada bien grabada sale limpia", () => {
    const c = comprobarVelada(VELADA_1062);
    expect(c.every((x) => x.nivel === "ok")).toBe(true);
  });

  it("con la velada recién terminada, el desglose que falta es un aviso, no un fallo", () => {
    // Lo escribe la consolidación posterior, no ESPN en directo. Si esto fuera
    // rojo, el panel estaría en rojo cada sábado por la noche sin que pasara
    // nada malo — y un panel que cría lobos se deja de mirar.
    expect(nivelDe(comprobarVelada(VELADA_1063), "Estadísticas por asalto")).toBe("aviso");
  });

  it("pero al día siguiente ya no hay excusa", () => {
    const c = comprobarVelada({ ...VELADA_1063, horasDesdeElFinal: 24 });
    expect(nivelDe(c, "Estadísticas por asalto")).toBe("mal");
  });

  it("un combate sin ganador es fallo, y dice cómo arreglarlo", () => {
    const c = comprobarVelada({ ...VELADA_1063, combatesConGanador: 9 });
    const r = c.find((x) => x.titulo === "Resultados");
    expect(r?.nivel).toBe("mal");
    expect(r?.valor).toBe("9/14");
    expect(r?.detalle).toContain("Live results");
  });

  it("cero pesajes es fallo: ese cron termina en verde sin escribir nada", () => {
    expect(nivelDe(comprobarVelada({ ...VELADA_1063, pesajes: 0 }), "Pesajes")).toBe("mal");
  });

  it("pesajes a medias es aviso", () => {
    expect(nivelDe(comprobarVelada({ ...VELADA_1063, pesajes: 20 }), "Pesajes")).toBe(
      "aviso",
    );
  });

  it("una película a medias no es lo mismo que ninguna", () => {
    // El bucle arrancó tarde o murió a mitad: malo, pero no la pérdida total.
    expect(
      nivelDe(comprobarVelada({ ...VELADA_1063, muestrasPelicula: 120 }), "Película del combate"),
    ).toBe("aviso");
  });

  it("sin careo se avisa, sin alarmar", () => {
    expect(nivelDe(comprobarVelada({ ...VELADA_1063, tieneCareo: false }), "Vídeo del careo")).toBe(
      "aviso",
    );
  });
});

describe("comprobarProxima", () => {
  // El 1087 del 8-ago tal y como está hoy: sin hora de prelims, como los otros
  // seis eventos futuros.
  const PROXIMA: DatosProxima = {
    combatesActivos: 12,
    tieneHorarioDeLosPrelims: false,
    tieneHoraDeEstelar: true,
    sinFoto: 0,
    luchadores: 24,
    diasQueFaltan: 7,
  };

  it("sin hora de prelims NO es un fallo: es lo normal y se deduce", () => {
    const c = comprobarProxima(PROXIMA);
    expect(c.find((x) => x.titulo === "Hora de los preliminares")?.nivel).toBe("aviso");
  });

  it("sin hora de estelar SÍ es un fallo: el centinela no sabe cuándo despertar", () => {
    const c = comprobarProxima({ ...PROXIMA, tieneHoraDeEstelar: false });
    const h = c.find((x) => x.titulo === "Hora del estelar");
    expect(h?.nivel).toBe("mal");
    expect(h?.detalle).toContain("centinela");
  });

  it("a una semana vista, las fotos que faltan son un aviso", () => {
    const c = comprobarProxima({ ...PROXIMA, sinFoto: 3 });
    expect(c.find((x) => x.titulo === "Fotos de los que pelean")?.nivel).toBe("aviso");
  });

  it("a dos días ya es un fallo: no da tiempo a que los crons lo arreglen", () => {
    const c = comprobarProxima({ ...PROXIMA, sinFoto: 3, diasQueFaltan: 2 });
    expect(c.find((x) => x.titulo === "Fotos de los que pelean")?.nivel).toBe("mal");
  });

  it("una cartelera vacía a dos días es un fallo", () => {
    const c = comprobarProxima({ ...PROXIMA, combatesActivos: 0, diasQueFaltan: 2 });
    expect(c.find((x) => x.titulo === "Cartelera")?.nivel).toBe("mal");
  });

  it("pero a diez días una cartelera vacía solo es un aviso", () => {
    const c = comprobarProxima({ ...PROXIMA, combatesActivos: 0, diasQueFaltan: 10 });
    expect(c.find((x) => x.titulo === "Cartelera")?.nivel).toBe("aviso");
  });
});

describe("comprobarFrescura", () => {
  it("con dato reciente, todo en verde", () => {
    const c = comprobarFrescura({
      horasDesdeNoticia: 3,
      horasDesdeLuchador: 1,
      horasDesdeCombate: 2,
    });
    expect(c.every((x) => x.nivel === "ok")).toBe(true);
  });

  it("caza lo que lleva DÍAS parado, no lo que hoy llegó tarde", () => {
    // El scheduler de GitHub sirve los crons con 1h45-2h55 de retraso medido.
    // Apretar los umbrales solo daría falsas alarmas, y un panel que cría lobos
    // se deja de mirar.
    const tarde = comprobarFrescura({
      horasDesdeNoticia: 5,
      horasDesdeLuchador: 5,
      horasDesdeCombate: 5,
    });
    expect(tarde.every((x) => x.nivel === "ok")).toBe(true);

    const parado = comprobarFrescura({
      horasDesdeNoticia: 100,
      horasDesdeLuchador: 200,
      horasDesdeCombate: 300,
    });
    expect(parado.every((x) => x.nivel === "mal")).toBe(true);
  });

  it("escribe el tiempo como lo diría una persona", () => {
    const c = comprobarFrescura({
      horasDesdeNoticia: 0.5,
      horasDesdeLuchador: 30,
      horasDesdeCombate: 96,
    });
    expect(c[0].valor).toBe("hace minutos");
    expect(c[1].valor).toBe("hace 30 h");
    expect(c[2].valor).toBe("hace 4 días");
  });
});

describe("comprobarCatalogo", () => {
  const BASE = {
    luchadores: 2852,
    sinFotoCuerpo: 938,
    sinFotoCabeza: 576,
    sinNingunaFotoYCompiten: 0,
    diasHastaElPrimeroSinFoto: null,
    eventosPasadosIncompletos: 0,
  };

  it("los huecos de catálogo de hoy no son una alarma", () => {
    // 938 sin cuerpo (33 %) y 576 sin cara (20 %) es el estado real del 1-ago.
    // Hay luchadores antiguos sin foto en NINGUNA fuente: exigir el 100 % sería
    // dejar el panel en rojo para siempre y que nadie volviera a mirarlo.
    expect(comprobarCatalogo(BASE).every((x) => x.nivel === "ok")).toBe(true);
  });

  it("un luchador sin ninguna foto que pelea YA es rojo", () => {
    // Ningún cron lo va a arreglar si las fuentes no tienen ficha suya: hay que
    // meter la foto a mano, y para eso primero hay que enterarse.
    const c = comprobarCatalogo({
      ...BASE,
      sinNingunaFotoYCompiten: 1,
      diasHastaElPrimeroSinFoto: 4,
    });
    const x = c.find((y) => y.titulo.includes("NINGUNA foto"));
    expect(x?.nivel).toBe("mal");
    expect(x?.detalle).toContain("add_manual_fighter");
    expect(x?.detalle).toContain("4 días");
  });

  it("pero si pelea dentro de un mes, solo se avisa", () => {
    // El caso real del 1-ago: Ce Liu (29-ago) y Salahdine Parnasse (5-sep).
    // Poner esto en rojo tendría al guardián avisando cada hora durante un mes
    // entero, y entonces el aviso que sí importa pasaría desapercibido.
    const c = comprobarCatalogo({
      ...BASE,
      sinNingunaFotoYCompiten: 2,
      diasHastaElPrimeroSinFoto: 27,
    });
    expect(c.find((y) => y.titulo.includes("NINGUNA foto"))?.nivel).toBe("aviso");
  });

  it("si las fotos se degradaran mucho, avisa", () => {
    const c = comprobarCatalogo({ ...BASE, sinFotoCuerpo: 2000 });
    expect(c[0].nivel).toBe("aviso");
  });
});
