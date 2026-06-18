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
    ssl: { rejectUnauthorized: false },
    // Serverless-friendly: keep one connection per instance and fail fast so we
    // don't exhaust Neon's connection slots across concurrent lambdas.
    max: 1,
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
