import { describe, expect, it } from "vitest";

import {
  comprobarCatalogo,
  comprobarFrescura,
  comprobarGuardia,
  comprobarPrediccion,
  comprobarProxima,
  comprobarVelada,
  contarSinFotoVisible,
  descontarFotosLocales,
  muestrasExigidas,
  peorNivel,
  type Comprobacion,
  type DatosGuardia,
  type DatosProxima,
  type DatosVelada,
  type FilaDeCartelera,
  type FilaSinFotoEnLaBase,
} from "@/lib/estado/veredicto";

const nivelDe = (cs: ReturnType<typeof comprobarVelada>, titulo: string) =>
  cs.find((c) => c.titulo === titulo)?.nivel;

const nivelDeProxima = (cs: ReturnType<typeof comprobarProxima>, titulo: string) =>
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

  it("con la velada en marcha, los resultados que faltan son un aviso, no un fallo", () => {
    // La velada del 15-ago mandó TRES correos por esto (02:09, 03:29 y 04:17Z,
    // diciendo «8/12» y «11/12») mientras la cartelera se estaba peleando: la
    // consulta coge el evento con `start_time < now()`, que en directo es el que
    // está EN CURSO, y se exigía la cartelera entera desde el primer minuto. El
    // último de esos correos cayó 93 segundos antes de que se sellara el estelar.
    const c = comprobarVelada({ ...VELADA_1063, combatesResueltos: 9 });
    const r = c.find((x) => x.titulo === "Resultados");
    expect(r?.nivel).toBe("aviso");
    expect(r?.valor).toBe("9/14");
    expect(r?.detalle).toContain("sigue en marcha");
  });

  it("pero pasada la velada, un combate sin resolver sí es fallo y dice cómo arreglarlo", () => {
    const c = comprobarVelada({
      ...VELADA_1063,
      combatesResueltos: 9,
      horasDesdeElFinal: 8,
    });
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
    pesajes: 0, // a siete días no existe todavía, y eso es lo normal
    tieneCareo: false,
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

  // --- Pesaje y careo de la velada QUE VIENE ------------------------------
  //
  // El 15-ago-2026 el panel dijo que todo estaba en orden mientras UFC 330 se
  // publicaba sin careo y sin el pesaje de sus dos combates por el título. No
  // era un fallo de las comprobaciones: es que las dos SOLO existían para la
  // velada ya celebrada, o sea justo cuando ya no se pueden arreglar.
  // 0,4 dias = 9,6 h: dentro de la ventana de 12 h, y despues de las 20:00 UTC
  // del viernes, que es cuando corre el unico cron que llena el pesaje.
  const VISPERA = { ...PROXIMA, diasQueFaltan: 0.4 };

  it("la víspera, un pesaje incompleto es un fallo", () => {
    // El caso real: 20 filas de 24, porque las dos líneas de campeonato del
    // artículo de ufc.com no parseaban.
    const c = comprobarProxima({ ...VISPERA, pesajes: 20 });
    const p = c.find((x) => x.titulo === "Pesajes");
    expect(p?.nivel).toBe("mal");
    expect(p?.valor).toBe("20/24");
  });

  it("la víspera, un pesaje completo está en verde", () => {
    expect(nivelDeProxima(comprobarProxima({ ...VISPERA, pesajes: 24 }), "Pesajes")).toBe("ok");
  });

  it("🪤 el umbral abre DESPUÉS del cron, no antes: a 20 h no se exige nada", () => {
    // El caso que casi manda diez correos seguidos. El cron del pesaje es
    // semanal, viernes 20:00 UTC. Con el umbral de 1 día que tenía esto al
    // principio, una velada del sábado a las 10:00 UTC abría su víspera el
    // viernes a las 10:00 — diez horas ANTES de que el cron tuviera turno — y
    // publicaba «Pesajes 0/18» en rojo acusando a una ejecución que no existía.
    // 0,85 días = 20,4 h.
    const p = comprobarProxima({ ...PROXIMA, diasQueFaltan: 0.85, pesajes: 0 }).find(
      (x) => x.titulo === "Pesajes",
    );
    expect(p?.nivel).toBe("ok");
    expect(p?.valor).toBe("aún no toca");
  });

  it("🪤 una cartelera vacía la víspera NO publica «0/0» en verde", () => {
    // `pesajes >= 0` es siempre cierto: sin esta rama, un evento sin combates
    // cargados aprobaba el pesaje. Un verde falso es justo lo que este panel
    // existe para no dar.
    const c = comprobarProxima({ ...VISPERA, combatesActivos: 0, pesajes: 0 });
    const p = c.find((x) => x.titulo === "Pesajes");
    expect(p?.valor).toBe("sin cartelera");
    // Y la línea que SÍ tiene que estar en rojo es la de la cartelera.
    expect(nivelDeProxima(c, "Cartelera")).toBe("mal");
  });

  it("a una semana vista el pesaje NO se exige: el artículo sale la víspera", () => {
    // Ponerlo en rojo siete días antes sería criar lobos: no existe todavía.
    const p = comprobarProxima({ ...PROXIMA, pesajes: 0 }).find((x) => x.titulo === "Pesajes");
    expect(p?.nivel).toBe("ok");
    expect(p?.valor).toBe("aún no toca");
  });

  it("la víspera sin careo se avisa, y el detalle dice qué hacer", () => {
    const c = comprobarProxima({ ...VISPERA, tieneCareo: false });
    const v = c.find((x) => x.titulo === "Vídeo del careo");
    expect(v?.nivel).toBe("aviso");
    expect(v?.detalle).toContain("refresh-faceoffs");
  });

  it("a una semana vista la falta de careo no dice nada", () => {
    const v = comprobarProxima({ ...PROXIMA, tieneCareo: false }).find(
      (x) => x.titulo === "Vídeo del careo",
    );
    expect(v?.nivel).toBe("ok");
    expect(v?.valor).toBe("aún no toca");
  });

  it("con el pesaje a cero la víspera, el detalle recuerda que el cron falla EN VERDE", () => {
    const p = comprobarProxima({ ...VISPERA, pesajes: 0 }).find((x) => x.titulo === "Pesajes");
    expect(p?.nivel).toBe("mal");
    expect(p?.detalle).toContain("EN VERDE");
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
    pesajes: 0,
    tieneCareo: false,
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

// ---------------------------------------------------------------------------
// El turno de guardia: ¿SE ESTÁ GRABANDO?
// ---------------------------------------------------------------------------
//
// Este bloque no tenía NI UN test, y es el único del panel que puede despertar
// a alguien a las tres de la mañana. Los números de cada caso están medidos
// sobre el 1064 (UFC 330, la noche del 15 al 16-ago-2026), que se grabó
// entera y bien: 352 muestras, 12 combates activos de 14 filas (2 canceladas).
//
// EL FALLO QUE ESTOS TESTS FIJAN: con la regla vieja
// (`veladaEnMarcha && muestrasUltimaHora === 0 → "mal"`) el panel decía PARADO
// durante los paseíllos, porque el escritor tiene PROHIBIDO guardar muestras
// hasta la campana del asalto 1. Ventana ciega real de esa noche: ancla
// 21:30:00Z, primera muestra 21:45:03Z = 15 min 3 s de rojo con todo
// funcionando.
const ANCLA_1064 = "2026-08-15T21:30:00.000Z";

// El cartel del 1064 tal cual: 12 peleas activas y ninguna con película todavía.
const GUARDIA_1064: DatosGuardia = {
  arranqueDelDirectoUtc: ANCLA_1064,
  horasHastaElArranque: null,
  veladaEnMarcha: true,
  minutosDesdeElAncla: 0,
  minutosSinPulso: 0,
  muestrasUltimaHora: 0,
  peleasActivas: 12,
  peleasConFilaViva: 0,
  peleasSinCerrar: 0,
  peleasConPelicula: 0,
  muestrasDelEvento: 0,
  // El bucle acaba de latir. Los escenarios que prueban el latido lo pisan.
  minutosDesdeElLatidoDelBucle: 0.5,
};

const guardia = (cambios: Partial<DatosGuardia> = {}): Comprobacion[] =>
  comprobarGuardia({ ...GUARDIA_1064, ...cambios });

const comprobacionQueEmpiezaPor = (cs: Comprobacion[], prefijo: string) => {
  const c = cs.find((x) => x.titulo.startsWith(prefijo));
  if (!c) throw new Error(`No hay ninguna comprobación que empiece por «${prefijo}»`);
  return c;
};

/** El veredicto de la cámara. El vigilante dice SIEMPRE lo mismo (ver el caso 14). */
const camaraDe = (cs: Comprobacion[]) => comprobacionQueEmpiezaPor(cs, "Cámara");
const vigilanteDe = (cs: Comprobacion[]) => comprobacionQueEmpiezaPor(cs, "Vigilante");

/** Los 13 escenarios, para poder recorrerlos todos en el caso 14. */
const ESCENARIOS: { nombre: string; datos: Partial<DatosGuardia> }[] = [
  { nombre: "sin velada", datos: { veladaEnMarcha: false, minutosDesdeElAncla: null, minutosSinPulso: 351 } },
  { nombre: "paseíllos", datos: { minutosDesdeElAncla: 5, minutosSinPulso: 0.4, peleasConFilaViva: 1, peleasSinCerrar: 1 } },
  { nombre: "el minuto antes de la primera muestra", datos: { minutosDesdeElAncla: 14, minutosSinPulso: 0.3, peleasConFilaViva: 1, peleasSinCerrar: 1 } },
  { nombre: "pulso NULL en el minuto cero", datos: { minutosDesdeElAncla: 0.2, minutosSinPulso: null } },
  { nombre: "el 1-ago: nadie lanzó el bucle", datos: { minutosDesdeElAncla: 26, minutosSinPulso: null } },
  { nombre: "la peor hora medida", datos: { minutosDesdeElAncla: 268, minutosSinPulso: 0.5, muestrasUltimaHora: 27, peleasConFilaViva: 9, peleasSinCerrar: 1 } },
  { nombre: "el hueco de 24,6 min entre prelims y estelar", datos: { minutosDesdeElAncla: 235, minutosSinPulso: 4.9, muestrasUltimaHora: 45, peleasConFilaViva: 7, peleasSinCerrar: 1 } },
  { nombre: "el hueco de pulso más largo medido", datos: { minutosDesdeElAncla: 90, minutosSinPulso: 4.92, muestrasUltimaHora: 55, peleasConFilaViva: 3, peleasSinCerrar: 1 } },
  { nombre: "26 min sin pulso a mitad de velada", datos: { minutosDesdeElAncla: 116, minutosSinPulso: 26, muestrasUltimaHora: 40, peleasConFilaViva: 5, peleasSinCerrar: 1 } },
  { nombre: "la cola de la noche", datos: { minutosDesdeElAncla: 420, minutosSinPulso: 10, muestrasUltimaHora: 52, peleasConFilaViva: 12, peleasSinCerrar: 0, peleasConPelicula: 12, muestrasDelEvento: 352 } },
  { nombre: "media cartelera sellada", datos: { minutosDesdeElAncla: 116, minutosSinPulso: 26, peleasConFilaViva: 5, peleasSinCerrar: 0 } },
  { nombre: "bucle muerto con el respaldo vivo", datos: { minutosDesdeElAncla: 155, minutosSinPulso: 9, muestrasUltimaHora: 6, peleasConFilaViva: 5, peleasSinCerrar: 1 } },
  { nombre: "cartel vacío", datos: { minutosDesdeElAncla: 200, minutosSinPulso: null, peleasActivas: 0 } },
  // Los dos añadidos en la revisión adversarial: el cartel CUBIERTO pero SIN
  // PELÍCULA. Los números salen de la base, no de la cabeza. Ver el caso 18.
  { nombre: "el 1063: cartel entero escrito de una sentada", datos: { minutosDesdeElAncla: 344, minutosSinPulso: 2, muestrasUltimaHora: 14, peleasActivas: 14, peleasConFilaViva: 14, peleasSinCerrar: 0, peleasConPelicula: 14, muestrasDelEvento: 14 } },
  { nombre: "el 1060: media velada sin grabar y el respaldo cierra el cartel", datos: { minutosDesdeElAncla: 400, minutosSinPulso: 3, muestrasUltimaHora: 6, peleasActivas: 14, peleasConFilaViva: 14, peleasSinCerrar: 0, peleasConPelicula: 8, muestrasDelEvento: 50 } },
  { nombre: "velada en marcha sin hora de ancla", datos: { minutosDesdeElAncla: null, minutosSinPulso: 1, peleasConFilaViva: 1, peleasSinCerrar: 1 } },
];

describe("comprobarGuardia · ¿se está grabando?", () => {
  it("1. sin velada todo está en reposo, aunque el pulso sea viejísimo", () => {
    // El dato de HOY, 16-ago a las 14:51Z: la última escritura en
    // `live_fight_stats` es de las 09:12:20Z (351 min) y son las 12 filas del
    // 1064, que la poda conserva 48 h. Sin velada eso no significa nada.
    const c = guardia(ESCENARIOS[0].datos);
    expect(c).toHaveLength(5);
    expect(c.map((x) => x.nivel)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(camaraDe(c).valor).toBe("en reposo");
  });

  it("2. 🔴 LOS PASEÍLLOS DEL 1064: cero muestras, pulso latiendo, y eso es NORMAL", () => {
    // ES EL TEST DEL FALLO. Ancla+5 min: ESPN ya da el evento por empezado
    // (abrió a las 21:30:37Z, 37 s después del ancla) y el bucle reescribe la
    // fila viva cada ~23 s, pero NO hay ni una muestra porque el escritor solo
    // las guarda con `period >= 1` (live_stats.py:153). Con la regla vieja
    // esto era "mal": 15 min 3 s de rojo por diseño, cada sábado.
    const c = guardia(ESCENARIOS[1].datos);
    expect(camaraDe(c).nivel).toBe("ok");
    expect(camaraDe(c).valor).toBe("paseíllos");
  });

  it("3. 🔴 21:44Z, el minuto anterior a la primera muestra (21:45:03Z)", () => {
    const c = guardia(ESCENARIOS[2].datos);
    expect(camaraDe(c).nivel).toBe("ok");
  });

  it("4. pulso NULL dentro de la gracia: aviso, ni rojo ni verde", () => {
    // Hasta que ESPN no pasa el evento a 'in' NO EXISTE fila que tocar: el log
    // del 1064 tiene 45 pasadas seguidas con «no ESPN event in/post, DB
    // untouched». Exigir pulso ahí es exigir lo imposible; darlo por bueno es
    // el fallo del 1-ago. Ámbar, que se ve en el panel y no manda correo.
    const c = guardia(ESCENARIOS[3].datos);
    expect(camaraDe(c).nivel).toBe("aviso");
    expect(camaraDe(c).valor).toBe("arrancando");
  });

  it("5. 🔴 EL 1-ago: nadie lanzó el bucle; pasada la gracia es rojo", () => {
    const c = guardia(ESCENARIOS[4].datos);
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).valor).toBe("sin señal");
    expect(camaraDe(c).detalle).toContain("1-ago");
  });

  it("6. la peor hora medida de toda la velada (27 muestras) sigue en verde", () => {
    // 01:58Z del 1064: la hora más floja de la noche con el bucle sano
    // (mín 27 / media 49,6 / máx 70). Fija el margen de 2,7× sobre el umbral.
    const c = guardia(ESCENARIOS[5].datos);
    expect(camaraDe(c).nivel).toBe("ok");
    expect(camaraDe(c).valor).toBe("27 en 1 h");
  });

  it("7. el hueco de 24,6 min entre prelims y estelar no es rojo", () => {
    // 01:00:45Z → 01:25:21Z sin una sola muestra, y la velada iba perfecta:
    // entre combates no hay nada que muestrear. Lo que no se paró fue el pulso.
    expect(camaraDe(guardia(ESCENARIOS[6].datos)).nivel).toBe("ok");
  });

  it("8. el hueco de pulso más largo medido (4 min 55 s) no es rojo", () => {
    // 846 pasadas con el evento vivo, 53 sin escribir, en dos grupos; el mayor
    // de 4 min 55 s. El umbral está cinco veces por encima de eso.
    expect(camaraDe(guardia(ESCENARIOS[7].datos)).nivel).toBe("ok");
  });

  it("9. 26 min sin pulso con la velada a medias es rojo", () => {
    const c = guardia(ESCENARIOS[8].datos);
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).valor).toBe("26 min sin escribir");
  });

  it("10. 🔴 LA COLA DE LA NOCHE: cartel entero grabado y sellado, no es rojo", () => {
    // Medido: el bucle selló la última pelea a las 04:20Z y `velada_en_marcha`
    // siguió TRUE hasta las 04:47:23Z, cuando el backfill escribió los últimos
    // resultados. 27 min de velada en marcha sin nada que grabar.
    const c = guardia(ESCENARIOS[9].datos);
    expect(camaraDe(c).nivel).toBe("ok");
    expect(camaraDe(c).valor).toBe("cartel grabado");

    // Y a las 04:46, un minuto antes del backfill, con el pulso ya por encima
    // del umbral: sin la escapatoria esto sería "mal".
    const tarde = guardia({ ...ESCENARIOS[9].datos, minutosSinPulso: 26, muestrasUltimaHora: 51 });
    expect(camaraDe(tarde).nivel).toBe("ok");
    expect(camaraDe(tarde).valor).toBe("cartel grabado");
  });

  it("11. 🔴 la escapatoria del cartel grabado NO se cuela a mitad de cartel", () => {
    // La cobertura CRECE pelea a pelea: a las 22:00 / 23:00 / 00:00 / 01:00 /
    // 02:00 / 03:00 / 04:00 había película de 1, 3, 5, 7, 9, 11 y 12 peleas.
    // Una pelea que aún no ha ocurrido no tiene fila viva, así que 5 de 12
    // nunca puede leerse como «no queda nada que grabar».
    const c = guardia(ESCENARIOS[10].datos);
    expect(camaraDe(c).nivel).toBe("mal");
  });

  it("12. 🔴 bucle muerto y cron de respaldo vivo: el pulso fresco NO salva", () => {
    // `live-results.yml` (*/10) lanza EL MISMO programa que el bucle, así que
    // mantiene el pulso fresco con el bucle muerto: 07:36, 07:59, 08:41 y
    // 09:12Z de hoy son suyas. Lo único que los separa es el RITMO — ~50
    // muestras/h el bucle, 2-6/h el cron.
    const c = guardia(ESCENARIOS[11].datos);
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).valor).toBe("6 en 1 h");
    expect(camaraDe(c).detalle).toContain("respaldo");
  });

  it("13. un cartel vacío no aprueba por 0 >= 0", () => {
    // El mismo guardarraíl que `cartelSellado` en el panel de directo: sin
    // combates no hay nada completo, hay una cartelera que falta.
    const c = guardia(ESCENARIOS[12].datos);
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).valor).not.toBe("cartel grabado");
  });

  it("14. el vigilante y la cámara dicen SIEMPRE el mismo nivel y el mismo valor", () => {
    // Eran dos literales gemelos, carácter por carácter. Dos copias es
    // exactamente cómo un panel acaba contradiciéndose en la misma pantalla,
    // que es la avería que este panel no se puede permitir.
    for (const { nombre, datos } of ESCENARIOS) {
      const c = guardia(datos);
      expect(vigilanteDe(c).nivel, nombre).toBe(camaraDe(c).nivel);
      expect(vigilanteDe(c).valor, nombre).toBe(camaraDe(c).valor);
    }
  });

  it("15. la rampa de muestras exigidas sube desde el ancla y satura en 10/h", () => {
    expect(muestrasExigidas(null)).toBe(0);
    expect(muestrasExigidas(0)).toBe(0);
    // Dentro de la gracia no se exige nada: no hay dato que entrar todavía.
    expect(muestrasExigidas(25)).toBe(0);
    // Ancla+45: el 1064 llevaba 34 muestras y esto pide 3,33.
    expect(muestrasExigidas(45)).toBeCloseTo(3.33, 2);
    expect(muestrasExigidas(85)).toBe(10);
    expect(muestrasExigidas(400)).toBe(10);
  });

  it("16. el centinela, el guardián y el censo no se han movido", () => {
    // La foto del panel de hoy, para que este arreglo no cambie lo que ya
    // estaba bien: la hora es de Madrid y lleva restados los 15 min de adelanto.
    const c = guardia({ veladaEnMarcha: false, minutosDesdeElAncla: null, minutosSinPulso: null });
    expect(comprobacionQueEmpiezaPor(c, "Centinela").nivel).toBe("ok");
    expect(comprobacionQueEmpiezaPor(c, "Centinela").valor).toContain("23:15");
    expect(comprobacionQueEmpiezaPor(c, "Guardián").valor).toBe("activo");
    expect(comprobacionQueEmpiezaPor(c, "El resto de la plantilla").valor).toBe("27 de 38");
  });

  it("17. sin ficha en `fighters` no hay fila viva, y eso acaba en rojo, no en verde", () => {
    // El punto ciego conocido de la escapatoria: si a una pelea activa el bucle
    // no le escribe nunca fila (el luchador no existe en `fighters`, y el bucle
    // empareja por nombre), la cobertura no se completa jamás. Es un rojo
    // TARDÍO, no un verde falso — y «Luchadores con ficha» ya está en rojo por
    // su cuenta desde días antes.
    const c = guardia({
      minutosDesdeElAncla: 430,
      minutosSinPulso: 30,
      muestrasUltimaHora: 0,
      peleasConFilaViva: 11,
      peleasSinCerrar: 0,
    });
    expect(camaraDe(c).nivel).toBe("mal");
  });

  // -------------------------------------------------------------------------
  // Añadidos en la revisión adversarial del 16-ago-2026.
  // -------------------------------------------------------------------------

  it("18. 🔴 EL 1063 OTRA VEZ: cartel CUBIERTO no es cartel GRABADO", () => {
    // El agujero que quedaba abierto. `peleas_con_fila_viva` cuenta FILAS, y una
    // fila sólo prueba que alguien MIRÓ la pelea. Medido en la base: las 14
    // filas del 1063 se escribieron el 1-ago entre las 19:43:21 y las 19:43:26Z
    // —el MISMO segundo, con el cartel entero ya terminado— y dejaron UNA
    // muestra por pelea. Con la regla anterior, la noche que se perdió entera
    // habría pintado «cartel grabado» en VERDE en la fila cuyo único trabajo es
    // decir si se está grabando.
    const c = guardia(ESCENARIOS[13].datos);
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).valor).not.toBe("cartel grabado");
    expect(camaraDe(c).detalle).toContain("SIN PELÍCULA");
  });

  it("19. 🔴 y el 1060: media velada sin grabar tampoco compra el verde", () => {
    // El 1063 lo cazaría un umbral de muestras totales, pero el 1060 no: 50
    // muestras para 14 peleas pasan cualquier mínimo por pelea razonable, y sin
    // embargo SEIS de sus catorce peleas no tienen NI UNA muestra. Por eso se
    // exigen las dos cosas: todas con serie Y un mínimo de muestras.
    const c = guardia(ESCENARIOS[14].datos);
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).detalle).toContain("8 con serie");
  });

  it("20. una velada normal sigue cerrando en verde con el cartel grabado", () => {
    // El guardarraíl del guardarraíl: la peor de las tres veladas bien grabadas
    // de la base (1087, 288 muestras / 12 peleas) tiene que seguir en verde, y
    // también una cartelera entera de finalizaciones rápidas (la pelea más corta
    // del 1064 dejó 4 muestras: 12 × 4 = 48, y se piden 36).
    const buena = guardia({
      minutosDesdeElAncla: 420, minutosSinPulso: 10, muestrasUltimaHora: 30,
      peleasConFilaViva: 12, peleasSinCerrar: 0, peleasConPelicula: 12, muestrasDelEvento: 288,
    });
    expect(camaraDe(buena).nivel).toBe("ok");
    expect(camaraDe(buena).valor).toBe("cartel grabado");

    const todoKos = guardia({
      minutosDesdeElAncla: 300, minutosSinPulso: 8, muestrasUltimaHora: 20,
      peleasConFilaViva: 12, peleasSinCerrar: 0, peleasConPelicula: 12, muestrasDelEvento: 48,
    });
    expect(camaraDe(todoKos).nivel).toBe("ok");
  });

  it("21. 🔴 velada en marcha SIN hora de ancla: rojo, no «paseíllos»", () => {
    // `muestrasExigidas(null)` vale 0 —«no se exige nada»—, así que con el pulso
    // fresco del cron de respaldo y el ancla perdida esto daba VERDE para
    // siempre. Es la misma trampa que `num(null)`, por la otra puerta.
    const c = guardia(ESCENARIOS[15].datos);
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).valor).toBe("sin hora de ancla");
  });

  // ------------------------------------------- el latido propio del bucle

  it("22. 🔴 EL QUE DA VALOR AL ARREGLO: bucle muerto DENTRO de la ventana del ritmo", () => {
    // El agujero que quedaba después del test 12. Ahí el cron ya había hundido
    // el ritmo, pero el ritmo se mide sobre UNA HORA: en los primeros minutos
    // tras morir el bucle, la ventana todavía arrastra sus ~50 muestras/h y el
    // pulso lo mantiene fresco el respaldo. Eso daba VERDE hasta 60 min.
    //
    // Escenario: el bucle murió hace 12 min, el cron ha escrito desde entonces
    // (pulso de 3 min) y la última hora aún tiene 45 muestras, casi todas del
    // bucle vivo. Sin el latido, esto es verde.
    const datos = {
      minutosDesdeElAncla: 90,
      minutosSinPulso: 3,
      muestrasUltimaHora: 45,
      peleasActivas: 12,
      peleasConFilaViva: 6,
      peleasSinCerrar: 1,
      peleasConPelicula: 6,
      muestrasDelEvento: 300,
    };
    // Control: con el latido fresco, ese mismo estado es verde. Si esta línea
    // se pusiera roja, el test de abajo no probaría nada.
    expect(camaraDe(guardia({ ...datos, minutosDesdeElLatidoDelBucle: 0.7 })).nivel).toBe("ok");

    const c = guardia({ ...datos, minutosDesdeElLatidoDelBucle: 12 });
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).valor).toBe("12 min sin latir");
    expect(camaraDe(c).detalle).toContain("respaldo");
  });

  it("23. 🪤 un latido que todavía no existe NUNCA es rojo", () => {
    // El día del despliegue la fila 'live-loop' aún no está escrita. Si un NULL
    // fuera rojo, el panel se pondría en rojo con todo funcionando y el orden
    // de despliegue importaría. Es el mismo criterio que el latido del
    // microservicio de predicción: sin noticias no es lo mismo que caído.
    //
    // Y el caso «nadie ha lanzado el bucle» no se queda sin cubrir: lo caza la
    // rama del pulso NULL, que sigue dando rojo.
    const c = guardia({
      minutosDesdeElAncla: 90,
      minutosSinPulso: 3,
      muestrasUltimaHora: 45,
      peleasActivas: 12,
      peleasConFilaViva: 6,
      peleasSinCerrar: 1,
      peleasConPelicula: 6,
      muestrasDelEvento: 300,
      minutosDesdeElLatidoDelBucle: null,
    });
    expect(camaraDe(c).nivel).toBe("ok");

    // Sin latido Y sin pulso sigue siendo rojo, por la otra rama.
    const sinNada = guardia({
      minutosDesdeElAncla: 90,
      minutosSinPulso: null,
      minutosDesdeElLatidoDelBucle: null,
    });
    expect(camaraDe(sinNada).nivel).toBe("mal");
    expect(camaraDe(sinNada).valor).toBe("sin señal");
  });

  it("24. el latido no se cuela por delante de lo que ya funcionaba", () => {
    // El latido SUMA rojo, no lo quita. Con el bucle latiendo tan campante pero
    // el pulso parado 26 min, manda el pulso: el bucle podría estar vivo y sin
    // conseguir escribir nada, que es otro fallo distinto.
    const c = guardia({ ...ESCENARIOS[8].datos, minutosDesdeElLatidoDelBucle: 0.4 });
    expect(camaraDe(c).nivel).toBe("mal");
    expect(camaraDe(c).valor).toBe("26 min sin escribir");
  });
});
