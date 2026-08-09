import { describe, expect, it } from "vitest";

import {
  comprobarCatalogo,
  comprobarFrescura,
  comprobarPrediccion,
  comprobarProxima,
  comprobarVelada,
  contarSinFotoVisible,
  descontarFotosLocales,
  peorNivel,
  type DatosProxima,
  type DatosVelada,
  type FilaDeCartelera,
  type FilaSinFotoEnLaBase,
} from "@/lib/estado/veredicto";

const nivelDe = (cs: ReturnType<typeof comprobarVelada>, titulo: string) =>
  cs.find((c) => c.titulo === titulo)?.nivel;

// La velada del 1-ago-2026 tal y como quedó: 14 combates resueltos a mano horas
// después, sin película y sin estadísticas por asalto. Es el caso que este
// panel existe para no volver a pasar por alto.
const VELADA_1063: DatosVelada = {
  combatesActivos: 14,
  combatesResueltos: 14,
  muestrasPelicula: 14,
  filasPorAsalto: 0,
  pesajes: 28,
  tieneCareo: true,
  horasDesdeElFinal: 2,
};

// El 1062 del 25-jul, que sí se grabó bien: 345 muestras.
const VELADA_1062: DatosVelada = {
  combatesActivos: 13,
  combatesResueltos: 13,
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

  it("pasadas unas horas la película perdida baja a aviso: ya no hay nada que hacer", () => {
    // Rojo significa "hay algo que hacer", y es lo que despierta al guardián.
    // Dejar esto en rojo para siempre lo pondría a avisar cada hora de un
    // desastre sin remedio, y una alerta que salta siempre se deja de leer.
    // A las 6 h del comienzo del estelar la velada lleva rato acabada y ESPN ya
    // no emite: relanzar el bucle no recuperaria ni una muestra.
    const c = comprobarVelada({ ...VELADA_1063, horasDesdeElFinal: 6 });
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

  it("un combate sin resolver es fallo, y dice cómo arreglarlo", () => {
    const c = comprobarVelada({ ...VELADA_1063, combatesResueltos: 9 });
    const r = c.find((x) => x.titulo === "Resultados");
    expect(r?.nivel).toBe("mal");
    expect(r?.valor).toBe("9/14");
    expect(r?.detalle).toContain("Live results");
  });

  // "Resuelto" NO es "con ganador". Un empate y un no contest no tienen ganador
  // y no se lo va a dar nadie nunca, así que contarlos como pendientes dejaba la
  // velada incompleta PARA SIEMPRE — y como ULTIMA_VELADA_SQL no tiene ventana,
  // el guardián mandaba un correo rojo cada hora durante toda la semana
  // recomendando relanzar la ingesta, que no puede traer un ganador que no
  // existe. El dato lo calcula resueltoSqlPredicate() (fight-result.ts).
  it("una velada con un empate o un no contest queda COMPLETA", () => {
    const c = comprobarVelada({
      ...VELADA_1063,
      combatesActivos: 14,
      combatesResueltos: 14,
    });
    expect(nivelDe(c, "Resultados")).toBe("ok");
    expect(c.find((x) => x.titulo === "Resultados")?.detalle).toBeUndefined();
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
    sinFicha: 0,
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

  it("un luchador sin ninguna foto que pelea pasado mañana es rojo", () => {
    // Aquí ya no da tiempo a que llegue sola: hay que meterla a mano, y para
    // eso primero hay que enterarse.
    const c = comprobarCatalogo({
      ...BASE,
      sinNingunaFotoYCompiten: 1,
      diasHastaElPrimeroSinFoto: 2,
    });
    const x = c.find((y) => y.titulo.includes("NINGUNA foto"));
    expect(x?.nivel).toBe("mal");
    expect(x?.detalle).toContain("add_manual_fighter");
    expect(x?.detalle).toContain("2 días");
  });

  it("pero si pelea dentro de un mes, solo se avisa", () => {
    // El caso real del 1-ago: Ce Liu (29-ago) y Salahdine Parnasse (5-sep).
    const c = comprobarCatalogo({
      ...BASE,
      sinNingunaFotoYCompiten: 2,
      diasHastaElPrimeroSinFoto: 27,
    });
    expect(c.find((y) => y.titulo.includes("NINGUNA foto"))?.nivel).toBe("aviso");
  });

  it("🪤 a seis días de la velada NO es rojo: es lo normal y se arregla solo", () => {
    // El caso REAL del 2-ago-2026, y la razón de bajar el umbral de 10 a 3.
    // Ese día entraron a la cartelera del 1087 tres luchadores nuevos (Jessie
    // Rosas, Richie Miranda y el rival de Sutherland) y, como todo debutante,
    // entraron sin foto. Con el umbral en 10 el panel se puso en ROJO a seis
    // días vista y el guardián habría mandado un correo cada hora hasta el
    // sábado por algo que se resuelve solo.
    //
    // Medido contra la base ese mismo día: las OCHO veladas de los últimos 90
    // días llegaron con CERO luchadores sin ninguna foto, y los debutantes de
    // las últimas ocho semanas acabaron todos con las dos (8/8, 5/5, 4/4, 2/2,
    // 4/4). Si este test se pone en rojo, alguien ha vuelto a subir el umbral
    // sin volver a medir.
    const c = comprobarCatalogo({
      ...BASE,
      sinNingunaFotoYCompiten: 3,
      diasHastaElPrimeroSinFoto: 6,
    });
    expect(c.find((y) => y.titulo.includes("NINGUNA foto"))?.nivel).toBe("aviso");
  });

  it("el día de la velada, si aún falta una foto, es rojo", () => {
    const c = comprobarCatalogo({
      ...BASE,
      sinNingunaFotoYCompiten: 1,
      diasHastaElPrimeroSinFoto: 0,
    });
    expect(c.find((y) => y.titulo.includes("NINGUNA foto"))?.nivel).toBe("mal");
  });

  it("si las fotos se degradaran mucho, avisa", () => {
    const c = comprobarCatalogo({ ...BASE, sinFotoCuerpo: 2000 });
    expect(c[0].nivel).toBe("aviso");
  });
});

// ── La alarma que no se puede apagar (6-ago) ────────────────────────────────
//
// `sin_ninguna_foto_y_compiten` pregunta a la BASE, pero el flujo oficial para
// resolverlo NO escribe en la base: `add_manual_fighter --photo-only` copia la
// foto a `public/fighters/` y la mapea en `local-headshots.ts`, que es el
// fallback que usa la web cuando la BD no tiene `headshot_url`. Su docstring lo
// dice: «Tapology blocks hotlinking too, so you download the headshot in your
// browser».
//
// Consecuencia medida el 6-ago: el commit `04d7c01` metió las seis fotos que
// faltaban, la web las sirve (comprobado en el HTML de producción del evento
// 1087), y aun así el guardián siguió en ROJO y abrió el Issue #24 — porque
// mide la base, no lo que ve el visitante. Seis fallos seguidos desde la 01:00Z.
//
// Eso es exactamente lo que el comentario de `DIAS_PARA_URGIR_FOTOS` dice que
// NO puede pasar: una alarma que no se puede apagar entrena a no mirar los
// correos, y entonces tampoco se lee la que importa.
//
// `tieneFotoLocal` se INYECTA en vez de importar `localHeadshot` de verdad: si
// el test leyera la lista real, añadir una foto rompería estos casos y habría
// que reescribirlos cada vez. Aquí se prueba la regla, no el contenido.
describe("descontar las fotos que ya están puestas a mano", () => {
  const ahora = new Date("2026-08-06T17:00:00Z");
  const conFotoLocal = new Set(["gigi canuto", "jessie rosas"]);
  const tieneFotoLocal = (n: string) => conFotoLocal.has(n.trim().toLowerCase());

  const fila = (nombre: string, arranqueUtc: string): FilaSinFotoEnLaBase => ({
    nombre,
    arranqueUtc,
  });

  it("sin filas, no hay nada que contar", () => {
    expect(descontarFotosLocales([], tieneFotoLocal, ahora)).toEqual({
      sinNingunaFotoYCompiten: 0,
      diasHastaElPrimeroSinFoto: null,
    });
  });

  it("🔴 el caso del 6-ago: todos tienen su foto a mano, así que el panel calla", () => {
    const r = descontarFotosLocales(
      [
        fila("Gigi Canuto", "2026-08-09T00:00:00Z"),
        fila("Jessie Rosas", "2026-08-09T00:00:00Z"),
      ],
      tieneFotoLocal,
      ahora,
    );
    expect(r.sinNingunaFotoYCompiten).toBe(0);
    expect(r.diasHastaElPrimeroSinFoto).toBeNull();
  });

  it("el que NO tiene foto en ningún sitio sigue contando", () => {
    const r = descontarFotosLocales(
      [fila("Alguien Sin Foto", "2026-08-09T00:00:00Z")],
      tieneFotoLocal,
      ahora,
    );
    expect(r.sinNingunaFotoYCompiten).toBe(1);
    expect(r.diasHastaElPrimeroSinFoto).toBeCloseTo(2.29, 1);
  });

  it("🪤 la fecha se recalcula sobre los que QUEDAN, no sobre los descontados", () => {
    // El fallo sutil: descontar solo la CUENTA y dejar el `min()` del SQL diría
    // «1 luchador, y el primero pelea en 2 días» cuando ese de 2 días ya tiene
    // su foto puesta. La urgencia sería falsa y el rojo, otra vez inapagable.
    const r = descontarFotosLocales(
      [
        fila("Gigi Canuto", "2026-08-09T00:00:00Z"), // en 2 días, YA tiene foto
        fila("Alguien Sin Foto", "2026-09-05T19:00:00Z"), // en 30, este es el real
      ],
      tieneFotoLocal,
      ahora,
    );
    expect(r.sinNingunaFotoYCompiten).toBe(1);
    expect(r.diasHastaElPrimeroSinFoto).toBeGreaterThan(29);
  });

  it("el nombre se normaliza igual que en local-headshots (trim + minúsculas)", () => {
    // `localHeadshot` keyea por `name.trim().toLowerCase()`. Si aquí se
    // comparara en crudo, un nombre con espacio o mayúscula distinta pasaría por
    // «sin foto» teniéndola, y el rojo volvería por la puerta de atrás.
    const r = descontarFotosLocales(
      [fila("  GIGI CANUTO  ", "2026-08-09T00:00:00Z")],
      tieneFotoLocal,
      ahora,
    );
    expect(r.sinNingunaFotoYCompiten).toBe(0);
  });

  it("un luchador en dos carteleras se cuenta una sola vez, por la más próxima", () => {
    // La consulta une `fights`, así que quien tenga dos combates anunciados
    // aparece dos veces. Contar filas en vez de personas inflaría la alarma.
    const r = descontarFotosLocales(
      [
        fila("Alguien Sin Foto", "2026-09-05T19:00:00Z"),
        fila("Alguien Sin Foto", "2026-08-09T00:00:00Z"),
      ],
      tieneFotoLocal,
      ahora,
    );
    expect(r.sinNingunaFotoYCompiten).toBe(1);
    expect(r.diasHastaElPrimeroSinFoto).toBeCloseTo(2.29, 1);
  });

  it("una fecha ilegible no revienta el panel ni inventa urgencia", () => {
    const r = descontarFotosLocales(
      [fila("Alguien Sin Foto", "no-es-una-fecha")],
      tieneFotoLocal,
      ahora,
    );
    expect(r.sinNingunaFotoYCompiten).toBe(1);
    expect(r.diasHastaElPrimeroSinFoto).toBeNull();
  });
});

// ── «Fotos de los que pelean» medía la columna equivocada (6-ago) ───────────
//
// La comprobación contaba `full_body_url is null` y decía «N sin foto de cuerpo
// entero». Pero la web NO enseña un hueco cuando falta esa columna: degrada.
// `fighter-full-body.tsx` lo dice en su propio comentario — «si la URL elegida es
// NULL o falla la carga, degradamos al headshot (que a su vez cae a su
// silueta/iniciales)» — y antes de eso mira `local-bodies.ts`.
//
// La cadena real es:  localBody → full_body → standing → headshot → localHeadshot
//                     → silueta
//
// Medido el 6-ago con un navegador de verdad sobre `/eventos/1087`: el panel
// cantaba «19/24, 5 sin foto» y en pantalla **los 24 salían con foto**, ninguno
// con silueta (Canuto, Rosas, Montanha y Miranda por `/fighters/*.jpg`, y Billy
// Ray Goff por su headshot de ESPN). Otra alarma que no se podía apagar, y esta
// vez se descubrió mirando la página, no leyendo el código.
//
// Lo que hay que contar es: **a cuántos NO puede pintarles la web ninguna foto**.
describe("contar solo a quien la web no puede pintar de ninguna manera", () => {
  const conFotoLocal = new Set(["gigi canuto", "richie miranda"]);
  const tieneFotoLocal = (n: string) => conFotoLocal.has(n.trim().toLowerCase());

  const enCartelera = (
    nombre: string,
    cuerpo: boolean,
    cara: boolean,
  ): FilaDeCartelera => ({ nombre, tieneCuerpo: cuerpo, tieneCara: cara });

  it("una cartelera entera con foto de cuerpo no cuenta a nadie", () => {
    const filas = [
      enCartelera("Mateusz Gamrot", true, true),
      enCartelera("Quillan Salkilld", true, true),
    ];
    expect(contarSinFotoVisible(filas, tieneFotoLocal)).toBe(0);
  });

  it("🔴 el caso real del 1087: sin cuerpo pero CON cara, la web pinta la cara", () => {
    // Billy Ray Goff: `full_body_url` a NULL y headshot de ESPN. En pantalla
    // sale su foto. Contarlo como «sin foto» es cantar un fallo que no existe.
    expect(contarSinFotoVisible([enCartelera("Billy Ray Goff", false, true)], tieneFotoLocal)).toBe(
      0,
    );
  });

  it("sin cuerpo y sin cara, pero con foto puesta a mano, tampoco cuenta", () => {
    // Los cuatro debutantes: la BD los ve a cero, y aun así la web los pinta
    // porque están en `local-headshots.ts`.
    const filas = [
      enCartelera("Gigi Canuto", false, false),
      enCartelera("Richie Miranda", false, false),
    ];
    expect(contarSinFotoVisible(filas, tieneFotoLocal)).toBe(0);
  });

  it("sin nada de nada SÍ cuenta: eso es una silueta de verdad", () => {
    const filas = [
      enCartelera("Fulano Sin Nada", false, false),
      enCartelera("Mengano Sin Nada", false, false),
      enCartelera("Gigi Canuto", false, false),
    ];
    expect(contarSinFotoVisible(filas, tieneFotoLocal)).toBe(2);
  });

  it("el nombre se normaliza igual que en local-headshots", () => {
    expect(
      contarSinFotoVisible([enCartelera("  GIGI CANUTO ", false, false)], tieneFotoLocal),
    ).toBe(0);
  });

  it("una esquina sin nombre no se puede resolver: cuenta", () => {
    // Un hueco de cartelera sin ficha. `sinFicha` ya lo avisa por su lado, pero
    // aquí no se puede afirmar que tenga foto, así que no se descuenta.
    expect(contarSinFotoVisible([enCartelera("", false, false)], tieneFotoLocal)).toBe(1);
  });

  it("cuenta por persona, no por fila", () => {
    const filas = [
      enCartelera("Fulano Sin Nada", false, false),
      enCartelera("Fulano Sin Nada", false, false),
    ];
    expect(contarSinFotoVisible(filas, tieneFotoLocal)).toBe(1);
  });
});

// ── El punto ciego del panel (2-ago) ────────────────────────────────────────
// El contador de fotos filtraba `fighter_id is not null`, así que un combate al
// que le falta media pareja era INVISIBLE: el 1087 salía como 16/17 cuando la
// cartelera son 18 personas.

describe("comprobarProxima y el luchador sin ficha", () => {
  const PROXIMA_1087: DatosProxima = {
    combatesActivos: 9,
    tieneHorarioDeLosPrelims: true,
    tieneHoraDeEstelar: true,
    sinFoto: 1, // Billy Ray Goff, sin foto de cuerpo entero
    sinFicha: 1, // Jose Montanha da Silva, sin fila en `fighters`
    luchadores: 18, // 9 combates x 2 esquinas, con ficha o sin ella
    diasQueFaltan: 6,
  };

  it("cuenta las 18 esquinas, no las 17 que tienen ficha", () => {
    const c = comprobarProxima(PROXIMA_1087);
    // El numerador descuenta los dos: el que no tiene ficha tampoco tiene foto.
    expect(c.find((x) => x.titulo === "Fotos de los que pelean")?.valor).toBe("16/18");
  });

  it("el que no tiene ficha sale en su PROPIA línea, no escondido en las fotos", () => {
    const c = comprobarProxima(PROXIMA_1087);
    const ficha = c.find((x) => x.titulo === "Luchadores con ficha");
    expect(ficha?.valor).toBe("17/18");
    expect(ficha?.nivel).toBe("aviso");
    // Lo que de verdad importa: su combate no se graba, y en verde.
    expect(ficha?.detalle).toMatch(/no se registrara en directo/i);
  });

  it("a dos días, un luchador sin ficha ya es rojo", () => {
    const c = comprobarProxima({ ...PROXIMA_1087, diasQueFaltan: 2 });
    expect(c.find((x) => x.titulo === "Luchadores con ficha")?.nivel).toBe("mal");
  });

  it("con la cartelera completa, las dos líneas están en verde", () => {
    const c = comprobarProxima({ ...PROXIMA_1087, sinFoto: 0, sinFicha: 0 });
    expect(c.find((x) => x.titulo === "Luchadores con ficha")?.nivel).toBe("ok");
    expect(c.find((x) => x.titulo === "Fotos de los que pelean")?.valor).toBe("18/18");
  });
});

// ── El punto ciego que costó nueve horas (2-ago) ────────────────────────────
// El microservicio de predicción entró en bucle de caída el 1-ago a las 23:12Z
// y el panel salió en verde toda la noche: de sus 22 comprobaciones, ninguna lo
// miraba. El aviso llegó solo por los Issues de GitHub, que es el canal que el
// propio proyecto ya documentó como frágil.
//
// No se sondea Render desde el panel a propósito: el servicio responde en 0,17 s
// caliente pero un arranque en frío tarda ~43 s, así que una sonda con
// presupuesto corto no distingue "dormido" de "muerto" — o miente o cuelga
// /api/estado, que es lo que lee el guardián cada hora. Se mira el DATO: cuándo
// contestó por última vez, que es lo que anota el keep-alive.

describe("comprobarPrediccion", () => {
  it("un latido reciente es lo normal y no dice nada", () => {
    const c = comprobarPrediccion({ horasDesdeElUltimoLatido: 0.5 });
    expect(c[0].nivel).toBe("ok");
    expect(c[0].valor).toBe("hace minutos");
    expect(c[0].detalle).toBeUndefined();
  });

  it("🪤 tres horas y media sin latido NO es alarma: es el planificador de GitHub", () => {
    // Medido el 2-ago sobre 40 ejecuciones reales: el keep-alive pide un ping
    // cada 10 min y GitHub entrega uno cada ~1,79 h, con el PEOR hueco en
    // 3,62 h. Con el umbral por debajo de eso, el panel se pondría en rojo por
    // los retrasos del planificador y no por el servicio.
    expect(comprobarPrediccion({ horasDesdeElUltimoLatido: 3.62 })[0].nivel).toBe("ok");
  });

  it("a las seis horas ya avisa, pero sin gritar", () => {
    const c = comprobarPrediccion({ horasDesdeElUltimoLatido: 7 });
    expect(c[0].nivel).toBe("aviso");
    expect(c[0].detalle).toContain("planificador");
  });

  it("a las doce horas es rojo, y dice qué hacer", () => {
    // El caso real: entre las 23:12Z del 1-ago y que alguien se diera cuenta
    // pasaron nueve horas. Con esto, a las doce el guardián manda el correo.
    const c = comprobarPrediccion({ horasDesdeElUltimoLatido: 12 });
    expect(c[0].nivel).toBe("mal");
    expect(c[0].detalle).toContain("Diagnostico de Render");
  });

  it("si no ha latido nunca, avisa pero no grita", () => {
    // Estrenar una comprobación en rojo enseña a ignorarla: al instalarla, la
    // tabla está vacía hasta que el keep-alive corra por primera vez.
    const c = comprobarPrediccion({ horasDesdeElUltimoLatido: null });
    expect(c[0].nivel).toBe("aviso");
    expect(c[0].valor).toBe("sin noticias todavía");
  });
});
