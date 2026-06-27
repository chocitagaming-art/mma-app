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
  });
}

// Reuse the pool across warm serverless invocations of the same instance (and
// across HMR reloads in dev) instead of opening a new pool every time.
export const pool = global.__mmaPool ?? createPool();
global.__mmaPool = pool;

export async function sql<T extends QueryResultRow>(
  query: string,
  values: unknown[] = [],
) {
  const result = await pool.query<T>(query, values);
  return result.rows;
}
