import { sql } from "@/lib/db";
import {
  comprobarCatalogo,
  comprobarFrescura,
  comprobarGuardia,
  comprobarProxima,
  comprobarVelada,
  peorNivel,
  type Bloque,
  type DatosProxima,
  type DatosVelada,
  type Nivel,
} from "@/lib/estado/veredicto";

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
  sin_foto: string;
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
  ), peleadores as (
    select distinct unnest(array[f.fighter_red_id, f.fighter_blue_id]) as fighter_id
    from fights f join proxima p on p.id = f.event_id
    where f.status is distinct from 'cancelled'
  )
  select p.*,
    (select count(*) from fights f
      where f.event_id = p.id and f.status is distinct from 'cancelled') as combates_activos,
    (select count(*) from peleadores where fighter_id is not null) as luchadores,
    (select count(*) from peleadores pe join fighters fi on fi.id = pe.fighter_id
      where fi.full_body_url is null) as sin_foto
  from proxima p`;

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

type FilaCatalogo = {
  luchadores: string;
  sin_foto_cuerpo: string;
  sin_foto_cabeza: string;
  sin_ninguna_foto_y_compiten: string;
  dias_hasta_el_primero_sin_foto: string | null;
  eventos_pasados_incompletos: string;
};

const CATALOGO_SQL = `
  select
    (select count(*) from fighters) as luchadores,
    (select count(*) from fighters where full_body_url is null) as sin_foto_cuerpo,
    (select count(*) from fighters where headshot_url is null) as sin_foto_cabeza,
    (select count(*) from fighters fi
      where fi.headshot_url is null and fi.full_body_url is null
        and fi.standing_body_url is null
        and exists (
          select 1 from fights f join events e on e.id = f.event_id
          where (f.fighter_red_id = fi.id or f.fighter_blue_id = fi.id)
            and f.status is distinct from 'cancelled'
            and e.start_time >= now()
        )) as sin_ninguna_foto_y_compiten,
    (select extract(epoch from (min(e.start_time) - now())) / 86400
      from fighters fi
      join fights f on (f.fighter_red_id = fi.id or f.fighter_blue_id = fi.id)
      join events e on e.id = f.event_id
      where fi.headshot_url is null and fi.full_body_url is null
        and fi.standing_body_url is null
        and f.status is distinct from 'cancelled'
        and e.start_time >= now()) as dias_hasta_el_primero_sin_foto,
    (select count(*) from events e
      where e.start_time is not null
        and e.start_time < now() - interval '3 days'
        and exists (
          select 1 from fights f
          where f.event_id = e.id and f.status is distinct from 'cancelled'
            and f.winner_id is null
        )) as eventos_pasados_incompletos`;

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
  // En paralelo, pero son 4 y el pool tiene 3 conexiones: la cuarta espera unos
  // milisegundos. Compensa frente a encadenarlas, y esta ruta la visita una
  // persona cada mucho rato, no un buscador.
  const [[ultima], [proxima], [frescura], [catalogo], [guardia], registro] = await Promise.all([
    sql<FilaVelada>(ULTIMA_VELADA_SQL),
    sql<FilaProxima>(PROXIMA_VELADA_SQL),
    sql<FilaFrescura>(FRESCURA_SQL),
    sql<FilaCatalogo>(CATALOGO_SQL),
    sql<FilaGuardia>(GUARDIA_SQL),
    sql<FilaApunte>(REGISTRO_SQL),
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
      sinFoto: num(proxima.sin_foto),
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
      comprobaciones: comprobarFrescura({
        horasDesdeNoticia: num(frescura.horas_noticia),
        horasDesdeLuchador: num(frescura.horas_luchador),
        horasDesdeCombate: num(frescura.horas_combate),
      }),
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
        sinNingunaFotoYCompiten: num(catalogo.sin_ninguna_foto_y_compiten),
        diasHastaElPrimeroSinFoto: catalogo.dias_hasta_el_primero_sin_foto
          ? num(catalogo.dias_hasta_el_primero_sin_foto)
          : null,
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
