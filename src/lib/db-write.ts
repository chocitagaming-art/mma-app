import { Pool } from "pg";

// LA ÚNICA CONEXIÓN DE ESCRITURA DE TODA LA WEB, y existe por una razón muy
// concreta: desde el 1-ago la app se conecta como `mma_app_readonly`, que solo
// puede hacer SELECT. Eso NO se toca — es lo que impide que un fallo en
// cualquier ruta pueda modificar la base. Pero el formulario de /contacto
// escribe, así que hace falta una puerta aparte, del tamaño justo.
//
// `DATABASE_URL_WRITE` apunta al rol `mma_app_contact`, que tiene INSERT sobre
// `contact_messages` y NADA MÁS: ni SELECT sobre esa misma tabla, ni un solo
// privilegio sobre el resto de la base. Verificado conectándose como él
// (db/roles/mma_app_contact.sql en mma-ingesta).
//
// 🪤 `INSERT ... RETURNING` NO FUNCIONA con ese rol: devolver una columna es
// leerla, así que RETURNING exige SELECT y falla con "permission denied for
// table contact_messages" — el mismo mensaje que si faltara el INSERT, que es
// lo que despista. Por eso `insertarMensajeDeContacto` inserta sin RETURNING.
// No hace falta el id para nada.

declare global {
  var __mmaWritePool: Pool | undefined;
}

// Muy por debajo del pool de lectura (3): esta ruta la usa una persona cada
// mucho, y cada conexión ocupa un hueco de Neon que le hace falta a la web.
const MAX_CONEXIONES = 1;
const STATEMENT_TIMEOUT_MS = 5_000;

function crearPool(): Pool {
  const dsn = process.env.DATABASE_URL_WRITE;
  if (!dsn) {
    // Falla con un mensaje que se entiende: sin la variable el formulario no
    // puede guardar nada, y conviene que se vea en los logs tal cual.
    throw new Error("DATABASE_URL_WRITE no está configurada.");
  }
  return new Pool({
    connectionString: dsn,
    ssl: { rejectUnauthorized: true },
    max: MAX_CONEXIONES,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 8_000,
  });
}

function getWritePool(): Pool {
  if (!global.__mmaWritePool) {
    const pool = crearPool();
    // Mismo criterio que el pool de lectura: `SET` dentro de la sesión, NUNCA
    // como parámetro de arranque en `options` — el pooler de Neon los rechaza
    // y tira la conexión. Eso tumbó producción diez minutos el 1-ago.
    pool.on("connect", (client) => {
      client
        .query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`)
        .catch((error) => {
          console.error("[db-write] no se pudo fijar statement_timeout", error);
        });
    });
    global.__mmaWritePool = pool;
  }
  return global.__mmaWritePool;
}

export async function insertarMensajeDeContacto(mensaje: {
  nombre: string | null;
  email: string;
  mensaje: string;
}): Promise<void> {
  await getWritePool().query(
    // Sin RETURNING, a propósito. Ver la nota de arriba.
    "INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)",
    [mensaje.nombre, mensaje.email, mensaje.mensaje],
  );
}
