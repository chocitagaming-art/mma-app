import { describe, expect, it } from "vitest";

import {
  buildFightHeadline,
  displayLastName,
  grappleGapWords,
  type HeadlineInput,
} from "@/lib/fight-headline";

// El combate del maquetado, con las cifras del acta medidas contra Neon el
// 9-ago-2026: Sousa es el ROJO (7245) con 169 s, Miranda el AZUL (9109) con
// 231 s, 900 s de combate, gana Sousa por decisión unánime en el asalto 3.
const SOUSA_MIRANDA: HeadlineInput = {
  redName: "Manoel Sousa",
  blueName: "Richie Miranda",
  redControlSeconds: 169,
  blueControlSeconds: 231,
  fightSeconds: 900,
  winner: "red",
  method: "U-DEC",
  endRound: 3,
};

describe("displayLastName", () => {
  it("se queda con el apellido", () => {
    expect(displayLastName("Manoel Sousa")).toBe("Sousa");
    expect(displayLastName("Richie Miranda")).toBe("Miranda");
  });

  it("no parte los apellidos con partícula", () => {
    // 36 de los 2.859 luchadores de la base los llevan. Cortar por el último
    // espacio dejaría "Santos" y "Silva", que son otra persona.
    expect(displayLastName("Anderson Dos Santos")).toBe("Dos Santos");
    expect(displayLastName("Elizeu Zaleski dos Santos")).toBe("dos Santos");
    expect(displayLastName("Alex Da Silva")).toBe("Da Silva");
    expect(displayLastName("Alessio Di Chirico")).toBe("Di Chirico");
    // Dos partículas seguidas.
    expect(displayLastName("Chris de la Rocha")).toBe("de la Rocha");
    // 🪤 "du" faltaba desde el principio, y la ficha del CAMPEÓN de peso medio
    // llevaba días publicando titulares sobre alguien llamado «Plessis». Igual
    // que pasó con Della Maddalena: la lista se escribió mirando quién estaba
    // en pantalla, no quién está en la base.
    expect(displayLastName("Dricus Du Plessis")).toBe("Du Plessis");
  });

  it("🪤 NO mete partículas «por si acaso»: casi todas son nombres de pila", () => {
    // El agujero que este test impide abrir. Al buscar por qué faltaba "du" se
    // pasaron por la base las 29 partículas de apellido de los idiomas de la
    // UFC, y seis de ellas SÍ aparecen como penúltima palabra... siendo el
    // nombre de pila. Meterlas «para completar la lista» habría roto estas 14
    // fichas que hoy están bien. La lista se amplía contando, no por simetría.
    expect(displayLastName("Ben Askren")).toBe("Askren");
    expect(displayLastName("Al Iaquinta")).toBe("Iaquinta");
    expect(displayLastName("Mac Danzig")).toBe("Danzig");
    expect(displayLastName("Abu Azaitar")).toBe("Azaitar");
    expect(displayLastName("Li Jingliang")).toBe("Jingliang");
    expect(displayLastName("Sung Bin Jo")).toBe("Jo");
    // Y el caso al revés, que ya funciona: una partícula que abre el nombre es
    // el nombre de pila, no una partícula. "Da Woon" es coreano.
    expect(displayLastName("Da Woon Jung")).toBe("Jung");
  });

  it("🪤 no llama «Jr.» a nadie: el sufijo arrastra la palabra de delante", () => {
    // El agujero SIMÉTRICO del de las partículas, y se abrió al tapar aquel: la
    // regla miraba hacia atrás pero nunca hacia delante, así que devolvía el
    // sufijo como apellido. El bloque de agarre publicaba titulares enteros
    // sobre alguien llamado «Jr.» en 68 de los 8.612 combates.
    expect(displayLastName("Khalil Rountree Jr.")).toBe("Rountree Jr.");
    expect(displayLastName("Raul Rosas Jr.")).toBe("Rosas Jr.");
    expect(displayLastName("Michael Aswell Jr.")).toBe("Aswell Jr.");
    expect(displayLastName("Kai Kamaka III")).toBe("Kamaka III");
  });

  it("y tampoco los quita: en portugués el sufijo ES el nombre", () => {
    // Los cinco sufijos que existen de verdad en `fighters`, contados el
    // 11-ago: jr. (9), neto (2), junior (2), iii (1) y filho (1). A «Antonio
    // Carlos Junior» se le conoce como Carlos Junior, no como Carlos.
    expect(displayLastName("Antonio Carlos Junior")).toBe("Carlos Junior");
    expect(displayLastName("Marcio Alexandre Junior")).toBe("Alexandre Junior");
    expect(displayLastName("Antonio Braga Neto")).toBe("Braga Neto");
    // Nombre de dos palabras: el arrastre llega hasta el principio, que aquí
    // es justo lo correcto.
    expect(displayLastName("Mario Neto")).toBe("Mario Neto");
    expect(displayLastName("Jafel Filho")).toBe("Jafel Filho");
  });

  it("el sufijo y la partícula se combinan sin pisarse", () => {
    expect(displayLastName("Joao dos Santos Jr.")).toBe("dos Santos Jr.");
  });

  it("conoce «Della» y «Saint»", () => {
    // 🪤 Tres luchadores de la base, y uno es campeón: 3215 lo publicaba como
    // «Makhachev lo tuvo sujeto 19 minutos más que Maddalena». Su apellido es
    // Della Maddalena.
    expect(displayLastName("Jack Della Maddalena")).toBe("Della Maddalena");
    expect(displayLastName("Ovince Saint Preux")).toBe("Saint Preux");
    expect(displayLastName("Benoit Saint Denis")).toBe("Saint Denis");
  });

  it("devuelve entero el nombre de una sola palabra", () => {
    // 9 luchadores de la base: Rongzhu, Maheshate, Mizuki, Alatengheili…
    expect(displayLastName("Rongzhu")).toBe("Rongzhu");
    expect(displayLastName("Alatengheili")).toBe("Alatengheili");
  });

  it("aguanta la entrada sucia sin romper la frase", () => {
    expect(displayLastName("  Manoel   Sousa  ")).toBe("Sousa");
    expect(displayLastName("")).toBe("");
  });

  it("no revienta con el nombre a null", () => {
    // 🪤 CAZADO POR LA COMPROBACIÓN CONTRA LA BASE, no por los tests con
    // fixtures. fights.fighter_red_name y fighter_blue_name están a NULL en
    // 8.694 de las 8.851 filas (el 98,2 %): el nombre bueno sale del join con
    // `fighters`, no de esas columnas. Con un fixture escrito a mano esto no
    // se ve nunca, y en producción sería un TypeError que tumba la ficha.
    expect(displayLastName(null)).toBe("");
    expect(displayLastName(undefined)).toBe("");
  });
});

describe("grappleGapWords", () => {
  it("redondea a una unidad que se pueda imaginar", () => {
    // La regla §5: nunca mm:ss en el titular. "1:02" hay que dividirlo
    // mentalmente; "un minuto" se ve. 62 s -> "un minuto" es exactamente el
    // caso del maquetado (231 - 169 = 62).
    expect(grappleGapWords(62)).toBe("un minuto");
    expect(grappleGapWords(30)).toBe("medio minuto");
    expect(grappleGapWords(45)).toBe("un minuto");
    expect(grappleGapWords(75)).toBe("minuto y medio");
    expect(grappleGapWords(105)).toBe("dos minutos");
    expect(grappleGapWords(135)).toBe("dos minutos y medio");
    expect(grappleGapWords(165)).toBe("tres minutos");
  });

  it("pasa a cifra cuando la palabra dejaría de ayudar", () => {
    // La mayor diferencia real de la base son 1.297 s = 21,6 min (medido el
    // 9-ago sobre 8.612 combates). "veintiún minutos" no se lee mejor que
    // "21 minutos", y la regla era que se pudiera imaginar.
    expect(grappleGapWords(600)).toBe("diez minutos");
    expect(grappleGapWords(660)).toBe("11 minutos");
    expect(grappleGapWords(1297)).toBe("21 minutos y medio");
  });
});

describe("buildFightHeadline", () => {
  it("escribe el titular del maquetado", () => {
    // 231 - 169 = 62 s -> "un minuto". El que más sujetó es el AZUL.
    // El texto sale en caja normal a propósito: la decisión de gritarlo en
    // mayúsculas es del componente, y la propia spec avisa de que 46
    // caracteres en caja alta son tres líneas a 375 px.
    const h = buildFightHeadline(SOUSA_MIRANDA);
    expect(h?.headline).toBe("Miranda lo tuvo sujeto un minuto más que Sousa");
  });

  it("dice cuánto del combate fue agarre EN PORCENTAJE", () => {
    // 🪤 EL REDISEÑO DE LA SEGUNDA REVISIÓN. Las dos versiones anteriores
    // decían el agarre en minutos redondeados, y eso obligaba a convivir con
    // DOS escalas de redondeo a la vez: la del titular (medias unidades de
    // 30 s) y la del subtítulo (minutos enteros). Se contradecían entre sí —
    // los mismos 36 s salían como "medio minuto" arriba y "casi un minuto"
    // abajo— y cada parche abría un caso nuevo: dos rondas, diez fallos.
    //
    // El porcentaje no tiene escala que colisionar y es lo que pide la regla 3
    // de la especificación: «Porcentaje antes que segundos. "58 % del
    // combate" se entiende; "232 segundos" hay que dividirlo mentalmente.»
    //
    // 🪤 Y el porcentaje sale del MISMO reparto que pinta la barra, no de una
    // cuenta propia. La barra dice 19 % del rojo y 26 % del azul: la frase
    // tiene que decir 45, no el 44 que daba round(400/900) por su cuenta. Eran
    // 1.531 combates con dos cifras del mismo dato a tres líneas de distancia.
    const h = buildFightHeadline(SOUSA_MIRANDA);
    expect(h?.subhead).toBe("El 45 % del combate se peleó agarrado.");
    // Regla 5: si se enseña un porcentaje del reparto, se enseñan los dos.
    // Sobre el combate Miranda es el 26 %; sobre el agarre, 231/400 = 58 %.
    expect(h?.grappledLine).toBe(
      "De los 6:40 que alguno sujetó, Miranda se llevó el 58 %.",
    );
  });

  it("dice el hecho cuando el que más sujetó perdió", () => {
    // 1.807 combates de la base están en este caso (medido el 9-ago). La nota
    // no es un descargo sobre nuestros datos: es un hecho comprobable, y
    // enseña lo mismo sin decir "esto no mide quién pegó".
    const h = buildFightHeadline(SOUSA_MIRANDA);
    expect(h?.note).toBe(
      "Miranda lo tuvo sujeto un minuto más y aun así perdió: los tres jueces vieron ganar a Sousa.",
    );
  });

  it("no dice «los tres jueces» en una decisión dividida", () => {
    // 828 divididas + 104 mayoritarias = 932 combates donde los tres jueces NO
    // vieron ganar al mismo. La frase sería falsa, y es del tipo que ya nos
    // costó dos revisiones: cierta de forma y falsa de fondo.
    const dividida = buildFightHeadline({ ...SOUSA_MIRANDA, method: "S-DEC" });
    expect(dividida?.note).toBe(
      "Miranda lo tuvo sujeto un minuto más y aun así perdió: los jueces vieron ganar a Sousa.",
    );
    const mayoritaria = buildFightHeadline({ ...SOUSA_MIRANDA, method: "M-DEC" });
    expect(mayoritaria?.note).toContain("los jueces vieron ganar a Sousa");
    expect(mayoritaria?.note).not.toContain("los tres");
  });

  it("dice el asalto cuando el combate se acabó antes", () => {
    const ko = buildFightHeadline({
      ...SOUSA_MIRANDA,
      method: "KO/TKO - Punches",
      endRound: 2,
    });
    expect(ko?.note).toBe(
      "Miranda lo tuvo sujeto un minuto más y aun así perdió: Sousa lo acabó en el asalto 2.",
    );
    const sub = buildFightHeadline({
      ...SOUSA_MIRANDA,
      method: "SUB - Armbar",
      endRound: 1,
    });
    expect(sub?.note).toContain("Sousa lo acabó en el asalto 1.");
  });

  it("no dice «lo acabó» de una descalificación", () => {
    // 23 combates de la base acaban en DQ. Nadie remató a nadie: lo acabó el
    // árbitro. "Lo acabó Sousa" sería un hecho falso.
    const dq = buildFightHeadline({ ...SOUSA_MIRANDA, method: "DQ" });
    expect(dq?.note).toBe(
      "Miranda lo tuvo sujeto un minuto más y aun así perdió: ganó Sousa.",
    );
  });

  it("cambia de nota cuando el que más sujetó SÍ ganó", () => {
    // 4.387 combates. Aquí no hay contradicción que explicar, así que la nota
    // no niega nada: dice qué cuenta el gráfico y quién decidió el combate.
    const h = buildFightHeadline({ ...SOUSA_MIRANDA, winner: "blue" });
    expect(h?.note).toBe(
      "Esto cuenta dónde se peleó el combate: agarrados o de pie. Quién ganó lo decidieron los jueces.",
    );
  });

  it("no habla de jueces si el combate no llegó a los jueces", () => {
    const h = buildFightHeadline({
      ...SOUSA_MIRANDA,
      winner: "blue",
      method: "KO/TKO - Punches",
      endRound: 2,
    });
    expect(h?.note).toBe(
      "Esto cuenta dónde se peleó el combate: agarrados o de pie. Miranda lo acabó en el asalto 2.",
    );
  });

  it("no reparte culpas en un combate sin ganador", () => {
    // 156 combates disputados no tienen ganador: 64 empates y 92 anulados.
    // Ni "perdió" ni "ganó" caben, y la regla de la casa es que el desenlace
    // se decide en un solo sitio.
    const h = buildFightHeadline({ ...SOUSA_MIRANDA, winner: null, method: "M-DEC" });
    expect(h?.note).toBe(
      "Esto cuenta dónde se peleó el combate: agarrados o de pie.",
    );
  });

  it("usa la otra plantilla cuando no hay diferencia que contar", () => {
    // Umbral §5: por debajo de 30 s de diferencia la plantilla A mentiría por
    // énfasis. Son 2.310 combates de 8.612. 215 - 200 = 15 s.
    const h = buildFightHeadline({
      ...SOUSA_MIRANDA,
      redControlSeconds: 200,
      blueControlSeconds: 215,
    });
    // Sin diferencia que contar, el titular dice el hecho principal.
    // 415/900 = 46,1 % -> 46 %.
    expect(h?.headline).toBe("El 46 % del combate se peleó agarrado");
    // Y el subtítulo enuncia los dos tiempos SIN juzgar si se parecen: decir
    // "casi lo mismo" era un juicio que se rompía con repartos de 7 a 1.
    expect(h?.subhead).toBe("Sousa lo tuvo sujeto 3:20 y Miranda 3:35.");
  });

  it("cuenta el combate en el que nadie sujetó a nadie", () => {
    // 167 combates de 8.612. 12845 Garbrandt-Yanez, KO en el primero a 2:47.
    const h = buildFightHeadline({
      redName: "Cody Garbrandt",
      blueName: "Adrian Yanez",
      redControlSeconds: 0,
      blueControlSeconds: 0,
      fightSeconds: 167,
      winner: "red",
      method: "KO/TKO - Punches",
      endRound: 1,
    });
    // Sin número de minutos: con un KO en el primer minuto la plantilla con
    // cifra imprimía "en los 1 minutos".
    expect(h?.headline).toBe("Nadie sujetó a nadie en todo el combate");
    expect(h?.subhead).toBe(
      "Los dos pelearon sin llegar a sujetarse ni un segundo.",
    );
    // Sin agarre no hay segundo denominador: la frase entera desaparece.
    expect(h?.grappledLine).toBeNull();
  });

  it("calla entero si falta el nombre de alguna esquina", () => {
    // Sin nombre, el titular sería "lo tuvo sujeto un minuto más que " — una
    // frase cortada a mitad. Mejor no publicar nada: es la misma regla que el
    // ratio sin denominador.
    expect(buildFightHeadline({ ...SOUSA_MIRANDA, redName: null })).toBeNull();
    expect(buildFightHeadline({ ...SOUSA_MIRANDA, blueName: null })).toBeNull();
    expect(buildFightHeadline({ ...SOUSA_MIRANDA, redName: "" })).toBeNull();
    expect(buildFightHeadline({ ...SOUSA_MIRANDA, blueName: "   " })).toBeNull();
  });

  it("calla entero cuando no hay dato de agarre", () => {
    // 374 filas del acta tienen el control a NULL. Sin dato no hay titular:
    // el bloque no se pinta.
    expect(
      buildFightHeadline({ ...SOUSA_MIRANDA, redControlSeconds: null }),
    ).toBeNull();
    expect(
      buildFightHeadline({ ...SOUSA_MIRANDA, blueControlSeconds: null }),
    ).toBeNull();
    expect(
      buildFightHeadline({ ...SOUSA_MIRANDA, fightSeconds: null }),
    ).toBeNull();
  });

  it("no usa ni una palabra de veredicto", () => {
    // Regla 6, y la lista de prohibidas de §5. ESPN no distingue montada de
    // valla y quien ataca desde abajo sale a cero: cualquier verbo de mando
    // sería una conclusión que el dato no sostiene.
    const casos: HeadlineInput[] = [
      SOUSA_MIRANDA,
      { ...SOUSA_MIRANDA, winner: "blue" },
      { ...SOUSA_MIRANDA, method: "S-DEC" },
      { ...SOUSA_MIRANDA, method: "DQ" },
      { ...SOUSA_MIRANDA, redControlSeconds: 200, blueControlSeconds: 215 },
      { ...SOUSA_MIRANDA, redControlSeconds: 0, blueControlSeconds: 0 },
    ];
    const prohibidas = [
      "mandó", "dominó", "ventaja", "controló", "control",
      "peleando de pie", "falló",
    ];
    for (const caso of casos) {
      const h = buildFightHeadline(caso);
      const texto = [h?.headline, h?.subhead, h?.grappledLine, h?.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      for (const palabra of prohibidas) {
        expect(texto).not.toContain(palabra);
      }
    }
  });

  it("mantiene el rojo a la izquierda en la frase de los dos lados", () => {
    // Invariante 1. En la plantilla B los dos tiempos van en orden rojo, azul:
    // si alguien "mejora" el orden, la frase deja de casar con la barra.
    const h = buildFightHeadline({
      ...SOUSA_MIRANDA,
      redControlSeconds: 200,
      blueControlSeconds: 215,
    });
    const rojo = h?.subhead.indexOf("3:20") ?? -1;
    const azul = h?.subhead.indexOf("3:35") ?? -1;
    expect(rojo).toBeGreaterThan(-1);
    expect(azul).toBeGreaterThan(rojo);
  });

  // Los diez de las DOS revisiones adversariales del 9-ago, cada uno con el
  // combate real que lo destapó. Los cinco primeros salieron de la ronda 1 y
  // los cinco últimos de la ronda 2, contra el código ya parcheado: por eso
  // el tercer intento no fue otro parche sino un rediseño.
  describe("los diez de las revisiones adversariales", () => {
    const conCifras = (red: number, blue: number, dur: number) =>
      buildFightHeadline({
        ...SOUSA_MIRANDA,
        redControlSeconds: red,
        blueControlSeconds: blue,
        fightSeconds: dur,
      });

    it("R1·1 — no llama «casi todo» a un tercio del combate", () => {
      // 🪤 452 combates entraban en esa rama y en 287 era FALSO; el peor
      // publicaba «casi todo el combate se peleó agarrado» con un 3,4 % de
      // agarre. Ya no existe esa rama: el porcentaje lo dice y punto.
      //
      // 8031 Dan Hooker vs Mark Eddiva: 13 + 17 = 30 s de 84 = 35,7 % -> 36 %.
      expect(conCifras(13, 17, 84)?.headline).toBe(
        "El 36 % del combate se peleó agarrado",
      );
      // 3262 Louie Sutherland vs Valter Walker: 31 s de 84 = 36,9 % -> 37 %.
      expect(conCifras(0, 31, 84)?.subhead).toBe(
        "El 37 % del combate se peleó agarrado.",
      );
      // 4038 Sodiq Yusuff vs Diego Lopes: 34 s de 89 = 38,2 % -> 38 %.
      expect(conCifras(0, 34, 89)?.subhead).toBe(
        "El 38 % del combate se peleó agarrado.",
      );
      // 3338 Crosbie vs Nueraji: 199 s de 213. Por resto mayor el reparto es
      // 4 + 6 + 90, así que el agarre publicado es 4 + 90 = 94 y cuadra con las
      // dos cifras de la barra.
      expect(conCifras(8, 191, 213)?.subhead).toBe(
        "El 94 % del combate se peleó agarrado.",
      );
    });

    it("R1·2 — no dice «el 100 %» si el otro llegó a sujetar", () => {
      // 🪤 91 combates. 11212 Randy Couture (846 s) vs Vitor Belfort (1 s):
      // 846/847 = 99,88 %, que redondea a 100. "El 100 %" es una afirmación
      // absoluta: dice que Belfort estuvo a cero, y estuvo a un segundo.
      expect(conCifras(846, 1, 900)?.grappledLine).toContain("99 %");
      expect(conCifras(846, 1, 900)?.grappledLine).not.toContain("100 %");
      // 10514 Sonnen (831) vs Miller (1); 9191 Velasquez (1043) vs Dos Santos (2).
      expect(conCifras(831, 1, 900)?.grappledLine).not.toContain("100 %");
      expect(conCifras(1043, 2, 1389)?.grappledLine).not.toContain("100 %");
      // Y el 100 % legítimo se queda: 2.433 combates donde el otro SÍ estuvo
      // a cero. Ese cero está medido y se publica.
      expect(conCifras(506, 0, 1361)?.grappledLine).toContain("100 %");
    });

    it("R1·3 y R2·1 — no quedan cifras de minutos que concordar", () => {
      // 🪤 1.066 combates decían «1 de los 15 minutos se pelearon agarrados»
      // (singular con verbo plural). Y el parche movió el fallo: 30 s pasaron
      // a publicarse como «Casi un minuto de los 15», el doble de lo real.
      // El porcentaje no tiene singular ni plural que romper.
      const texto = (r: number, b: number, d: number) => {
        const h = conCifras(r, b, d);
        return `${h?.headline} · ${h?.subhead}`;
      };
      expect(texto(30, 30, 900)).not.toMatch(/\d+ de los \d+ minutos/);
      expect(texto(30, 30, 900)).not.toContain("Casi un minuto");
      // 30 + 30 = 60 s de agarre en 900 = 6,67 % -> 7 %.
      expect(conCifras(30, 30, 900)?.headline).toBe(
        "El 7 % del combate se peleó agarrado",
      );
      // Y el caso que antes decía «Casi un minuto de los 15»: 15 + 15 = 30 s
      // de 900 = 3,3 %. Medio minuto llamado «casi un minuto» era el doble.
      expect(conCifras(15, 15, 900)?.headline).toBe(
        "El 3 % del combate se peleó agarrado",
      );
    });

    it("R1·4 y R2·2 — no juzga si los dos sujetaron «lo mismo»", () => {
      // 🪤 1.083 combates decían «Los dos sujetaron casi lo mismo: 0:00 y
      // 0:20» con uno a cero. El parche tapó SOLO el cero exacto, y la ronda 2
      // encontró el combate 6819 Kattar (5 s) vs Fishgold (33 s), donde la
      // misma frase convivía con «Fishgold se llevó el 87 %».
      // Ahora el subtítulo solo enuncia los dos tiempos: un hecho no se puede
      // contradecir con otro hecho.
      const kattar = buildFightHeadline({
        ...SOUSA_MIRANDA,
        redName: "Calvin Kattar",
        blueName: "Chris Fishgold",
        redControlSeconds: 5,
        blueControlSeconds: 33,
        fightSeconds: 251,
      });
      expect(kattar?.subhead).toBe("Kattar lo tuvo sujeto 0:05 y Fishgold 0:33.");
      expect(kattar?.subhead).not.toContain("casi lo mismo");
      expect(conCifras(0, 20, 900)?.subhead).toBe(
        "Sousa lo tuvo sujeto 0:00 y Miranda 0:20.",
      );
    });

    it("R1·5 — no publica más duración de la que tuvo el combate", () => {
      // 🪤 2.383 combates. Un combate de 14:31 salía como «de los 15 minutos»,
      // y 15 minutos es justo lo que dura uno completo. Ya no se publica
      // ninguna duración en minutos: el porcentaje la lleva dentro.
      const h = conCifras(169, 231, 871); // 14:31
      expect(`${h?.headline} ${h?.subhead}`).not.toContain("minutos");
      // 400/871 = 45,9 % -> 46 %.
      expect(h?.subhead).toBe("El 46 % del combate se peleó agarrado.");
    });

    it("R2·4 — la diferencia nunca es mayor que el combate", () => {
      // 🪤 Con 45 s de diferencia en un combate de 57 s salía «lo tuvo sujeto
      // un minuto más» (grappleGapWords redondea 45 al alza) junto a «se
      // pelearon agarrados menos de un minuto». Imposibles a la vez. Cuando el
      // redondeo se pasa de la duración real, se dice el reloj exacto.
      const corto = conCifras(45, 0, 57);
      expect(corto?.headline).toBe("Sousa lo tuvo sujeto 0:45 más que Miranda");
      expect(corto?.headline).not.toContain("un minuto");
      // Y en un combate largo la palabra se queda: 62 s de 900.
      expect(conCifras(231, 169, 900)?.headline).toBe(
        "Sousa lo tuvo sujeto un minuto más que Miranda",
      );
    });

    it("R2·5 — el mismo número no recibe dos nombres distintos", () => {
      // 🪤 3312 Andre Petroski (0 s) vs Cam Rowston (36 s), 161 s: los mismos
      // 36 segundos eran «medio minuto» en el titular, «casi un minuto» en el
      // subtítulo y «0:36» en la tercera línea. Tres escalas para un número.
      const h = buildFightHeadline({
        ...SOUSA_MIRANDA,
        redName: "Andre Petroski",
        blueName: "Cam Rowston",
        redControlSeconds: 0,
        blueControlSeconds: 36,
        fightSeconds: 161,
      });
      expect(h?.headline).toBe("Rowston lo tuvo sujeto medio minuto más que Petroski");
      // 36/161 = 22,4 % -> 22 %. Ninguna otra escala en juego.
      expect(h?.subhead).toBe("El 22 % del combate se peleó agarrado.");
      expect(h?.subhead).not.toContain("minuto");
    });

    it("el agarre que no llega al 1 % no se publica como 0 %", () => {
      // Un porcentaje de 0 sobre un agarre que existe sería el mismo error que
      // los 568 medidores: un cero que no es un cero.
      // 2 s de 900 = 0,22 %. La diferencia es de 2 s, así que no hay historia
      // que contar y el porcentaje ocupa el titular.
      // Ya no hace falta la fórmula «Menos del 1 %»: el reparto por resto mayor
      // le da ese punto a la parte con segundos medidos, así que el porcentaje
      // publicado es 1 y nunca 0. La guarda vive ahora en el reparto, que es
      // donde se decide, y no en la frase que lo cuenta.
      const h = conCifras(2, 0, 900);
      expect(h?.headline).toBe("El 1 % del combate se peleó agarrado");
      expect(h?.headline).not.toContain("El 0 %");
      // Y en el subtítulo, cuando la diferencia sí da titular: 40 s contra 0.
      const conTitular = conCifras(40, 0, 9000);
      expect(conTitular?.subhead).toBe("El 1 % del combate se peleó agarrado.");
    });

    it("R3·1 — el titular y la nota nombran igual el mismo hueco", () => {
      // 🪤 El guardarraíl del reloj se puso en el titular y se olvidó en la
      // nota, que seguía llamando a grappleGapWords en crudo. Combate 5117
      // real: Krylov (rojo, 229 s) vs Craig (azul, 2 s) en 237 s. La nota
      // decía «cuatro minutos más» — 240 s en un combate de 237.
      const h = buildFightHeadline({
        redName: "Nikita Krylov",
        blueName: "Paul Craig",
        redControlSeconds: 229,
        blueControlSeconds: 2,
        fightSeconds: 237,
        winner: "blue",
        method: "SUB - Triangle Choke",
        endRound: 1,
      });
      expect(h?.headline).toBe("Krylov lo tuvo sujeto 3:47 más que Craig");
      expect(h?.note).toBe(
        "Krylov lo tuvo sujeto 3:47 más y aun así perdió: Craig lo acabó en el asalto 1.",
      );
      expect(h?.note).not.toContain("cuatro minutos");
    });

    it("R3·2 — la diferencia no puede pasar del agarre total", () => {
      // 🪤 El techo se comparaba contra la duración del COMBATE, y el techo
      // real es el AGARRE: la diferencia sale de ahí. 801 combates de la base
      // declaraban una diferencia mayor que todo el tiempo agarrado.
      //
      // 11949 Ruffy (45 s) vs Fiziev (0 s) en 570 s: «un minuto más» sobre un
      // agarre total de 0:45. Con el techo viejo (570 s) no saltaba.
      const ruffy = buildFightHeadline({
        ...SOUSA_MIRANDA,
        redControlSeconds: 45,
        blueControlSeconds: 0,
        fightSeconds: 570,
      });
      expect(ruffy?.headline).toBe("Sousa lo tuvo sujeto 0:45 más que Miranda");
      // 7714 Stewart (75 s) vs Barroso (0 s) en 94 s: la palabra implica 90 s,
      // que cabe en el combate pero no en los 75 s de agarre.
      const stewart = buildFightHeadline({
        ...SOUSA_MIRANDA,
        redControlSeconds: 75,
        blueControlSeconds: 0,
        fightSeconds: 94,
      });
      expect(stewart?.headline).toBe("Sousa lo tuvo sujeto 1:15 más que Miranda");
      // Y con agarre de sobra la palabra se queda: 14232, gap 62 de 400.
      expect(buildFightHeadline(SOUSA_MIRANDA)?.headline).toBe(
        "Miranda lo tuvo sujeto un minuto más que Sousa",
      );
    });

    it("BARRIDO — ninguna salida se contradice a sí misma", () => {
      // La comprobación que ninguna de las anteriores hace sola: recorrer el
      // espacio de duraciones y repartos y exigir que titular, subtítulo,
      // regla 5 y nota puedan leerse seguidos sin desmentirse.
      let casos = 0;
      for (let dur = 25; dur <= 1500; dur += 7) {
        for (const cuanto of [0, 0.003, 0.05, 0.22, 0.36, 0.5, 0.79, 0.93, 1]) {
          for (const reparto of [0, 0.03, 0.5, 0.97, 1]) {
            const agarre = Math.min(dur, Math.round(dur * cuanto));
            const red = Math.round(agarre * reparto);
            const blue = agarre - red;
            const h = conCifras(red, blue, dur);
            if (!h) continue;
            casos += 1;
            const todo = [h.headline, h.subhead, h.grappledLine, h.note]
              .filter(Boolean)
              .join(" · ");
            const ctx = `dur=${dur} red=${red} blue=${blue}`;

            // Nada sin rellenar.
            expect(todo, ctx).not.toContain("undefined");
            expect(todo, ctx).not.toContain("NaN");
            expect(todo, ctx).not.toContain("null");
            // Ni una cifra de minutos suelta: era la fuente de las dos escalas.
            expect(todo, ctx).not.toMatch(/\d+ de los \d+ minutos/);
            expect(todo, ctx).not.toMatch(/\blos [01] minutos\b/);
            // "El 100 %" exige que el otro esté a cero de verdad.
            if (todo.includes("el 100 %")) {
              expect(Math.min(red, blue), ctx).toBe(0);
            }
            // Un porcentaje del combate que se publique tiene que cuadrar con
            // el agarre real, con 1 punto de margen por el redondeo.
            const m = todo.match(/El (\d+) % del combate/);
            if (m) {
              const pct = Number(m[1]);
              expect(Math.abs(pct - (agarre / dur) * 100), ctx).toBeLessThan(1);
              expect(pct, ctx).toBeGreaterThan(0);
            }
            // La diferencia declarada no puede superar el AGARRE total: sale
            // de ahí, no del combate. Vale para el titular y para la nota.
            const relojes = todo.match(/sujeto (\d+):(\d\d) más/g) ?? [];
            for (const r of relojes) {
              const [, mm, ss] = r.match(/(\d+):(\d\d)/) ?? [];
              expect(Number(mm) * 60 + Number(ss), ctx).toBeLessThanOrEqual(agarre);
            }
            // Y el mismo hueco no puede tener dos nombres: si el titular usa
            // el reloj, la nota también.
            if (/sujeto \d+:\d\d más que/.test(todo) && h.note) {
              expect(h.note, ctx).not.toMatch(
                /sujeto (medio minuto|un minuto|minuto y medio|\w+ minutos?)/,
              );
            }
          }
        }
      }
      expect(casos).toBeGreaterThan(2000);
    });
  });
});
