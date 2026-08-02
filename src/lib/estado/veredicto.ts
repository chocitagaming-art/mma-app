// EL VEREDICTO: convierte los números crudos de la base en "esto está bien" o
// "esto está roto". Puro y sin dependencias, para que lo prueben los tests y no
// haga falta una velada de verdad para saber si el panel dice la verdad.
//
// POR QUÉ EXISTE ESTE FICHERO. El 1-ago-2026 la velada del evento 1063 se grabó
// entera en blanco y los 35 crons del repo terminaron en verde toda la tarde.
// No falló nada: no se lanzó nada, y un workflow que no arranca no falla. La
// única forma de detectar eso es dejar de preguntar "¿ha fallado alguien?" y
// empezar a preguntar "¿está el dato donde debería estar?". Eso es esto.

export type Nivel = "ok" | "aviso" | "mal";

export type Comprobacion = {
  /** Qué se ha mirado, en una línea y en cristiano. */
  titulo: string;
  nivel: Nivel;
  /** El dato desnudo: "14/14", "0 de ~300". Sin adornos. */
  valor: string;
  /** Solo cuando hay algo que hacer. Qué significa y qué toca. */
  detalle?: string;
};

export type Bloque = {
  titulo: string;
  subtitulo?: string;
  comprobaciones: Comprobacion[];
};

// El nivel de un conjunto es el del peor de sus miembros: un panel que dice
// "todo bien" porque hace la media es peor que no tener panel.
export function peorNivel(niveles: Nivel[]): Nivel {
  if (niveles.includes("mal")) return "mal";
  if (niveles.includes("aviso")) return "aviso";
  return "ok";
}

// ---------------------------------------------------------------------------
// La velada que acaba de pasar: ¿quedó completa?
// ---------------------------------------------------------------------------

export type DatosVelada = {
  combatesActivos: number;
  combatesConGanador: number;
  muestrasPelicula: number;
  filasPorAsalto: number;
  pesajes: number;
  tieneCareo: boolean;
  /** Horas desde que terminó el estelar. Decide qué es exigible ya y qué no. */
  horasDesdeElFinal: number;
};

// Una velada normal deja unas 300 muestras (el 1062 hizo 345). Por debajo de 50
// no es "pocas": es que el bucle no estuvo vivo casi nada.
export const MUESTRAS_ESPERADAS = 250;
const MUESTRAS_MINIMAS = 50;

// Margen antes de exigir el desglose por asaltos: no lo escribe ESPN en directo,
// sino la consolidación posterior contra ufcstats, que puede tardar.
const HORAS_PARA_EXIGIR_ASALTOS = 20;

// Cuánto tiempo tiene sentido decir que la película "todavía se puede salvar".
// Se mide desde el comienzo del ESTELAR, y una cartelera completa rara vez pasa
// de cinco horas desde ahí. Pasado eso, ESPN ya no emite nada en vivo de esa
// velada y relanzar el bucle no recupera ni una muestra.
//
// Empezó valiendo 20 h, reutilizando el umbral de los asaltos, y estaba MAL: a
// las tres horas de acabar el 1063 ya no había nada que salvar y el panel
// seguía en rojo, lo que habría tenido al guardián avisando toda la noche de
// algo sin remedio. Se vio mirando el panel real, no razonándolo.
const HORAS_PARA_SALVAR_LA_PELICULA = 5;

export function comprobarVelada(d: DatosVelada): Comprobacion[] {
  const out: Comprobacion[] = [];

  // 1. Resultados. Es lo primero que se nota y lo que más molesta si falta.
  const faltan = d.combatesActivos - d.combatesConGanador;
  out.push({
    titulo: "Resultados",
    valor: `${d.combatesConGanador}/${d.combatesActivos}`,
    nivel: d.combatesActivos === 0 ? "aviso" : faltan === 0 ? "ok" : "mal",
    detalle:
      d.combatesActivos === 0
        ? "La cartelera no tiene combates cargados."
        : faltan > 0
          ? `Faltan ${faltan}. Lanzar «Live results (ESPN)» a mano lo arregla en un minuto.`
          : undefined,
  });

  // 2. La película. Es el único dato IRRECUPERABLE: se capta durante el combate
  // o no existe.
  //
  // Y POR ESO MISMO DEJA DE SER ROJO PASADAS UNAS HORAS. Rojo significa "hay
  // algo que hacer", y es lo que despierta al guardián: mientras la velada
  // acaba de terminar todavía se puede relanzar el bucle y salvar lo que queda,
  // pero al día siguiente ya no hay nada que salvar. Dejarlo en rojo para
  // siempre pondría al guardián a avisar cada hora de un desastre que ya no
  // tiene remedio, y una alerta que salta siempre es una alerta que se deja de
  // leer — con lo cual tampoco se lee la que sí importa. El dato se sigue
  // enseñando, que es distinto de alarmar por él.
  const puedeSalvarse = d.horasDesdeElFinal < HORAS_PARA_SALVAR_LA_PELICULA;
  const peliculaIncompleta = d.muestrasPelicula < MUESTRAS_MINIMAS;
  out.push({
    titulo: "Película del combate",
    valor: `${d.muestrasPelicula} muestras`,
    nivel:
      d.muestrasPelicula >= MUESTRAS_ESPERADAS
        ? "ok"
        : peliculaIncompleta && puedeSalvarse
          ? "mal"
          : "aviso",
    detalle: peliculaIncompleta
      ? puedeSalvarse
        ? `Esperadas ~${MUESTRAS_ESPERADAS}. Aún se puede salvar lo que queda: relanzar «Live event loop» ahora.`
        : `Esperadas ~${MUESTRAS_ESPERADAS}. Se perdió y no se recupera: la serie se capta en directo o no existe.`
      : d.muestrasPelicula < MUESTRAS_ESPERADAS
        ? `Por debajo de las ~${MUESTRAS_ESPERADAS} habituales: el bucle no estuvo vivo toda la velada.`
        : undefined,
  });

  // 3. Estadísticas por asalto. Llegan tarde por diseño, así que solo se exigen
  // pasado el plazo — si no, el panel estaría en rojo cada sábado por la noche
  // sin que pase nada malo, y un panel que cría lobos se deja de mirar.
  const asaltosTarde = d.horasDesdeElFinal >= HORAS_PARA_EXIGIR_ASALTOS;
  out.push({
    titulo: "Estadísticas por asalto",
    valor: d.filasPorAsalto > 0 ? `${d.filasPorAsalto} filas` : "todavía no",
    nivel: d.filasPorAsalto > 0 ? "ok" : asaltosTarde ? "mal" : "aviso",
    detalle:
      d.filasPorAsalto > 0
        ? undefined
        : asaltosTarde
          ? "Ya deberían estar. Mirar «Consolidate results (post-event)»."
          : "Las trae la consolidación posterior; es normal que aún no estén.",
  });

  // 4. Pesajes. Dos filas por combate (una por esquina).
  const pesajesEsperados = d.combatesActivos * 2;
  out.push({
    titulo: "Pesajes",
    valor: `${d.pesajes}/${pesajesEsperados}`,
    nivel: d.pesajes === 0 ? "mal" : d.pesajes >= pesajesEsperados ? "ok" : "aviso",
    detalle:
      d.pesajes === 0
        ? "Ni una fila. Este cron falla EN VERDE cuando no encuentra el artículo."
        : undefined,
  });

  // 5. Careo. Ni urgente ni grave, pero es lo que se ve en la ficha del evento.
  out.push({
    titulo: "Vídeo del careo",
    valor: d.tieneCareo ? "sí" : "no",
    nivel: d.tieneCareo ? "ok" : "aviso",
    detalle: d.tieneCareo
      ? undefined
      : "Si la sede tiene una `location` rara, el matcher no lo encuentra.",
  });

  return out;
}

// ---------------------------------------------------------------------------
// La velada que viene: ¿está armado el sistema para grabarla?
// ---------------------------------------------------------------------------

export type DatosProxima = {
  combatesActivos: number;
  /** Con `prelims_time` y `early_prelims_time` a NULL, el arranque se deduce. */
  tieneHorarioDeLosPrelims: boolean;
  tieneHoraDeEstelar: boolean;
  /** Luchadores de la cartelera sin foto de cuerpo entero. */
  sinFoto: number;
  /** Esquinas de la cartelera SIN ficha en `fighters`: ni foto, ni historial. */
  sinFicha: number;
  /** Esquinas totales de la cartelera activa (2 por combate). */
  luchadores: number;
  /** Días que faltan. Lo que es tolerable a diez días no lo es a dos. */
  diasQueFaltan: number;
};

// A partir de aquí una cartelera incompleta deja de ser normal y pasa a ser un
// problema: ya no da tiempo a que los automatismos semanales la completen.
const DIAS_PARA_EXIGIR = 3;

export function comprobarProxima(d: DatosProxima): Comprobacion[] {
  const inminente = d.diasQueFaltan <= DIAS_PARA_EXIGIR;
  const out: Comprobacion[] = [];

  out.push({
    titulo: "Cartelera",
    valor: `${d.combatesActivos} combates`,
    nivel: d.combatesActivos > 0 ? "ok" : inminente ? "mal" : "aviso",
    detalle: d.combatesActivos === 0 ? "Sin combates cargados todavía." : undefined,
  });

  // La hora del estelar es lo que NO puede faltar: de ella se deduce todo lo
  // demás, incluida la hora a la que el centinela arranca el directo.
  out.push({
    titulo: "Hora del estelar",
    valor: d.tieneHoraDeEstelar ? "sí" : "NO",
    nivel: d.tieneHoraDeEstelar ? "ok" : "mal",
    detalle: d.tieneHoraDeEstelar
      ? undefined
      : "Sin ella el centinela no sabe cuándo despertar y la velada no se graba.",
  });

  // Que falte es lo NORMAL (los 7 eventos futuros lo tienen a NULL), así que
  // nunca es rojo: solo se avisa de que el arranque se calcula restando 4 h.
  out.push({
    titulo: "Hora de los preliminares",
    valor: d.tieneHorarioDeLosPrelims ? "sí" : "se deduce",
    nivel: d.tieneHorarioDeLosPrelims ? "ok" : "aviso",
    detalle: d.tieneHorarioDeLosPrelims
      ? undefined
      : "Sin dato, el arranque se calcula como «estelar − 4 h». Suele acertar.",
  });

  // Una esquina sin ficha en `fighters` NO es solo una foto que falta: el bucle
  // en vivo resuelve los luchadores contra esa tabla, asi que ese combate NO SE
  // ESCRIBE durante la velada — y el job termina en VERDE, sin error. Por eso
  // va en su propia linea y no escondido dentro del contador de fotos, que es
  // justo donde estuvo invisible hasta el 2-ago.
  out.push({
    titulo: "Luchadores con ficha",
    valor: `${d.luchadores - d.sinFicha}/${d.luchadores}`,
    nivel: d.sinFicha === 0 ? "ok" : inminente ? "mal" : "aviso",
    detalle:
      d.sinFicha > 0
        ? `${d.sinFicha} sin ficha. Su combate no se registrara en directo (el bucle empareja por nombre contra la tabla de luchadores) y ademas sale en verde. Se crean con 'add_manual_fighter'.`
        : undefined,
  });

  // El que no tiene ficha tampoco tiene foto: cuenta en los dos sitios a
  // proposito, para que el numero no mienta por defecto.
  const sinFotoTotal = d.sinFoto + d.sinFicha;
  out.push({
    titulo: "Fotos de los que pelean",
    valor: `${d.luchadores - sinFotoTotal}/${d.luchadores}`,
    nivel: sinFotoTotal === 0 ? "ok" : inminente ? "mal" : "aviso",
    detalle:
      sinFotoTotal > 0
        ? `${sinFotoTotal} sin foto de cuerpo entero. Si ufc.com no tiene ficha suya, hay que meterla a mano.`
        : undefined,
  });

  return out;
}

// ---------------------------------------------------------------------------
// Los automatismos: ¿sigue entrando dato nuevo?
// ---------------------------------------------------------------------------

export type DatosFrescura = {
  /** Horas desde la última noticia publicada. Cron cada 8 h aprox. */
  horasDesdeNoticia: number;
  /** Horas desde el último luchador tocado. Hay pases a diario. */
  horasDesdeLuchador: number;
  /** Horas desde el último combate tocado. */
  horasDesdeCombate: number;
};

// Se mide EL EFECTO, no el proceso. Preguntarle a GitHub "¿corrió el cron?" es
// justo lo que falló el 1-ago: los 35 workflows salieron en verde y el dato no
// estaba. Un cron que corre y no escribe nada es indistinguible de uno que no
// corre — salvo mirando el dato, que es lo que se hace aquí.
//
// Los umbrales son generosos a propósito: el scheduler de GitHub sirve los
// crons con 1h45-2h55 de retraso medido, así que apretar solo daría falsas
// alarmas. Se busca cazar "esto lleva DÍAS parado", no "hoy llegó tarde".
const HORAS_NOTICIAS = { aviso: 24, mal: 72 };
const HORAS_LUCHADORES = { aviso: 48, mal: 120 };
const HORAS_COMBATES = { aviso: 72, mal: 168 };

function porFrescura(
  horas: number,
  umbral: { aviso: number; mal: number },
): Nivel {
  if (horas >= umbral.mal) return "mal";
  if (horas >= umbral.aviso) return "aviso";
  return "ok";
}

function comoHace(horas: number): string {
  if (horas < 1) return "hace minutos";
  if (horas < 48) return `hace ${Math.round(horas)} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

export function comprobarFrescura(d: DatosFrescura): Comprobacion[] {
  return [
    {
      titulo: "Noticias",
      valor: comoHace(d.horasDesdeNoticia),
      nivel: porFrescura(d.horasDesdeNoticia, HORAS_NOTICIAS),
      detalle:
        d.horasDesdeNoticia >= HORAS_NOTICIAS.mal
          ? "Llevan días sin entrar. Mirar «Refresh news»."
          : undefined,
    },
    {
      titulo: "Fichas de luchadores",
      valor: comoHace(d.horasDesdeLuchador),
      nivel: porFrescura(d.horasDesdeLuchador, HORAS_LUCHADORES),
      detalle:
        d.horasDesdeLuchador >= HORAS_LUCHADORES.mal
          ? "Ningún pase de enriquecimiento está escribiendo (fotos, récords, datos)."
          : undefined,
    },
    {
      titulo: "Combates",
      valor: comoHace(d.horasDesdeCombate),
      nivel: porFrescura(d.horasDesdeCombate, HORAS_COMBATES),
      detalle:
        d.horasDesdeCombate >= HORAS_COMBATES.mal
          ? "Ni resultados ni carteleras nuevas. Mirar «Refresh upcoming events»."
          : undefined,
    },
  ];
}

// ---------------------------------------------------------------------------
// El turno de guardia: quién trabaja solo mientras no hay nadie delante.
// ---------------------------------------------------------------------------

export type DatosGuardia = {
  /** Hora UTC a la que el centinela arrancará el directo, o null si no hay velada. */
  arranqueDelDirectoUtc: string | null;
  /** Horas que faltan para ese arranque. */
  horasHastaElArranque: number | null;
  /** ¿Se está celebrando una velada ahora mismo? */
  veladaEnMarcha: boolean;
  /** Muestras entradas en la última hora (solo importa con velada en marcha). */
  muestrasUltimaHora: number;
};

// El centinela arranca 15 minutos antes del primer combate (ADELANTO_MINUTOS en
// scripts/live_sentinel.py). Se replica aquí para poder ENSEÑAR la hora, que es
// el dato que no existía en ningún sitio: hasta ahora, saber a qué hora iba a
// arrancar el directo exigía leerse el script y hacer la cuenta a mano.
const ADELANTO_MINUTOS = 15;

// El censo, contado el 1-ago-2026: 36 workflows en mma-ingesta más 2 en mma-app
// (integración continua y smoke de producción). 27 tienen cron propio. Los 9
// restantes se llaman a mano o los llama otro, y eso es correcto: cuatro son
// herramientas de rescate, dos son pruebas del canal de avisos, y el bucle y la
// captura NO deben tener cron — un cron ciego ahí expulsa al relevo en cola.
const AUTOMATISMOS_TOTALES = 38;
const AUTOMATISMOS_CON_HORARIO = 27;

function horaCorta(iso: string | null): string {
  if (!iso) return "—";
  // Hora de Madrid, que es la que usa quien mira esto, no UTC.
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function comprobarGuardia(d: DatosGuardia): Comprobacion[] {
  const out: Comprobacion[] = [];

  // 1. El centinela: el que abre la sala.
  const arranque = d.arranqueDelDirectoUtc
    ? new Date(new Date(d.arranqueDelDirectoUtc).getTime() - ADELANTO_MINUTOS * 60_000).toISOString()
    : null;
  // El nombre de puesto explica QUÉ hace; el técnico, entre paréntesis, es el
  // que hace falta para ir a buscarlo cuando algo se rompe. Sin el segundo, la
  // metáfora sería un adorno que estorba a las tres de la mañana.
  out.push({
    titulo: "Centinela · abre la sala (live-sentinel)",
    valor: arranque ? horaCorta(arranque) : "sin velada",
    // Nunca es rojo: que no haya velada esta semana no es un fallo. Lo que sí
    // sería un fallo es no tener hora de estelar, y eso ya lo dice su propia
    // fila en el bloque de la próxima velada.
    nivel: "ok",
    detalle: arranque
      ? `Despierta cada hora. Cuando falten ${ADELANTO_MINUTOS} min lanzará el bucle y la captura, sin que nadie haga nada.`
      : "Despierta cada hora. No hay ninguna velada en su ventana de 5 h.",
  });

  // 2. El watchdog: el que mira que la cámara esté grabando.
  out.push({
    titulo: "Vigilante · comprueba que se graba (live-watchdog)",
    valor: d.veladaEnMarcha ? `${d.muestrasUltimaHora} en 1 h` : "en reposo",
    nivel: d.veladaEnMarcha && d.muestrasUltimaHora === 0 ? "mal" : "ok",
    detalle: d.veladaEnMarcha
      ? d.muestrasUltimaHora === 0
        ? "VELADA EN MARCHA Y NO ENTRAN MUESTRAS. Debería estar relanzando el bucle ahora mismo."
        : "Velada en marcha y entrando dato. Todo correcto."
      : "Cada hora comprueba si hay velada sin grabar. Si la hay, relanza el bucle él solo.",
  });

  // 3. El bucle: el cámara. No tiene horario propio a propósito — lo llaman.
  out.push({
    titulo: "Cámara · graba el combate (live-event-loop)",
    valor: d.veladaEnMarcha ? (d.muestrasUltimaHora > 0 ? "grabando" : "parado") : "en reposo",
    nivel: d.veladaEnMarcha && d.muestrasUltimaHora === 0 ? "mal" : "ok",
    detalle:
      "Una pasada cada 20 s mientras dura la velada. No tiene horario propio a propósito: lo llaman el centinela y el vigilante, que antes comprueban que no haya otro grabando.",
  });

  // 4. El guardián: el que llama por teléfono.
  out.push({
    titulo: "Guardián · avisa si algo se cae (estado-guardian)",
    valor: "activo",
    nivel: "ok",
    detalle:
      "Lee este mismo panel cada hora. Si algo sale en rojo, falla a propósito para que GitHub mande el correo.",
  });

  // 5. El resto de la plantilla. No es un dato vivo, es el censo — pero saber
  // cuántos hay y cuántos trabajan solos es justo lo que nadie sabía.
  out.push({
    titulo: "El resto de la plantilla",
    valor: `${AUTOMATISMOS_CON_HORARIO} de ${AUTOMATISMOS_TOTALES}`,
    nivel: "ok",
    detalle:
      "Automatismos con horario propio, de un total de 38. Los otros son herramientas de rescate que solo se llaman cuando hacen falta.",
  });

  return out;
}

// ---------------------------------------------------------------------------
// Lo que se pudre despacio: nada urge un día concreto, pero se nota en la web.
// ---------------------------------------------------------------------------

export type DatosCatalogo = {
  luchadores: number;
  sinFotoCuerpo: number;
  sinFotoCabeza: number;
  /** Con combate futuro y CERO fotos: ningún cron los va a arreglar. */
  sinNingunaFotoYCompiten: number;
  /** Días hasta el combate del más inminente de esos. Decide si urge. */
  diasHastaElPrimeroSinFoto: number | null;
  /** Eventos ya celebrados a los que les falta algún resultado. */
  eventosPasadosIncompletos: number;
};

// A partir de aqui, una ficha sin foto ya no se arregla sola: los pases de
// enriquecimiento son diarios, y si en diez dias no la han encontrado es que la
// fuente no la tiene.
const DIAS_PARA_URGIR_FOTOS = 10;

export function comprobarCatalogo(d: DatosCatalogo): Comprobacion[] {
  const pct = (n: number) =>
    d.luchadores > 0 ? Math.round((n / d.luchadores) * 100) : 0;

  return [
    {
      titulo: "Fichas sin foto de cuerpo entero",
      valor: `${d.sinFotoCuerpo} (${pct(d.sinFotoCuerpo)} %)`,
      // Nunca es rojo: hay luchadores antiguos que no tienen foto en ninguna
      // fuente, así que exigir el 100 % sería pedir lo imposible y el panel
      // viviría en rojo para siempre.
      nivel: pct(d.sinFotoCuerpo) > 45 ? "aviso" : "ok",
    },
    {
      titulo: "Fichas sin foto de cara",
      valor: `${d.sinFotoCabeza} (${pct(d.sinFotoCabeza)} %)`,
      nivel: pct(d.sinFotoCabeza) > 30 ? "aviso" : "ok",
    },
    {
      titulo: "Compiten pronto y no tienen NINGUNA foto",
      valor: `${d.sinNingunaFotoYCompiten}`,
      // Ningún automatismo va a resolver esto si las fuentes no tienen ficha
      // suya: hay que meter las fotos a mano. Pero solo se pone en ROJO cuando
      // ya urge (a menos de 10 días de su combate). Alertar durante el mes
      // entero que falta convertiría al guardián en ruido de fondo, y entonces
      // el aviso que sí importa pasaría desapercibido. Mientras tanto se ve en
      // el panel, que es donde se mira cuando hay tiempo de arreglarlo.
      nivel:
        d.sinNingunaFotoYCompiten === 0
          ? "ok"
          : d.diasHastaElPrimeroSinFoto != null &&
              d.diasHastaElPrimeroSinFoto <= DIAS_PARA_URGIR_FOTOS
            ? "mal"
            : "aviso",
      detalle:
        d.sinNingunaFotoYCompiten > 0
          ? `Ni ESPN ni ufc.com tienen sus fotos. Se meten a mano con 'add_manual_fighter'.${
              d.diasHastaElPrimeroSinFoto != null
                ? ` El primero pelea en ${Math.max(0, Math.round(d.diasHastaElPrimeroSinFoto))} días.`
                : ""
            }`
          : undefined,
    },
    {
      titulo: "Eventos pasados sin resultados completos",
      valor: `${d.eventosPasadosIncompletos}`,
      nivel: d.eventosPasadosIncompletos === 0 ? "ok" : "aviso",
      detalle:
        d.eventosPasadosIncompletos > 0
          ? "Suelen ser carteleras antiguas que nunca se completaron."
          : undefined,
    },
  ];
}
