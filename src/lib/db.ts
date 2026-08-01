import { Pool, type QueryResultRow } from "pg";

declare global {
  var __mmaPool: Pool | undefined;
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return databaseUrl;
}

// Tope de la consulta más lenta que se tolera, en milisegundos. 8 s deja margen
// a un arranque en frío de Neon y muere ANTES que la función (el límite de la
// plataforma), de modo que el error se puede registrar y devolver en vez de
// perderse en un 504.
const STATEMENT_TIMEOUT_MS = 8_000;

function createPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
    // Verify Neon's TLS certificate against the system's trusted CAs. Neon
    // serves publicly-trusted certificates, so validation succeeds without extra
    // config. If a locked-down environment lacked the right root CAs, pin Neon's
    // CA here, e.g. ssl: { rejectUnauthorized: true, ca: process.env.NEON_CA }.
    ssl: { rejectUnauthorized: true },
    // Trade-off: a small per-instance pool lets the parallel queries in a single
    // request (Promise.all) actually run concurrently instead of serializing on
    // one socket, while staying low enough not to exhaust Neon's connection
    // slots across many concurrent lambdas. With a direct Neon endpoint this
    // ceiling has to stay conservative (see the production followup about the
    // Neon -pooler / PgBouncer endpoint, which would let us raise it further).
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // Corta en Postgres cualquier consulta que pase de 8 s. Sin esto no había
    // tope en NINGUNA capa: una consulta lenta retiene 1 de las 3 conexiones de
    // la instancia hasta que Postgres se canse, y con tres así la instancia se
    // queda sin pool y deja de servir. `connectionTimeoutMillis` no cubre este
    // caso: limita lo que se tarda en CONSEGUIR una conexión, no lo que dura la
    // consulta una vez conseguida.
    //
    // 8 s y no menos: la web sirve todo dinámico y hay páginas que hacen ~9
    // consultas por render, así que un corte agresivo rompería vistas legítimas
    // en un arranque en frío de Neon. 8 s y no más: el límite de Vercel Hobby es
    // 10 s, de modo que la consulta muere ANTES que la función y el error se
    // puede registrar y devolver en condiciones, en vez de perderse en un 504.
    //
    // NO SE PUEDE PONER EN `options`. Se intentó (`options: "-c
    // statement_timeout=8000"`), pasó el megatest 6/6 y TUMBÓ PRODUCCIÓN: el
    // `select 1` de /api/health devolvía 503 y las fichas dejaban de servir
    // contenido. En local el DSN apunta al endpoint DIRECTO de Neon, que acepta
    // parámetros de arranque de libpq; producción va por el endpoint pooler
    // (PgBouncer), que los rechaza y tira la conexión. Ninguna prueba local
    // podía verlo, porque la diferencia está en la cadena de conexión.
    //
    // Se aplica por conexión, en cuanto el pool abre una: `connect` salta una
    // sola vez por conexión física, no en cada consulta, así que el coste es
    // despreciable y cubre también las que el pool reabre solo.
  });
}

// Reuse the pool across warm serverless invocations of the same instance (and
// across HMR reloads in dev) instead of opening a new pool every time.
//
// Created on FIRST QUERY, not on import. Building it at module scope made the
// missing-DATABASE_URL error fire while the module was being evaluated, which is
// before any caller's try/catch exists: sitemap.ts degrades to its static routes
// when the database is unreachable, but it never got the chance, so `next build`
// died on a machine without credentials. Laziness moves the throw inside the
// call, where callers can actually handle it. Runtime behaviour is unchanged —
// the first query still opens exactly one pool per instance.
export function getPool(): Pool {
  if (!global.__mmaPool) {
    const pool = createPool();
    // `SET` normal, que PgBouncer sí admite dentro de la sesión (a diferencia
    // de los parámetros de arranque, ver la nota en createPool). Se ejecuta una
    // vez por conexión física, no por consulta.
    //
    // Si el SET falla no se tira la conexión: se pierde el tope, que es peor
    // que tenerlo pero mucho mejor que quedarse sin base de datos. El aviso
    // queda en los logs, que es donde se mira cuando algo va lento.
    pool.on("connect", (client) => {
      client
        .query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
        .catch((error) => {
          console.error("[db] no se pudo fijar statement_timeout", error);
        });
    });
    global.__mmaPool = pool;
  }
  return global.__mmaPool;
}

export async function sql<T extends QueryResultRow>(
  query: string,
  values: unknown[] = [],
) {
  const result = await getPool().query<T>(query, values);
  return result.rows;
}
