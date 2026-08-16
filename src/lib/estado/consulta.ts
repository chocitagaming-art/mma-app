import { sql } from "@/lib/db";
import { resueltoSqlPredicate } from "@/lib/fight-result";
import {
  comprobarCatalogo,
  comprobarFrescura,
  comprobarGuardia,
  comprobarPrediccion,
  comprobarProxima,
  comprobarVelada,
  contarSinFotoVisible,
  descontarFotosLocales,
  peorNivel,
  type Bloque,
  type DatosProxima,
  type DatosVelada,
  type Nivel,
} from "@/lib/estado/veredicto";
import { localBody } from "@/lib/local-bodies";
import { localHeadshot } from "@/lib/local-headshots";

// Las consultas del panel de estado. Todo SELECT.
//
// UNA SOLA IMPLEMENTACIÓN, DOS USOS: esto lo pinta /estado y lo consume el cron
// que abre la alerta. Si hubiera dos, podrían desincronizarse y el panel diría
// "todo bien" mientras la alerta piensa lo contrario — que es la peor avería
// posible en algo cuyo único trabajo es merecer confianza.
//
// Al contar combates se filtra `status IS DISTINCT FROM 'cancelled'`: el valor
// 'active' NO EXISTE en esta base (los vivos tienen status NULL), así que un
// `= 'active'` devolvería cero siempre.

export type Estado = {
  nivel: Nivel;
  generadoUtc: string;
  bloques: Bloque[];
  /** Actividad reciente, para ver el sistema moverse durante una velada. */
  registro: Apunte[];
  /** Con velada en marcha el panel se refresca mas a menudo. */
  veladaEnMarcha: boolean;
};

type FilaVelada = {
  id: number;
  name: string | null;
  start_time: string | Date | null;
  combates_activos: string;
  combates_resueltos: string;
  muestras: string;
  filas_por_asalto: string;
  pesajes: string;
  tiene_careo: boolean;
  horas_desde_el_final: string | null;
};

const ULTIMA_VELADA_SQL = `
  select e.id, e.name, e.start_time,
    (select count(*) from fights f
      where f.event_id = e.id and f.status is distinct from 'cancelled') as combates_activos,
    (select count(*) from fights f
      where f.event_id = e.id and f.status is distinct from 'cancelled'
        and ${resueltoSqlPredicate("f")}) as combates_resueltos,
    (select count(*) from live_fight_stat_samples s
      join fights sf on sf.id = s.fight_id where sf.event_id = e.id) as muestras,
    (select count(*) from fight_stats_rounds r
      join fights rf on rf.id = r.fight_id where rf.event_id = e.id) as filas_por_asalto,
    (select count(*) from weigh_ins w
      join fights wf on wf.id = w.fight_id where wf.event_id = e.id) as pesajes,
    (e.faceoff_video_id is not null) as tiene_careo,
    extract(epoch from (now() - e.start_time)) / 3600 as horas_desde_el_final
  from events e
  where e.start_time is not null and e.start_time < now()
  order by e.start_time desc
  limit 1`;

type FilaProxima = {
  id: number;
  name: string | null;
  start_time: string | Date | null;
  tiene_prelims: boolean;
  combates_activos: string;
  luchadores: string;
  sin_ficha: string;
  /**
   * Solo `full_body_url is null`. NO es «se ve un hueco»: la web degrada al
   * standing y al headshot. Se conserva porque distingue «foto de estudio de
   * cuerpo entero» de «cualquier foto», pero el panel usa `CARTELERA_SQL`.
   */
  sin_foto_cuerpo_en_la_base: string;
  dias_que_faltan: string | null;
  pesajes: string;
  tiene_careo: boolean;
};

const PROXIMA_VELADA_SQL = `
  with proxima as (
    select e.id, e.name, e.start_time,
      (e.prelims_time is not null or e.early_prelims_time is not null) as tiene_prelims,
      (e.faceoff_video_id is not null) as tiene_careo,
      extract(epoch from (e.start_time - now())) / 86400 as dias_que_faltan
    from events e
    where e.start_time is not null and e.start_time >= now()
    order by e.start_time asc
    limit 1
  ), esquinas as (
    -- TODAS las esquinas de la cartelera, con ficha o sin ella. Antes se
    -- filtraba 'fighter_id is not null' aqui mismo, y por eso el panel era
    -- CIEGO a media pareja: el 1087 salia como 16/17 cuando la cartelera son
    -- 18 personas, porque el rival del bout 5 no existe en 'fighters'. Un
    -- combate al que le falta un luchador no es un combate completo, y ademas
    -- el bucle en vivo no lo escribe (resuelve por nombre contra esa tabla).
    -- OJO: los backticks estan PROHIBIDOS en estos comentarios; la consulta va
    -- dentro de un template literal y uno solo la parte por la mitad.
    select unnest(array[f.fighter_red_id, f.fighter_blue_id]) as fighter_id
    from fights f join proxima p on p.id = f.event_id
    where f.status is distinct from 'cancelled'
  ), peleadores as (
    select distinct fighter_id from esquinas where fighter_id is not null
  )
  select p.*,
    (select count(*) from fights f
      where f.event_id = p.id and f.status is distinct from 'cancelled') as combates_activos,
    (select count(*) from esquinas) as luchadores,
    (select count(*) from esquinas where fighter_id is null) as sin_ficha,
    (select count(*) from peleadores pe join fighters fi on fi.id = pe.fighter_id
      where fi.full_body_url is null) as sin_foto_cuerpo_en_la_base,
    -- Mismo filtro de canceladas que 'combates_activos', que es su denominador:
    -- contar las filas de una pelea que ya no existe daria un 26/24.
    (select count(*) from weigh_ins w join fights f on f.id = w.fight_id
      where f.event_id = p.id and f.status is distinct from 'cancelled') as pesajes
  from proxima p`;

type FilaCartelera = {
  name: string | null;
  tiene_cuerpo: boolean;
  tiene_cara: boolean;
};

// Las esquinas de la proxima cartelera, con lo que la BASE sabe de su imagen.
//
// Va aparte del contador de arriba a proposito: 'full_body_url is null' NO
// significa que el visitante vea un hueco. La web degrada al standing y de ahi
// al headshot antes de rendirse, y encima mira 'local-bodies' y
// 'local-headshots'. Contar solo esa columna daba 5 rojos el 6-ago con los 24
// saliendo CON foto en pantalla. Ver 'contarSinFotoVisible'.
// OJO: los backticks estan PROHIBIDOS en estos comentarios; la consulta va
// dentro de un template literal y uno solo la parte por la mitad.
const CARTELERA_SQL = `
  with proxima as (
    select id from events
     where start_time is not null and start_time >= now()
     order by start_time asc limit 1
  ), esquinas as (
    select unnest(array[f.fighter_red_id, f.fighter_blue_id]) as fighter_id
      from fights f join proxima p on p.id = f.event_id
     where f.status is distinct from 'cancelled'
  )
  select fi.name,
         (fi.full_body_url is not null or fi.standing_body_url is not null) as tiene_cuerpo,
         (fi.headshot_url is not null) as tiene_cara
    from esquinas es
    left join fighters fi on fi.id = es.fighter_id`;

type FilaFrescura = {
  horas_noticia: string | null;
  horas_luchador: string | null;
  horas_combate: string | null;
};

// `events` y `rankings` no tienen `updated_at` (comprobado contra el esquema),
// así que la frescura se mide sobre las tres tablas que sí lo tienen y que
// además cubren los tres pipelines que importan: noticias, enriquecimiento de
// fichas y resultados/carteleras.
const FRESCURA_SQL = `
  select
    extract(epoch from (now() - (select max(published_at) from news))) / 3600 as horas_noticia,
    extract(epoch from (now() - (select max(updated_at) from fighters))) / 3600 as horas_luchador,
    extract(epoch from (now() - (select max(updated_at) from fights))) / 3600 as horas_combate`;

type FilaPrediccion = {
  horas_desde_el_latido: string | null;
};

// El microservicio de predicción no vive en esta base, así que aquí no se
// pregunta si está vivo: se mira cuándo contestó por última vez.
// `keepalive-prediction.yml` escribe esta fila solo cuando su /health devuelve
// 200, así que si el servicio cae, el latido envejece y eso se ve.
// Ver db/migrations/026_service_heartbeats.sql en mma-ingesta.
const PREDICCION_SQL = `
  select extract(epoch from (now() - last_ok_at)) / 3600 as horas_desde_el_latido
    from service_heartbeats
   where service = 'prediction'`;

type FilaCatalogo = {
  luchadores: string;
  sin_foto_cuerpo: string;
  sin_foto_cabeza: string;
  eventos_pasados_incompletos: string;
};

const CATALOGO_SQL = `
  select
    (select count(*) from fighters) as luchadores,
    (select count(*) from fighters where full_body_url is null) as sin_foto_cuerpo,
    (select count(*) from fighters where headshot_url is null) as sin_foto_cabeza,
    (select count(*) from events e
      where e.start_time is not null
        and e.start_time < now() - interval '3 days'
        and exists (
          select 1 from fights f
          where f.event_id = e.id and f.status is distinct from 'cancelled'
            and not ${resueltoSqlPredicate("f")}
        )) as eventos_pasados_incompletos`;

type FilaSinFoto = {
  name: string | null;
  start_time: string | Date | null;
};

// Los que la BASE ve sin ninguna foto y tienen combate anunciado, POR NOMBRE.
//
// Antes esto era un `count(*)` más un `min(start_time)` dentro de CATALOGO_SQL,
// y no valía: la mitad de estos casos se resuelven sin tocar la base, poniendo
// la foto en `local-headshots.ts` (ver `descontarFotosLocales`). Sin los nombres
// no se puede saber cuáles ya están resueltos, y la alarma se quedaba encendida
// para siempre. Se piden las filas y se descuenta en TypeScript, que es donde
// vive el mapa de fotos locales.
const SIN_FOTO_SQL = `
  select fi.name, e.start_time
    from fighters fi
    join fights f on (f.fighter_red_id = fi.id or f.fighter_blue_id = fi.id)
    join events e on e.id = f.event_id
   where fi.headshot_url is null
     and fi.full_body_url is null
     and fi.standing_body_url is null
     and f.status is distinct from 'cancelled'
     and e.start_time >= now()`;

type FilaGuardia = {
  arranque_utc: string | Date | null;
  horas_hasta_el_arranque: string | null;
  velada_en_marcha: boolean;
  /** Minutos desde el ancla del evento EN MARCHA. NULL si no hay velada. */
  minutos_desde_el_ancla: string | null;
  /**
   * Minutos desde la última escritura en `live_fight_stats` DE ESE evento.
   * NULL = no hay ni una fila viva (nadie ha escrito nunca).
   */
  minutos_sin_pulso: string | null;
  /** Muestras DE ESE evento en la última hora (antes: de toda la base). */
  muestras_ultima_hora: string;
  peleas_activas: string;
  peleas_con_fila_viva: string;
  peleas_sin_cerrar: string;
  /** Peleas activas con AL MENOS una muestra: película de verdad, no fila. */
  peleas_con_pelicula: string;
  /** Muestras totales del evento en marcha, desde el principio de la velada. */
  muestras_del_evento: string;
};

// El ancla del directo, calculada IGUAL que en scripts/live_sentinel.py:
// early_prelims ?? prelims ?? (estelar - 4 h). Si aquí y allí divergieran, el
// panel enseñaría una hora y el centinela arrancaría a otra — y el panel
// existiría para mentir, que es peor que no tenerlo.
//
// 🪤 POR QUÉ SE PIDE EL PULSO Y NO SÓLO LAS MUESTRAS. El escritor tiene
// PROHIBIDO guardar muestras hasta la campana del asalto 1 (`live_stats.py:153`,
// `COALESCE(lfs.period, 0) >= 1`), así que durante los paseíllos el contador
// está a cero POR DISEÑO y el panel daba «parado» con todo funcionando: medido
// en el 1064, ancla 21:30:00Z y primera muestra 21:45:03Z = 15 min 3 s de rojo
// falso. Lo que SÍ late en esos minutos es `live_fight_stats.updated_at`, que el
// bucle reescribe en cada pasada (~23 s medidos) mientras la fila no esté
// sellada (`live_stats.py:98`, dentro del DO UPDATE).
//
// ⚠️ Y LO QUE ESTE PULSO NO DEMUESTRA: `live_fight_stats` tiene DOS escritores
// con el MISMO código (`espn_live_results`), el bucle de 20 s y el cron de
// respaldo live-results. Un pulso fresco prueba que ALGUIEN escribe, no que el
// bucle esté vivo — comprobado: las escrituras de 07:36/07:59/08:41/09:12Z
// sobre el 1064 son del cron, con el bucle muerto desde las 04:47Z. Por eso el
// pulso sólo puede sumar rojo, nunca comprar un verde (ver `juzgarLaCamara`).
//
// Las cuentas nuevas van UNIDAS POR `fights.event_id` al evento en marcha, y no
// es cosmético: `prune_live_fight_stats` conserva 48 h, así que pueden convivir
// dos veladas. Hoy mismo, sin velada, el pulso SIN filtrar devuelve 351 min (las
// filas de ayer) en vez de NULL, y el contador de muestras sin filtrar daba por
// grabada una velada muerta si en la misma hora entraba dato de otro evento.
// Y se descartan las canceladas por el mismo motivo que en el resto del
// fichero: sus filas no cuentan en el denominador, así que tampoco arriba.
const GUARDIA_SQL = `
  with proxima as (
    select coalesce(e.early_prelims_time, e.prelims_time,
                    e.start_time - interval '4 hours') as ancla
    from events e
    where e.start_time is not null and e.start_time >= now()
    order by e.start_time asc limit 1
  ), en_marcha as (
    -- MISMO criterio que scripts/live_watchdog.py: se entra por la HORA y se
    -- sale por el RESULTADO. Sin la segunda condicion, el panel daria por viva
    -- una velada terminada (paso con el 1063: acabo a las 19:40Z y el reloj
    -- decia que seguia hasta las 22:00Z) y contradiria al watchdog de verdad.
    -- El 'order by' es por determinismo: dos veladas el mismo dia (numerada +
    -- Contender) pasan, y sin el la fila elegida dependia del plan. Manda la
    -- que empezo antes, que es la que lleva mas rato exigiendo dato.
    select e.id,
           coalesce(e.early_prelims_time, e.prelims_time,
                    e.start_time - interval '4 hours') as ancla
    from events e
    where coalesce(e.early_prelims_time, e.prelims_time,
                   e.start_time - interval '4 hours') <= now()
      and coalesce(e.start_time, e.prelims_time) + interval '5 hours' >= now()
      and exists (
        select 1 from fights f
        where f.event_id = e.id and f.status is distinct from 'cancelled'
          and not ${resueltoSqlPredicate("f")}
      )
    order by ancla asc
    limit 1
  )
  select
    (select ancla from proxima) as arranque_utc,
    extract(epoch from ((select ancla from proxima) - now())) / 3600 as horas_hasta_el_arranque,
    exists (select 1 from en_marcha) as velada_en_marcha,
    (select extract(epoch from (now() - m.ancla)) / 60 from en_marcha m)
      as minutos_desde_el_ancla,
    -- EL PULSO. Sin velada da NULL (agregado sobre cero filas), no cero.
    (select extract(epoch from (now() - max(l.updated_at))) / 60
       from live_fight_stats l
       join fights f on f.id = l.fight_id
       join en_marcha m on m.id = f.event_id
      where f.status is distinct from 'cancelled') as minutos_sin_pulso,
    (select count(*)
       from live_fight_stat_samples s
       join fights f on f.id = s.fight_id
       join en_marcha m on m.id = f.event_id
      where f.status is distinct from 'cancelled'
        and s.sampled_at > now() - interval '1 hour') as muestras_ultima_hora,
    -- LA ESCAPATORIA DE LA COLA DE LA NOCHE. Una pelea que aun no ha ocurrido
    -- NO TIENE FILA VIVA (el escritor solo mira las in/post), asi que esto no
    -- puede cumplirse a mitad de cartel: medido en el 1064, la cobertura fue
    -- 1,3,5,7,9,11,12 y la ultima pelea no tuvo su primera muestra hasta las
    -- 03:47:39Z. 'state' y no 'is_final': un fetch de stats que falla deja la
    -- fila en 'post' sin sellar para siempre, y con is_final esto no abriria
    -- nunca. Ademas 'post' es pegajoso, que es lo que lo hace fiable aqui.
    (select count(*) from fights f
       join en_marcha m on m.id = f.event_id
      where f.status is distinct from 'cancelled') as peleas_activas,
    (select count(*) from live_fight_stats l
       join fights f on f.id = l.fight_id
       join en_marcha m on m.id = f.event_id
      where f.status is distinct from 'cancelled') as peleas_con_fila_viva,
    (select count(*) from live_fight_stats l
       join fights f on f.id = l.fight_id
       join en_marcha m on m.id = f.event_id
      where f.status is distinct from 'cancelled'
        and l.state is distinct from 'post') as peleas_sin_cerrar,
    -- Y LA PRUEBA DE QUE ESO ES PELICULA Y NO UNA FOTO TARDIA. Una fila viva
    -- solo demuestra que alguien MIRO la pelea: el cron de respaldo puede
    -- escribir el cartel entero de una sentada con las peleas ya acabadas, y es
    -- lo que paso el 1-ago-2026 (las 14 filas del 1063 llevan el MISMO segundo,
    -- 19:43:2xZ, y una sola muestra por pelea). Sin estas dos cuentas, aquella
    -- noche habria salido 'cartel grabado' en verde. Ver
    -- MUESTRAS_MINIMAS_POR_PELEA en veredicto.ts.
    (select count(distinct s.fight_id)
       from live_fight_stat_samples s
       join fights f on f.id = s.fight_id
       join en_marcha m on m.id = f.event_id
      where f.status is distinct from 'cancelled') as peleas_con_pelicula,
    (select count(*)
       from live_fight_stat_samples s
       join fights f on f.id = s.fight_id
       join en_marcha m on m.id = f.event_id
      where f.status is distinct from 'cancelled') as muestras_del_evento`;

export type Apunte = {
  hora: string;
  quien: string;
  que: string;
};

type FilaApunte = {
  ts: string | Date;
  quien: string;
  que: string;
};

// EL REGISTRO EN VIVO. Durante una velada esto se mueve solo cada 20 s, y es
// donde se ve a los automatismos trabajando: el bucle capturando cada combate,
// los resultados entrando segun caen. No hay nada inventado — cada linea es una
// fila que alguien escribio de verdad en la base, con su hora.
const REGISTRO_SQL = `
  (
    select s.sampled_at as ts, 'Bucle del directo' as quien,
      'capturando · ' || coalesce(f.fighter_red_name, '?') || ' vs ' ||
      coalesce(f.fighter_blue_name, '?') ||
      coalesce(' · R' || s.period, '') || coalesce(' ' || s.display_clock, '') as que
    from live_fight_stat_samples s
    join fights f on f.id = s.fight_id
    order by s.sampled_at desc
    limit 8
  )
  union all
  (
    select f.updated_at as ts, 'Resultados' as quien,
      'sellado · ' || coalesce(w.name, '?') || ' gana' ||
      coalesce(' por ' || f.method, '') || coalesce(' en el R' || f.end_round, '') as que
    from fights f
    left join fighters w on w.id = f.winner_id
    where f.winner_id is not null and f.updated_at is not null
    order by f.updated_at desc
    limit 8
  )
  order by ts desc
  limit 12`;

// `event_date` y `start_time` son columnas de fecha/hora, y node-postgres
// devuelve objetos Date por mucho que el tipo prometa string. Aquí solo se
// necesita el ISO para enseñarlo, así que se normaliza en un sitio.
function aIso(v: string | Date | null): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

const num = (v: string | null | undefined): number => Number(v ?? 0) || 0;

// 🪤 EL HERMANO HONESTO DE `num`, y la diferencia son cuatro caracteres.
// `num(null)` es CERO, y hay dos campos donde cero y «no hay dato» significan lo
// contrario: `minutos_sin_pulso` NULL es «no hay ni una fila viva, NADIE está
// grabando» y cero es «acaban de escribir hace un instante». Pasar ese NULL por
// `num` pintaría de verde el peor fallo que puede tener este panel.
const numOrNull = (v: string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function obtenerEstado(): Promise<Estado> {
  // En paralelo, pero son 9 y el pool tiene 3 conexiones: las demás esperan unos
  // milisegundos. Compensa frente a encadenarlas, y esta ruta la visita una
  // persona cada mucho rato, no un buscador. Ojo: el guardián sí la llama cada
  // hora, así que no conviene engordarla sin motivo.
  // 🪤 Este comentario decía «son 4» cuando ya eran 7, y «son 8» cuando ya eran
  // 9 (entró CARTELERA_SQL y nadie tocó la cuenta). Van 9. Si añades una
  // consulta aquí, actualiza el número o vuelve a mentir.
  const [
    [ultima],
    [proxima],
    [frescura],
    [catalogo],
    [guardia],
    [prediccion],
    registro,
    sinFoto,
    cartelera,
  ] = await Promise.all([
    sql<FilaVelada>(ULTIMA_VELADA_SQL),
    sql<FilaProxima>(PROXIMA_VELADA_SQL),
    sql<FilaFrescura>(FRESCURA_SQL),
    sql<FilaCatalogo>(CATALOGO_SQL),
    sql<FilaGuardia>(GUARDIA_SQL),
    sql<FilaPrediccion>(PREDICCION_SQL),
    sql<FilaApunte>(REGISTRO_SQL),
    sql<FilaSinFoto>(SIN_FOTO_SQL),
    sql<FilaCartelera>(CARTELERA_SQL),
  ]);

  const bloques: Bloque[] = [];

  if (ultima) {
    const datos: DatosVelada = {
      combatesActivos: num(ultima.combates_activos),
      combatesResueltos: num(ultima.combates_resueltos),
      muestrasPelicula: num(ultima.muestras),
      filasPorAsalto: num(ultima.filas_por_asalto),
      pesajes: num(ultima.pesajes),
      tieneCareo: Boolean(ultima.tiene_careo),
      horasDesdeElFinal: num(ultima.horas_desde_el_final),
    };
    bloques.push({
      titulo: "La última velada",
      subtitulo: `${ultima.name ?? `Evento ${ultima.id}`} · ${aIso(ultima.start_time)?.slice(0, 10) ?? "sin fecha"}`,
      comprobaciones: comprobarVelada(datos),
    });
  }

  if (proxima) {
    const dias = num(proxima.dias_que_faltan);
    const datos: DatosProxima = {
      combatesActivos: num(proxima.combates_activos),
      tieneHorarioDeLosPrelims: Boolean(proxima.tiene_prelims),
      tieneHoraDeEstelar: proxima.start_time != null,
      // NO es `sin_foto_cuerpo_en_la_base`: eso cuenta una columna, no lo que
      // se ve. Aquí se cuenta a quien la web no puede pintar de NINGUNA manera.
      sinFoto: contarSinFotoVisible(
        (cartelera ?? []).map((f) => ({
          nombre: f.name ?? "",
          tieneCuerpo: Boolean(f.tiene_cuerpo),
          tieneCara: Boolean(f.tiene_cara),
        })),
        (nombre) => localHeadshot(nombre) !== null || localBody(nombre) !== null,
      ),
      sinFicha: num(proxima.sin_ficha),
      luchadores: num(proxima.luchadores),
      diasQueFaltan: dias,
      pesajes: num(proxima.pesajes),
      tieneCareo: Boolean(proxima.tiene_careo),
    };
    bloques.push({
      titulo: "La próxima velada",
      subtitulo: `${proxima.name ?? `Evento ${proxima.id}`} · faltan ${Math.max(0, Math.round(dias))} días`,
      comprobaciones: comprobarProxima(datos),
    });
  }

  if (guardia) {
    bloques.push({
      titulo: "El turno de guardia",
      subtitulo: "Los tres que trabajan cuando no hay nadie delante",
      comprobaciones: comprobarGuardia({
        arranqueDelDirectoUtc: aIso(guardia.arranque_utc),
        horasHastaElArranque: numOrNull(guardia.horas_hasta_el_arranque),
        veladaEnMarcha: Boolean(guardia.velada_en_marcha),
        minutosDesdeElAncla: numOrNull(guardia.minutos_desde_el_ancla),
        // 🪤 numOrNull y NO num: `num(null)` es 0, y un 0 aquí significa «pulso
        // recién escrito» = VERDE con la sala a oscuras. Ver el comentario de
        // `numOrNull` y el test «un pulso NULL llega al veredicto como null».
        minutosSinPulso: numOrNull(guardia.minutos_sin_pulso),
        muestrasUltimaHora: num(guardia.muestras_ultima_hora),
        peleasActivas: num(guardia.peleas_activas),
        peleasConFilaViva: num(guardia.peleas_con_fila_viva),
        peleasSinCerrar: num(guardia.peleas_sin_cerrar),
        // Aquí `num` SÍ es lo correcto y no `numOrNull`: son `count(*)`, que
        // sobre cero filas devuelve 0 y no NULL, y además un cero de verdad
        // significa «ni una muestra», que es lo que hay que creerse.
        peleasConPelicula: num(guardia.peleas_con_pelicula),
        muestrasDelEvento: num(guardia.muestras_del_evento),
      }),
    });
  }

  if (frescura) {
    bloques.push({
      titulo: "¿Siguen entrando datos?",
      subtitulo: "Se mide el dato, no si el cron dijo que había terminado bien",
      comprobaciones: [
        ...comprobarFrescura({
          horasDesdeNoticia: num(frescura.horas_noticia),
          horasDesdeLuchador: num(frescura.horas_luchador),
          horasDesdeCombate: num(frescura.horas_combate),
        }),
        // Va en este bloque a propósito: es la misma pregunta que las otras
        // tres — «¿sigue llegando el dato?» — solo que el dato viene de un
        // servicio de fuera. El 1-ago estuvo nueve horas muerto sin que el
        // panel se enterara.
        ...comprobarPrediccion({
          horasDesdeElUltimoLatido: prediccion?.horas_desde_el_latido
            ? num(prediccion.horas_desde_el_latido)
            : null,
        }),
      ],
    });
  }

  if (catalogo) {
    bloques.push({
      titulo: "El catálogo",
      subtitulo: "Nada urge hoy, pero es lo que se ve a medias en las fichas",
      comprobaciones: comprobarCatalogo({
        luchadores: num(catalogo.luchadores),
        sinFotoCuerpo: num(catalogo.sin_foto_cuerpo),
        sinFotoCabeza: num(catalogo.sin_foto_cabeza),
        // Los que ya tienen su foto puesta a mano en `local-headshots.ts` NO
        // cuentan: la web les pinta la cara aunque la BD siga a NULL, y el
        // flujo oficial (`add_manual_fighter --photo-only`) nunca escribe ahí.
        ...descontarFotosLocales(
          (sinFoto ?? []).map((f) => ({
            nombre: f.name ?? "",
            arranqueUtc: aIso(f.start_time) ?? "",
          })),
          (nombre) => localHeadshot(nombre) !== null,
          new Date(),
        ),
        eventosPasadosIncompletos: num(catalogo.eventos_pasados_incompletos),
      }),
    });
  }

  const nivel = peorNivel(bloques.flatMap((b) => b.comprobaciones.map((c) => c.nivel)));

  return {
    nivel,
    generadoUtc: new Date().toISOString(),
    bloques,
    registro: (registro ?? []).map((a) => ({
      hora: (aIso(a.ts) ?? "").slice(11, 19),
      quien: a.quien,
      que: a.que,
    })),
    veladaEnMarcha: Boolean(guardia?.velada_en_marcha),
  };
}
