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

export const pool =
  global.__mmaPool ??
  new Pool({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });

if (process.env.NODE_ENV !== "production") {
  global.__mmaPool = pool;
}

export async function sql<T extends QueryResultRow>(
  query: string,
  values: unknown[] = [],
) {
  const result = await pool.query<T>(query, values);
  return result.rows;
}