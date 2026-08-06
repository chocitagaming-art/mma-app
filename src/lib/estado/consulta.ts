import { sql } from "@/lib/db";
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
  combates_con_ganador: string;
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
        and f.winner_id is not null) as combates_con_ganador,
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
};

const PROXIMA_VELADA_SQL = `
  with proxima as (
    select e.id, e.name, e.start_time,
      (e.prelims_time is not null or e.early_prelims_time is not null) as tiene_prelims,
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
      where fi.full_body_url is null) as sin_foto_cuerpo_en_la_base
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
            and f.winner_id is null
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
  muestras_ultima_hora: string;
};

// El ancla del directo, calculada IGUAL que en scripts/live_sentinel.py:
// early_prelims ?? prelims ?? (estelar - 4 h). Si aquí y allí divergieran, el
// panel enseñaría una hora y el centinela arrancaría a otra — y el panel
// existiría para mentir, que es peor que no tenerlo.
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
    select e.id
    from events e
    where coalesce(e.early_prelims_time, e.prelims_time,
                   e.start_time - interval '4 hours') <= now()
      and coalesce(e.start_time, e.prelims_time) + interval '5 hours' >= now()
      and exists (
        select 1 from fights f
        where f.event_id = e.id and f.status is distinct from 'cancelled'
          and f.winner_id is null
      )
    limit 1
  )
  select
    (select ancla from proxima) as arranque_utc,
    extract(epoch from ((select ancla from proxima) - now())) / 3600 as horas_hasta_el_arranque,
    exists (select 1 from en_marcha) as velada_en_marcha,
    (select count(*) from live_fight_stat_samples s
      where s.sampled_at > now() - interval '1 hour') as muestras_ultima_hora`;

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

export async function obtenerEstado(): Promise<Estado> {
  // En paralelo, pero son 8 y el pool tiene 3 conexiones: las demás esperan unos
  // milisegundos. Compensa frente a encadenarlas, y esta ruta la visita una
  // persona cada mucho rato, no un buscador.
  // 🪤 Este comentario decía «son 4» y ya eran 7 antes de añadir la octava.
  // Si añades una consulta aquí, actualiza la cuenta o vuelve a mentir.
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
      combatesConGanador: num(ultima.combates_con_ganador),
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
        horasHastaElArranque: guardia.horas_hasta_el_arranque
          ? num(guardia.horas_hasta_el_arranque)
          : null,
        veladaEnMarcha: Boolean(guardia.velada_en_marcha),
        muestrasUltimaHora: num(guardia.muestras_ultima_hora),
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
