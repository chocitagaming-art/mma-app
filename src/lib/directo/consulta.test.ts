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
//
// 🪤 Y LO QUE ESTA TANDA DE TESTS NO CUBRÍA, y costó ~202 min de rojo falso en
// la velada del 1087: entre combates NO hay asalto rodando, así que el contador
// se para **por diseño**. Los tests de abajo pasaban `ritmo: 0` sin decir si
// había alguien peleando, y con eso fijaban justo el comportamiento roto. Ahora
// cada caso declara `asaltoRodando`, que es la pregunta que lo decide todo.

const base = {
  ventanaAbierta: false,
  yaTermino: false,
  muestras: 0,
  ritmo: 0,
  silencioSegundos: null,
};

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

describe("decidir · con un asalto rodando", () => {
  // Aquí SÍ tiene que entrar dato: hay dos personas peleando y el escritor
  // graba una muestra cada ~24 s. Un contador parado es una avería de verdad.
  const peleando = { ...base, ventanaAbierta: true, asaltoRodando: true };

  it("GRITA si no se ha escrito ni una muestra", () => {
    const r = decidir(peleando);
    expect(r.nivel).toBe("perdiendose");
    expect(r.parte.join(" ")).toContain("ni una muestra");
  });

  it("y avisa de que la franja roja no sirve de prueba", () => {
    // La confusión que costó el susto del 8-ago: mirar la portada y ver rojo.
    expect(decidir(peleando).parte.join(" ")).toContain("por reloj");
  });

  it("GRITA si hay muestras viejas pero el ritmo es cero", () => {
    // "Grabó un rato y se paró" es un fallo que un contador total NO ve: 200
    // muestras parecen muchas hasta que te fijas en que no crecen.
    const r = decidir({ ...peleando, muestras: 200, ritmo: 0, silencioSegundos: 400 });
    expect(r.nivel).toBe("perdiendose");
    expect(r.parte.join(" ")).toContain("ritmo es CERO");
  });

  it("se extraña si lleva más de un minuto sin escribir", () => {
    const r = decidir({ ...peleando, muestras: 120, ritmo: 3, silencioSegundos: 90 });
    expect(r.nivel).toBe("atencion");
  });

  it("da por muerto el corazón pasados 3 minutos", () => {
    const r = decidir({ ...peleando, muestras: 120, ritmo: 1, silencioSegundos: 400 });
    expect(r.nivel).toBe("perdiendose");
  });

  it("dice que todo va bien cuando el ritmo es sano", () => {
    const r = decidir({ ...peleando, muestras: 120, ritmo: 15, silencioSegundos: 12 });
    expect(r.nivel).toBe("grabando");
    expect(r.parte.join(" ")).toContain("nada que hacer");
  });
});

describe("decidir · entre combates (G5) — el rojo falso que costó 168 min", () => {
  // MEDIDO EN EL 1087, la noche del 8-ago. Con 12 combates hay 11 huecos entre
  // ellos, de ~10 min cada uno, y el sondeo de ritmo mira 5 min: el contador
  // llega a cero **estando todo bien**. El panel escribía "SE ESTÁ PERDIENDO"
  // con el parte "un total que no crece es un total muerto" mientras tres
  // líneas más abajo, en la misma pantalla, ponía "Walkouts · as. 0".
  //
  // 🪤 Y el arreglo que parecía obvio NO servía: filtrar por `period == 0`.
  // Los 11 huecos arrancan TODOS tras una muestra con `state='post'` y
  // `period` 1, 2 o 3 — la del combate que acaba de terminar, que sigue siendo
  // la fila más reciente porque el siguiente aún está en 'pre' y no escribe.
  // Ninguno pasa por `period == 0`. Por eso el criterio es "asalto rodando" y
  // no "period cero".
  const entreCombates = {
    ...base,
    ventanaAbierta: true,
    asaltoRodando: false,
    muestras: 58,
    ritmo: 0,
  };

  it("NO grita cuando nadie está peleando y el contador se para", () => {
    const r = decidir({ ...entreCombates, silencioVivasSegundos: 600 });
    expect(r.nivel).toBe("pausa");
    expect(r.parte.join(" ")).toContain("Entre combates");
  });

  it("el hueco real del 1087: 'post' del combate anterior, no 'period 0'", () => {
    // Reproduce la forma exacta del dato: la fila viva más reciente es la del
    // combate terminado, con su asalto real. `period == 0` no la habría cazado.
    const r = decidir({ ...entreCombates, silencioSegundos: 600, silencioVivasSegundos: 420 });
    expect(r.nivel).not.toBe("perdiendose");
  });

  it("un hueco de 10 minutos sigue siendo normal", () => {
    expect(decidir({ ...entreCombates, silencioVivasSegundos: 10 * 60 }).nivel).toBe("pausa");
  });

  it("pero pasada la pausa máxima SÍ grita: el punto ciego se cierra", () => {
    // Si se callara sin límite, un bucle muerto durante los paseíllos dejaría
    // el panel en verde el resto de la noche. Es el riesgo real de silenciar.
    const r = decidir({ ...entreCombates, silencioVivasSegundos: UMBRALES.PAUSA_ESPERADA_MAX_S + 1 });
    expect(r.nivel).toBe("perdiendose");
    expect(r.parte.join(" ")).toContain("sin tocar nada");
  });

  it("usa el pulso de las filas vivas, no el de las muestras", () => {
    // Entre combates las muestras están paradas A PROPÓSITO (el escritor sólo
    // graba con `period >= 1`), pero el bucle sigue tocando la fila viva
    // mientras ESPN dé 'in'. Mirar el contador equivocado es todo el bug.
    const r = decidir({
      ...entreCombates,
      silencioSegundos: 60 * 60,   // muestras: una hora paradas
      silencioVivasSegundos: 30,   // pulso: el bucle acaba de escribir
    });
    expect(r.nivel).toBe("pausa");
  });
});

describe("decidir · el minuto cero (G4) — el rojo falso del arranque", () => {
  // MEDIDO: la ventana se abre 20 min antes del primer combate y ESPN tardó
  // 14 min en pasar de `Pre-fight` (21:06Z) a `Walkouts` (21:10Z) y a `R1`
  // (21:14Z), con la primera muestra 24 s después. Todo ese rato el panel decía
  // "SE ESTÁ PERDIENDO" con 0 muestras: el número era cierto y el veredicto
  // prematuro. ~34 min de rojo por velada.
  //
  // 🪤 Aquí `period` no vale 0: vale **null**. No hay ni una fila viva todavía.
  const arranque = { ...base, ventanaAbierta: true, asaltoRodando: false, muestras: 0 };

  it("espera en paz mientras faltan minutos para el primer combate", () => {
    expect(decidir({ ...arranque, faltanSegundos: 900 }).nivel).toBe("esperando");
  });

  it("y sigue esperando durante las presentaciones", () => {
    // Ya empezó por reloj (faltan -5 min) pero ESPN aún no ha llegado a R1.
    const r = decidir({ ...arranque, faltanSegundos: -5 * 60 });
    expect(r.nivel).toBe("esperando");
    expect(r.parte.join(" ")).toContain("presentaciones");
  });

  it("PERO pasada la gracia, cero muestras vuelve a ser una avería", () => {
    // Es el caso del 403 del 8-ago: si a los 20 min de empezar no hay ni una
    // muestra, no son los paseíllos. Silenciar esto sería borrar la alarma que
    // justifica el panel entero.
    const r = decidir({ ...arranque, faltanSegundos: -(UMBRALES.GRACIA_ARRANQUE_S + 60) });
    expect(r.nivel).toBe("perdiendose");
    expect(r.parte.join(" ")).toContain("ni una muestra");
  });

  it("la gracia es la medida, no una elegida a ojo", () => {
    expect(UMBRALES.GRACIA_ARRANQUE_S).toBe(15 * 60);
    expect(UMBRALES.PAUSA_ESPERADA_MAX_S).toBe(25 * 60);
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
    expect(r.nivel).toBe("grabada");
    expect(r.parte.join(" ")).toContain("Salió bien");
  });

  it("y NO dice 'grabando' en presente: la velada ya terminó", () => {
    // 🪤 EL FALLO QUE ESTO FIJA, cazado por el dueño mirando la web en
    // producción: la palabra grande ponía GRABANDO —con el subtítulo «Está
    // entrando dato»— TRECE HORAS después de acabar la velada, mientras el
    // parte de debajo decía «Velada terminada y grabada». El panel se
    // desmentía a sí mismo en la misma pantalla.
    //
    // La palabra grande es lo único que se lee de lejos: tiene que ser cierta
    // LEÍDA SOLA. Por eso hay tres verdes distintos y no uno.
    const r = decidir({ ...term, muestras: 345, ritmo: 0, silencioSegundos: 1_200_000 });
    expect(r.nivel).not.toBe("grabando");
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
    expect(decidir({ ...term, muestras: UMBRALES.MUESTRAS_EXITO }).nivel).toBe("grabada");
  });
});

describe("decidir · el cartel completo cierra la velada, aunque el reloj no", () => {
  // La ventana sigue abierta 6 h después del estelar, pero una velada acaba
  // mucho antes. Sin esto, una noche perfecta seguía en rojo las horas que
  // quedaban de ventana — el mismo rojo falso, por la puerta de atrás.
  // Es el principio de este panel aplicado también al final: medir por DATO.
  const acabada = {
    ...base,
    ventanaAbierta: true,
    asaltoRodando: false,
    muestras: 288,
    ritmo: 0,
    combatesTotales: 12,
    combatesConMetodo: 12,
  };

  it("con los 12 combates resueltos, la velada está terminada y grabada", () => {
    const r = decidir(acabada);
    expect(r.nivel).toBe("grabada");
    expect(r.parte.join(" ")).toContain("Salió bien");
  });

  it("pero con uno sin resolver todavía NO la da por cerrada", () => {
    const r = decidir({ ...acabada, combatesConMetodo: 11, silencioVivasSegundos: 120 });
    expect(r.parte.join(" ")).not.toContain("Salió bien");
  });

  it("un cartel vacío no cuenta como completo", () => {
    // Guardarraíl contra el 0 >= 0: sin combates no hay nada que dar por hecho.
    const r = decidir({ ...acabada, combatesTotales: 0, combatesConMetodo: 0, silencioVivasSegundos: 120 });
    expect(r.parte.join(" ")).not.toContain("Salió bien");
  });

  it("con ganador pero sin método todavía, también cuenta como terminada", () => {
    // MEDIDO rebobinando el 1087 minuto a minuto: exigir el método dejaba el
    // panel en rojo desde las 03:01 hasta el cierre de la ventana — TRES HORAS
    // gritando por una velada que había ido bien. El método del primer combate
    // no llegó hasta las 05:50, pero a las 02:39 ya había ganador en los doce.
    const r = decidir({ ...acabada, combatesConGanador: 12, combatesConMetodo: 11 });
    expect(r.nivel).toBe("grabada");
  });

  it("y al revés: con método pero sin ganador (empates y no-contests) también", () => {
    // Un empate o un no-contest tienen método y NO tienen ganador. Si el cierre
    // dependiera sólo del ganador, una velada con un NC no se cerraría jamás.
    const r = decidir({ ...acabada, combatesConGanador: 11, combatesConMetodo: 12 });
    expect(r.nivel).toBe("grabada");
  });
});
