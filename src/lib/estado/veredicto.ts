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
  /**
   * Combates con desenlace: con ganador O con método. Se llamaba
   * `combatesConGanador` y contaba solo los primeros, así que una velada con un
   * empate o un no contest no llegaba nunca al total y el guardián la daba por
   * incompleta para siempre.
   */
  combatesResueltos: number;
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

// Lo que tarda una cartelera en desplegarse entera desde `start_time`: el
// estelar cae al FINAL, no al principio. Anoche el 1064 empezó a las 01:00Z y su
// estelar se selló a las 04:47Z (3 h 47). Es el mismo plazo que usa el CTE
// `en_marcha` de consulta.ts para dar una velada por viva, y sirve para no
// exigir resultados de combates que todavía no se han peleado.
const HORAS_DE_VELADA = 5;

export function comprobarVelada(d: DatosVelada): Comprobacion[] {
  const out: Comprobacion[] = [];

  // 1. Resultados. Es lo primero que se nota y lo que más molesta si falta.
  //
  // Y TAMBIÉN TIENE SU PLAZO, como sus tres vecinas. Era la única sin él, y por
  // eso se ponía roja MIENTRAS LA VELADA SE ESTABA PELEANDO: `ULTIMA_VELADA_SQL`
  // coge el evento con `start_time < now()`, que en directo es el que está en
  // curso, y exigir ahí la cartelera completa es exigir que ya hayan ocurrido
  // combates que todavía no han ocurrido. La noche del UFC 330 eso mandó TRES
  // correos (02:09, 03:29 y 04:17Z, diciendo «8/12» y «11/12») y el último cayó
  // 93 segundos antes de que se sellara el estelar. El panel entero quedaba en
  // rojo global toda la velada hiciera lo que hiciera la cámara, que es
  // justamente lo que enseña a no leer los correos — y de paso enmascara los
  // rojos de la cámara, que son los que sí hay que mirar esa noche.
  const faltan = d.combatesActivos - d.combatesResueltos;
  const veladaAunRodando = d.horasDesdeElFinal < HORAS_DE_VELADA;
  out.push({
    titulo: "Resultados",
    valor: `${d.combatesResueltos}/${d.combatesActivos}`,
    nivel:
      d.combatesActivos === 0
        ? "aviso"
        : faltan === 0
          ? "ok"
          : veladaAunRodando
            ? "aviso"
            : "mal",
    detalle:
      d.combatesActivos === 0
        ? "La cartelera no tiene combates cargados."
        : faltan > 0
          ? veladaAunRodando
            ? `Faltan ${faltan}, pero la velada sigue en marcha: es lo normal a esta hora.`
            : `Faltan ${faltan}. Lanzar «Live results (ESPN)» a mano lo arregla en un minuto.`
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
  /**
   * Luchadores de la cartelera a los que la web no puede pintar NINGUNA foto —
   * ni cuerpo, ni standing, ni cara, ni local. Solo esos salen con silueta.
   * Lo calcula `contarSinFotoVisible`, no una columna suelta de la base.
   */
  sinFoto: number;
  /** Esquinas de la cartelera SIN ficha en `fighters`: ni foto, ni historial. */
  sinFicha: number;
  /** Esquinas totales de la cartelera activa (2 por combate). */
  luchadores: number;
  /** Días que faltan. Lo que es tolerable a diez días no lo es a dos. */
  diasQueFaltan: number;
  /** Filas de `weigh_ins` de la cartelera activa. Dos por combate. */
  pesajes: number;
  /** `events.faceoff_video_id` puesto. */
  tieneCareo: boolean;
};

// A partir de aquí una cartelera incompleta deja de ser normal y pasa a ser un
// problema: ya no da tiempo a que los automatismos semanales la completen.
const DIAS_PARA_EXIGIR = 3;

// El pesaje y el careo NO existen hasta la víspera, así que tienen su propio
// umbral y es mucho más corto que el de la cartelera. Medido sobre UFC 330: el
// artículo de pesaje de ufc.com se publicó ~33 h antes del estelar y el careo
// de YouTube ~26 h antes.
//
// 🪤 PERO EL UMBRAL NO SE CALIBRA CONTRA CUÁNDO PUBLICA UFC.COM: SE CALIBRA
// CONTRA CUÁNDO CORRE EL CRON QUE LO TRAE. La primera versión puso 1 día
// mirando lo primero, y eso garantizaba un rojo que nadie podía arreglar:
// `refresh-weighins.yml` es SEMANAL, los viernes a las 20:00 UTC. Para una
// velada que empiece antes de esa hora del sábado —las de Asia y las
// vespertinas europeas— la víspera abría hasta 10 h ANTES de que el cron
// tuviera su turno. Medido sobre el evento 1065 (estelar sábado 29-ago 10:00
// UTC): víspera a las 10:00 del viernes, cron a las 20:00 → diez horas de
// «Pesajes 0/18» en rojo, con el guardián mandando un correo cada hora y con un
// detalle que acusa al cron de «fallar en verde» cuando ni siquiera ha corrido.
//
// Con 12 h la ventana abre SIEMPRE después de las 20:00 UTC del viernes para
// cualquier velada de sábado o domingo, que son todas. Un panel que pide un
// dato antes de que alguien tenga el encargo de traerlo no informa: acusa.
const HORAS_PARA_EXIGIR_VISPERA = 12;

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
        ? `${sinFotoTotal} a los que la web no puede pintar NINGUNA foto: saldrán con silueta. Se arregla con 'add_manual_fighter --photo'.`
        : undefined,
  });

  // 🪤 PESAJE Y CAREO DE LA VELADA QUE VIENE. Las dos comprobaciones ya
  // existían para la velada YA CELEBRADA (comprobarVelada), o sea justo cuando
  // ya no se pueden arreglar. El 15-ago-2026 el panel dio el visto bueno a UFC
  // 330 mientras la página se publicaba sin careo y sin el pesaje de sus dos
  // combates por el título; lo cazó el dueño mirando la web, no el panel.
  //
  // Antes de la víspera el dato NO EXISTE todavía, así que no se puntúa: se
  // rotula «aún no toca» en verde. Un rojo que sale siete días seguidos no
  // informa de nada.
  const esVispera = d.diasQueFaltan * 24 <= HORAS_PARA_EXIGIR_VISPERA;
  const pesajesEsperados = d.combatesActivos * 2;

  out.push({
    titulo: "Pesajes",
    valor: !esVispera
      ? "aún no toca"
      : pesajesEsperados === 0
        ? "sin cartelera"
        : `${d.pesajes}/${pesajesEsperados}`,
    // Incompleto la víspera es TAN malo como vacío: los cuatro pesos que
    // faltaban en UFC 330 eran los del estelar y el coestelar, y el contador
    // decía 20/24 sin que nadie lo mirara.
    // 🪤 `pesajes >= 0` es SIEMPRE cierto, así que una cartelera vacía la
    // víspera publicaba «0/0» en VERDE — un verde falso, que es justo lo que
    // este panel existe para no dar. Sin combates no hay pesaje que exigir,
    // pero tampoco hay nada que aprobar: lo dice la línea «Cartelera», que ya
    // está en rojo, y esta se declara sin dato.
    nivel:
      !esVispera || pesajesEsperados === 0
        ? "ok"
        : d.pesajes >= pesajesEsperados
          ? "ok"
          : "mal",
    detalle: !esVispera
      ? "El artículo de ufc.com se publica la víspera; antes es normal que no esté."
      : d.pesajes >= pesajesEsperados
        ? undefined
        : `Faltan ${pesajesEsperados - d.pesajes} de ${pesajesEsperados}. Este cron falla EN VERDE: relanzar 'refresh-weighins.yml' con event_id y mirar 'bout_shaped_lines_unparsed' en su resumen.`,
  });

  out.push({
    titulo: "Vídeo del careo",
    valor: esVispera ? (d.tieneCareo ? "sí" : "no") : "aún no toca",
    // Nunca rojo: la ficha del evento se lee perfectamente sin careo. Pero la
    // víspera SÍ se avisa, porque a esa hora ya está publicado y solo hay que
    // ir a por él.
    nivel: !esVispera || d.tieneCareo ? "ok" : "aviso",
    detalle: !esVispera
      ? "La UFC lo sube la noche de la víspera; antes no existe."
      : d.tieneCareo
        ? undefined
        : "Ya debería estar. El cron solo mira a las 20:00 y 23:00 UTC: si la UFC subió el vídeo entre medias, hay que lanzar 'refresh-faceoffs.yml' a mano.",
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

// El microservicio de predicción vive FUERA de esta base (Render), así que su
// salud no se puede consultar: se mira cuándo fue la última vez que contestó.
//
// Lo escribe `keepalive-prediction.yml` después de un /health con 200, y solo
// entonces; si el servicio se cae, ese workflow falla, no escribe, y el latido
// envejece. Ese envejecimiento ES la señal.
//
// UMBRALES, MEDIDOS. GitHub Actions NO respeta la cadencia programada: el
// keep-alive pide un ping cada 10 min y entrega uno cada ~1,79 h de media, con
// el PEOR hueco observado en 3,62 h (40 ejecuciones, 69,7 h). Por eso 6 h de
// margen para el «ok»: por debajo habría falsos rojos por retrasos del
// planificador, no por el servicio. A las 12 h ya no hay excusa de cadencia.
const HORAS_PREDICCION = { aviso: 6, mal: 12 };

export type DatosPrediccion = {
  /** Horas desde el último /health con 200, o null si no ha latido nunca. */
  horasDesdeElUltimoLatido: number | null;
};

export function comprobarPrediccion(d: DatosPrediccion): Comprobacion[] {
  // Nunca ha latido: o la tabla acaba de nacer y el keep-alive aún no ha
  // corrido, o lleva caído desde el principio. Aviso, no rojo: no se puede
  // distinguir, y estrenar una comprobación en rojo enseña a ignorarla.
  if (d.horasDesdeElUltimoLatido == null) {
    return [
      {
        titulo: "Servicio de predicción",
        valor: "sin noticias todavía",
        nivel: "aviso",
        detalle:
          "Aún no consta ningún /health correcto. Si acaba de instalarse, el keep-alive lo anotará en menos de dos horas.",
      },
    ];
  }
  const nivel = porFrescura(d.horasDesdeElUltimoLatido, HORAS_PREDICCION);
  return [
    {
      titulo: "Servicio de predicción",
      valor: comoHace(d.horasDesdeElUltimoLatido),
      nivel,
      detalle:
        nivel === "mal"
          ? "La predicción con IA de la web está caída. Mirar por qué con «Diagnostico de Render», y levantarlo con «Sincronizar la conexion del servicio de prediccion» o «Deploy prediction service»."
          : nivel === "aviso"
            ? "Puede ser solo un retraso del planificador de GitHub, que se salta pings a menudo."
            : undefined,
    },
  ];
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
  /** Minutos desde el ancla del evento EN MARCHA. null si no hay velada. */
  minutosDesdeElAncla: number | null;
  /**
   * Minutos desde la última escritura en `live_fight_stats` DEL EVENTO EN
   * MARCHA. null = no hay ni una fila viva: nadie ha escrito NUNCA.
   * ⚠️ Lo escriben el bucle Y el cron de respaldo: fresco no prueba «bucle vivo».
   */
  minutosSinPulso: number | null;
  /** Muestras DEL EVENTO EN MARCHA en la última hora. */
  muestrasUltimaHora: number;
  /** Combates activos del cartel (sin las canceladas). */
  peleasActivas: number;
  /** Cuántos de esos tienen fila viva: la película empezada. */
  peleasConFilaViva: number;
  /** Cuántas de esas filas siguen abiertas (`state <> 'post'`). */
  peleasSinCerrar: number;
  /** Cuántas peleas activas tienen AL MENOS UNA muestra: película de verdad. */
  peleasConPelicula: number;
  /** Muestras TOTALES del evento en marcha, desde el principio de la velada. */
  muestrasDelEvento: number;
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

// 🪤 EL PANEL DECÍA «PARADO» DURANTE LOS PASEÍLLOS, Y TENÍA RAZÓN EL BUCLE.
//
// La regla vieja eran DOS literales gemelos, carácter por carácter, en las dos
// filas de abajo: `veladaEnMarcha && muestrasUltimaHora === 0 ? "mal" : "ok"`.
// Y el contador de muestras está a cero POR DISEÑO al principio de cada velada:
// el escritor tiene PROHIBIDO guardar una muestra hasta la campana del asalto 1
// (`live_stats.py:153`, `COALESCE(lfs.period, 0) >= 1`). Medido en el 1064:
// ancla 21:30:00Z, primera muestra 21:45:03Z → **15 min 3 s de rojo con todo
// funcionando**, cada sábado, y con el guardián disparando a las :40.
//
// Lo que SÍ late en esos minutos es `live_fight_stats.updated_at`: durante los
// paseíllos ESPN da el evento como 'in' con `period = 0`, el bucle reescribe la
// fila viva en cada pasada (~23 s medidos) y el `DO UPDATE` pone `updated_at =
// NOW()` aunque el contenido no cambie (`live_stats.py:98`). Ese es el pulso.
//
// ⚠️ Y LO QUE EL PULSO NO DEMUESTRA, que hay que decirlo en voz alta:
// `live_fight_stats` tiene DOS escritores con EL MISMO código
// (`espn_live_results`): el bucle de 20 s y el cron de respaldo live-results
// (*/10 en sus franjas). Un pulso fresco prueba que ALGUIEN escribe, no que el
// bucle esté vivo — comprobado: las escrituras de 07:36/07:59/08:41/09:12Z
// sobre el 1064 son del cron, con el bucle muerto desde las 04:47Z. Por eso el
// pulso NUNCA da el visto bueno él solo: **sólo puede sumar rojo**. Quien de
// verdad separa al bucle del cron es el RITMO, y por eso se sigue mirando.
//
// Y el precio de eso, dicho también: el ritmo se mide sobre una hora, así que
// un bucle muerto TAPADO por el respaldo puede tardar hasta 60 min en salir en
// rojo (antes si el cron se retrasa más de los 25 min de silencio). En ese
// hueco se pierden dos o tres peleas de película. Si algún día eso resulta
// inaceptable, la solución NO está en este panel: está en que el bucle escriba
// su propio latido en `service_heartbeats` —como ya hace el microservicio de
// predicción, migración 026—. Eso sí sería una prueba, y es una línea en el
// bucle. Con sólo la base delante, «alguien escribe» es demostrable y «el bucle
// de 20 s está vivo» no lo es.

// Cuánto puede callar el PULSO con una velada en marcha y el cartel a medias.
//
// Entre combates el contador de muestras se para, pero el bucle sigue tocando
// la fila viva mientras ESPN dé el evento como in/post. Medido en el 1064: 846
// pasadas con el evento vivo, 53 sin escribir, agrupadas en dos huecos, el
// mayor de **4 min 55 s** — son los minutos en que la pelea anterior ya está
// sellada (`WHERE NOT is_final` corta el UPDATE) y ESPN aún no ha puesto la
// siguiente en 'in'. 25 min es cinco veces ese peor caso.
//
// Y es el MISMO número que `PAUSA_ESPERADA_MAX_S` en lib/directo/consulta.ts,
// que contesta esta misma pregunta en la otra pantalla. Que no coincidieran
// sería un panel contradiciendo al otro la misma noche.
const SILENCIO_MAX_MIN = 25;

// Gracia desde el ancla, sólo para cuando NO hay ni una fila viva. De 21:15 a
// 21:30Z el bucle del 1064 dio 45 pasadas con «no ESPN event in/post, DB
// untouched»: hasta que ESPN no abre el evento NO EXISTE fila que tocar, y
// exigir pulso antes es exigir lo imposible. Esa noche abrió a las 21:30:37Z,
// 37 s después del ancla; con 25 min hay cuarenta veces ese margen.
const GRACIA_ARRANQUE_MIN = 25;

// EL RITMO: lo ÚNICO que separa al bucle del cron de respaldo, porque los dos
// son el mismo programa y lo que cambia es la cadencia — 20 s contra 10 min.
//
// El umbral tiene que caer en el hueco entre los dos, y el hueco está medido
// por los dos lados:
//   · POR ARRIBA, el bucle sano. En el 1064, la peor hora de toda la velada
//     dejó 27 muestras (media 49,6; máx 70).
//   · POR ABAJO, el techo del respaldo, y no es una estimación: el cron da 6
//     pasadas a la hora y en cada pasada sólo puede escribir muestra de lo que
//     haya CAMBIADO (el dedup de `live_stats.py:154` la descarta si el estado,
//     el asalto, el reloj y las stats son los mismos). A mitad de cartel eso es
//     una pelea, así que su techo son ~6/h. Lo observado esta mañana con el
//     bucle muerto fueron 2.
// 10/h queda 2,7 veces por debajo del peor caso bueno y por encima del techo
// del respaldo: es el número que impide que un bucle muerto pinte verde aunque
// el cron mantenga el pulso fresco.
//
// Es el umbral más delicado del arreglo y sólo hay UNA velada medida minuto a
// minuto: una cartelera corta de finalizaciones rápidas puede dar horas más
// flojas. Revisar tras la velada del 22-ago.
const MUESTRAS_MIN_POR_HORA = 10;

// 🪤 CUÁNTAS MUESTRAS POR PELEA HACEN FALTA PARA PODER DECIR «PELÍCULA».
//
// La escapatoria «cartel grabado» mira `live_fight_stats`, y esa tabla NO
// prueba que se haya grabado nada: prueba que ALGUIEN vio la pelea, aunque
// fuera media hora después de terminar. Está medido en esta misma base, y es el
// desastre del 1-ago: las 14 filas del 1063 se escribieron **en el mismo
// segundo** (19:43:21-19:43:26Z), todas en 'post', con el cartel entero ya
// acabado y una sola muestra por pelea. Con sólo el conteo de filas, esa noche
// —la noche que este panel existe para no repetir— habría pintado
// «cartel grabado» en VERDE.
//
// Y no es un caso aislado: de las seis últimas veladas de la base, TRES no se
// grabaron enteras (1061: 0 muestras; 1063: 14; 1060: 50, con 6 de sus 14
// peleas sin una sola muestra).
//
// Las dos poblaciones no se tocan: las veladas bien grabadas dejan 24-29
// muestras POR PELEA (1087 288/12, 1064 352/12, 1062 345/12) y las perdidas
// dejan 1. Se piden 3, ocho veces por debajo de la peor buena, y ADEMÁS que
// todas las peleas tengan serie — porque el 1063 pasaría un umbral por pelea
// (14 filas con serie de 14) y el 1060 pasaría uno por total (50 >= 42) y hace
// falta cazar los dos.
const MUESTRAS_MINIMAS_POR_PELEA = 3;

/**
 * Muestras exigibles ahora mismo. Sube en rampa durante la primera hora para no
 * pedir una hora entera de dato a los diez minutos de empezar: a ancla+45 el
 * 1064 llevaba 34 muestras y esto pedía 3,33.
 *
 * La rampa es la que perdona los paseíllos, NO el pulso. Es deliberado: si lo
 * que perdonara fuese el pulso, bastaría con que el cron de respaldo siguiera
 * vivo para comprar un verde con el bucle muerto.
 */
export function muestrasExigidas(minutosDesdeElAncla: number | null): number {
  if (minutosDesdeElAncla == null) return 0;
  const utiles = minutosDesdeElAncla - GRACIA_ARRANQUE_MIN;
  if (utiles <= 0) return 0;
  return MUESTRAS_MIN_POR_HORA * Math.min(1, utiles / 60);
}

export type VeredictoCamara = { nivel: Nivel; valor: string; detalle: string };

/**
 * ¿Se está grabando? UNA sola respuesta para las dos filas que lo preguntan (el
 * vigilante y la cámara). Tenían la condición escrita dos veces, idéntica, y
 * dos copias es exactamente cómo un panel acaba contradiciéndose en la misma
 * pantalla — el pecado que `directo/consulta.ts` declara «la peor avería
 * posible en algo cuyo único trabajo es merecer confianza».
 *
 * El orden de las ramas es la parte frágil:
 *   1. cartel cubierto → no queda nada que grabar (la cola de la noche), PERO
 *      sólo si además hay película: una fila viva no prueba que se grabara;
 *   2. sin hora de ancla → no se puede medir el ritmo, así que no se aprueba;
 *   3. sin pulso       → o está arrancando, o no hay NADIE grabando;
 *   4. pulso viejo     → alguien tenía que estar escribiendo y no escribe;
 *   5. ritmo por debajo del bucle → escribe el respaldo, no el bucle.
 */
export function juzgarLaCamara(d: DatosGuardia): VeredictoCamara {
  if (!d.veladaEnMarcha) {
    return {
      nivel: "ok",
      valor: "en reposo",
      detalle: "No hay ninguna velada en marcha. El contador parado es lo normal aquí.",
    };
  }

  // 1. EL CARTEL YA ESTÁ GRABADO ENTERO. Medido en el 1064: el bucle selló la
  // última pelea a las 04:20Z y `velada_en_marcha` siguió TRUE hasta las
  // 04:47:23Z, cuando el backfill escribió los últimos resultados — 27 min de
  // velada en marcha sin nada que grabar, que sin esta salida serían rojo. Y
  // ese silencio no es una avería, es el propio diseño del escritor: una fila
  // sellada deja de tocarse (`WHERE NOT live_fight_stats.is_final`).
  //
  // NO se puede usar `cartelSellado` para esto: mira las MISMAS columnas de
  // `fights` que mantienen viva la velada, así que en esos 27 min vale false
  // por construcción y no cerraría ni un segundo. La pista tiene que venir de
  // la tabla del DIRECTO.
  //
  // Y esto no puede colarse a mitad de cartel: una pelea que aún no ha ocurrido
  // NO TIENE FILA VIVA (el escritor sólo mira las in/post), así que la cobertura
  // crece pelea a pelea — medida en el 1064 a las 22/23/00/01/02/03/04 h: 1, 3,
  // 5, 7, 9, 11 y 12 de 12. El `> 0` es el guardarraíl del 0 >= 0.
  const cartelCubierto =
    d.peleasActivas > 0 &&
    d.peleasConFilaViva >= d.peleasActivas &&
    d.peleasSinCerrar === 0;
  if (cartelCubierto) {
    // 🪤 CUBIERTO NO ES GRABADO. Tener fila viva sólo demuestra que alguien
    // MIRÓ la pelea, y el cron de respaldo puede escribir el cartel entero de
    // una sentada cuando ya ha terminado — es literalmente lo que pasó el
    // 1-ago. Antes de dar el visto bueno hay que ver la película: todas las
    // peleas con serie y un mínimo de muestras. Ver MUESTRAS_MINIMAS_POR_PELEA.
    const hayPelicula =
      d.peleasConPelicula >= d.peleasActivas &&
      d.muestrasDelEvento >= d.peleasActivas * MUESTRAS_MINIMAS_POR_PELEA;
    if (!hayPelicula) {
      return {
        nivel: "mal",
        valor: `${d.muestrasDelEvento} muestras`,
        detalle: `El cartel entero está cerrado pero SIN PELÍCULA: ${d.muestrasDelEvento} muestras para ${d.peleasActivas} peleas (${d.peleasConPelicula} con serie), cuando una velada grabada deja unas ${d.peleasActivas * 25}. Las filas las escribió alguien DESPUÉS, con las peleas ya acabadas: es el 1-ago-2026. La película no se recupera; comprobar por qué no corrió «Live event loop».`,
      };
    }
    return {
      nivel: "ok",
      valor: "cartel grabado",
      detalle: `Las ${d.peleasActivas} peleas tienen su película (${d.muestrasDelEvento} muestras) y ninguna sigue en curso: no queda nada que grabar. Los resultados que falten los trae el backfill.`,
    };
  }

  // 🪤 SIN HORA DE ANCLA NO SE PUEDE JUZGAR EL RITMO, y callarlo es un verde.
  // `muestrasExigidas(null)` vale 0, o sea «no se exige nada»: con la velada en
  // marcha, el pulso fresco del cron de respaldo y el ancla perdida, la rama de
  // abajo daba «paseíllos» en VERDE para siempre. Hoy el SQL no puede producir
  // esa fila (el ancla y `velada_en_marcha` salen del MISMO CTE), pero es la
  // misma trampa que `num(null)` y cerrarla cuesta cuatro líneas. Ante la duda
  // manda el rojo, igual que en la rama de la gracia.
  if (d.minutosDesdeElAncla == null) {
    return {
      nivel: "mal",
      valor: "sin hora de ancla",
      detalle:
        "Hay velada en marcha pero no consta a qué hora empezó, así que no se puede saber cuánto dato debería haber entrado ya. Mirar `early_prelims_time` / `prelims_time` / `start_time` del evento.",
    };
  }

  // Llegados aquí el ancla existe: la rama de arriba se lleva el caso sin hora.
  const enGracia = d.minutosDesdeElAncla <= GRACIA_ARRANQUE_MIN;

  // 2. NI UNA FILA VIVA. Ni verde a ciegas ni rojo en el minuto cero: hasta que
  // ESPN pasa el evento a 'in' no hay nada que escribir. Dentro de la gracia se
  // AVISA, que se ve en el panel y no manda correo; pasada la gracia es el
  // 1-ago en directo.
  if (d.minutosSinPulso == null) {
    return enGracia
      ? {
          nivel: "aviso",
          valor: "arrancando",
          detalle: `La velada acaba de abrir y todavía no consta ni una fila viva. ESPN tarda unos minutos en dar el evento por empezado (en el 1064 tardó 37 s); si a los ${GRACIA_ARRANQUE_MIN} min sigue así, esto se pone rojo.`,
        }
      : {
          nivel: "mal",
          valor: "sin señal",
          detalle:
            "VELADA EN MARCHA Y NI UNA FILA VIVA ESCRITA. No está grabando nadie: es el fallo del 1-ago-2026, cuando los 35 crons salieron en verde y la velada se perdió entera.",
        };
  }

  // 3. EL PULSO SE HA PARADO. Con el cartel a medias, alguien tenía que estar
  // escribiendo: o la pelea en curso, o los paseíllos de la siguiente.
  if (d.minutosSinPulso > SILENCIO_MAX_MIN) {
    const min = Math.round(d.minutosSinPulso);
    return {
      nivel: "mal",
      valor: `${min} min sin escribir`,
      detalle: `Nadie toca una fila viva desde hace ${min} min y el cartel no está cerrado. Entre combates el contador de muestras se para, pero el pulso no: el hueco más largo medido fue de 4 min 55 s.`,
    };
  }

  // 4. ESCRIBE ALGUIEN, PERO NO AL RITMO DEL BUCLE. Es la rama que cierra el
  // agujero de hoy: con la regla vieja bastaba UNA muestra en la última hora
  // para pintar verde, y el cron de respaldo las pone él solo.
  const exigidas = muestrasExigidas(d.minutosDesdeElAncla);
  if (d.muestrasUltimaHora < exigidas) {
    return {
      nivel: "mal",
      valor: `${d.muestrasUltimaHora} en 1 h`,
      detalle: `Con el bucle vivo, la peor hora de una velada deja ~27 muestras; aquí hay ${d.muestrasUltimaHora}. Ese es el ritmo del cron de respaldo (*/10), no el del bucle: mirar si «Live event loop» tiene runs vivos.`,
    };
  }

  return {
    nivel: "ok",
    valor: d.muestrasUltimaHora > 0 ? `${d.muestrasUltimaHora} en 1 h` : "paseíllos",
    detalle:
      d.muestrasUltimaHora > 0
        ? "Velada en marcha y entrando dato. Todo correcto."
        : "Nadie peleando todavía: no se graban muestras hasta el asalto 1, así que el contador a cero es lo normal aquí. El bucle sí está escribiendo.",
  };
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

  // 2 y 3. El vigilante y la cámara contestan a LA MISMA pregunta —¿se está
  // grabando?— así que la contestan con la MISMA función. Antes eran dos
  // literales gemelos y cualquier arreglo que tocara uno dejaba al panel
  // diciendo dos cosas distintas del mismo hecho, en filas contiguas.
  const camara = juzgarLaCamara(d);

  // 2. El watchdog: el que mira que la cámara esté grabando.
  out.push({
    titulo: "Vigilante · comprueba que se graba (live-watchdog)",
    valor: camara.valor,
    nivel: camara.nivel,
    detalle: !d.veladaEnMarcha
      ? "Cada hora comprueba si hay velada sin grabar. Si la hay, relanza el bucle él solo."
      : camara.nivel === "mal"
        ? `${camara.detalle} Debería estar relanzando el bucle ahora mismo.`
        : camara.detalle,
  });

  // 3. El bucle: el cámara. No tiene horario propio a propósito — lo llaman.
  out.push({
    titulo: "Cámara · graba el combate (live-event-loop)",
    valor: camara.valor,
    nivel: camara.nivel,
    detalle: `${camara.detalle} Una pasada cada 20 s mientras dura la velada; no tiene horario propio a propósito: lo llaman el centinela y el vigilante, que antes comprueban que no haya otro grabando.`,
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

// Cuándo una foto que falta pasa de "ya llegará" a "hay que ir a por ella".
//
// 🪤 ESTE UMBRAL ERA 10 DÍAS, Y ESO ERA RUIDO SEMANAL. La premisa escrita
// («ningún cron lo va a arreglar si las fuentes no tienen ficha suya») resultó
// FALSA al medirla el 2-ago-2026 contra la base:
//
//   · Las 8 veladas de los últimos 90 días (1063, 1062, 1061, 1060, 1059,
//     1058, 1084, 1083) llegaron con **CERO** luchadores sin ninguna foto.
//   · Todos los debutantes de las últimas 8 semanas acabaron con las dos
//     fotos: 8 de 8 el 1-ago, 5 de 5 el 25-jul, 4 de 4 el 18-jul, 2 de 2 el
//     11-jul, 4 de 4 el 20-jun.
//
// O sea que un luchador recién añadido a una cartelera SIEMPRE entra sin foto y
// SIEMPRE acaba teniéndola, unos días antes de pelear. Con el umbral en 10 días
// el panel se ponía rojo cada semana por algo que se resuelve solo, y el
// guardián mandaba un correo cada hora durante toda la semana de velada. Eso
// entrena a no mirar los correos, que es justo lo contrario de para lo que
// existe el panel.
//
// A tres días sigue habiendo margen para meterlas a mano (`add_manual_fighter`)
// y ya no es lo normal que sigan faltando. Antes de eso se ve en el panel, que
// es donde se mira cuando hay tiempo de arreglarlo.
const DIAS_PARA_URGIR_FOTOS = 3;

/** Un luchador que la BASE ve sin ninguna foto y que tiene combate anunciado. */
export type FilaSinFotoEnLaBase = {
  nombre: string;
  /** Arranque del evento, en ISO UTC. */
  arranqueUtc: string;
};

// La base no es la última palabra sobre si un luchador se ve con foto.
//
// El flujo oficial para resolver este aviso NO escribe en la base:
// `add_manual_fighter --photo-only` copia la foto a `public/fighters/` y la mapea
// en `local-headshots.ts`, porque Tapology —la única fuente que tiene a los
// debutantes regionales— bloquea el hotlinking. Así que el luchador sigue con
// `headshot_url` a NULL para siempre y la web, en cambio, ya le pinta la cara.
//
// Sin este descuento la alarma es INAPAGABLE: el 6-ago el commit `04d7c01` puso
// las seis fotos que faltaban, la web las sirvió, y el guardián siguió en rojo
// y abrió el Issue #24 igualmente. Eso es justo lo que el comentario de
// `DIAS_PARA_URGIR_FOTOS` dice que no puede pasar — una alarma que no se puede
// apagar enseña a no mirar los correos.
//
// `tieneFotoLocal` entra por parámetro en vez de importar `localHeadshot` aquí:
// mantiene este módulo puro (no arrastra el mapa de fotos al panel) y deja que
// la prueba fije la regla sin depender de qué fotos haya puestas hoy.
export function descontarFotosLocales(
  filas: FilaSinFotoEnLaBase[],
  tieneFotoLocal: (nombre: string) => boolean,
  ahora: Date,
): Pick<DatosCatalogo, "sinNingunaFotoYCompiten" | "diasHastaElPrimeroSinFoto"> {
  // Por PERSONA, no por fila: la consulta une `fights`, así que quien tenga dos
  // combates anunciados sale dos veces y contar filas inflaría la alarma.
  // La clave se normaliza igual que en `local-headshots.ts` (trim + minúsculas).
  const pendientes = new Map<string, number | null>();

  for (const f of filas) {
    if (tieneFotoLocal(f.nombre)) continue;

    const t = Date.parse(f.arranqueUtc);
    const dias = Number.isNaN(t) ? null : (t - ahora.getTime()) / 86_400_000;

    const clave = f.nombre.trim().toLowerCase();
    const previo = pendientes.get(clave);
    if (previo === undefined || (dias !== null && (previo === null || dias < previo))) {
      pendientes.set(clave, dias);
    }
  }

  // La fecha se recalcula sobre los que QUEDAN. Descontar solo la cuenta y dejar
  // el `min()` del SQL diría «1 luchador, y el primero pelea en 2 días» cuando
  // ese de 2 días ya tiene su foto: urgencia falsa y rojo otra vez inapagable.
  const dias = [...pendientes.values()].filter((d): d is number => d !== null);

  return {
    sinNingunaFotoYCompiten: pendientes.size,
    diasHastaElPrimeroSinFoto: dias.length > 0 ? Math.min(...dias) : null,
  };
}

/** Una esquina de la cartelera próxima, con lo que la BASE sabe de su imagen. */
export type FilaDeCartelera = {
  nombre: string;
  /** `full_body_url` o `standing_body_url`. */
  tieneCuerpo: boolean;
  /** `headshot_url`. */
  tieneCara: boolean;
};

// «Fotos de los que pelean» contaba la columna equivocada.
//
// Contaba `full_body_url is null` y decía «N sin foto de cuerpo entero». Pero la
// web NO deja un hueco cuando falta esa columna: DEGRADA. Lo dice el comentario
// de `fighter-full-body.tsx`: «si la URL elegida es NULL o falla la carga,
// degradamos al headshot (que a su vez cae a su silueta/iniciales)», y antes de
// todo eso mira `local-bodies.ts`. La cadena real es:
//
//   localBody → full_body → standing → headshot → localHeadshot → silueta
//
// Medido el 6-ago con un navegador sobre `/eventos/1087`: el panel cantaba
// «19/24, 5 sin foto» y en pantalla salían los 24 CON foto, ninguno con silueta.
// El dueño lo vio mirando su web; el panel llevaba el día entero en rojo por ello.
//
// Así que lo que se cuenta es lo único que le importa a quien mira: **a cuántos
// no puede pintarles la web ninguna foto**. Solo eso es una silueta de verdad.
export function contarSinFotoVisible(
  filas: FilaDeCartelera[],
  tieneFotoLocal: (nombre: string) => boolean,
): number {
  // Por PERSONA, no por fila. Y las esquinas sin nombre cuentan: no se puede
  // afirmar que tengan foto, y `sinFicha` ya las avisa por su cuenta.
  const sinNada = new Set<string>();

  for (const [i, f] of filas.entries()) {
    if (f.tieneCuerpo || f.tieneCara) continue;
    const clave = f.nombre.trim().toLowerCase();
    if (clave !== "" && tieneFotoLocal(f.nombre)) continue;
    sinNada.add(clave === "" ? `__sin-nombre-${i}` : clave);
  }

  return sinNada.size;
}

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
      // Rojo SOLO cuando ya urge de verdad: a menos de DIAS_PARA_URGIR_FOTOS
      // del combate. Lo normal es que un luchador recién añadido a la cartelera
      // entre sin foto y la reciba días después; ver la medición junto a la
      // constante. Alertar antes convierte al guardián en ruido de fondo.
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
