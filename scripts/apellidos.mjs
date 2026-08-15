#!/usr/bin/env node
// Barrido de apellidos publicados: pasa la displayLastName REAL por los ~2.859
// nombres de `fighters` y saca los que salen mal y no están en la lista
// revisada a mano.
//
// POR QUÉ ESTO NO ES UN TEST. Un test unitario solo puede afirmar sobre nombres
// escritos a mano, y el fallo de los apellidos no vive en el código: vive en la
// BASE. El día que entre "Zhang Chenyu" nada se pondrá rojo y la ficha empezará
// a publicar "Chenyu" — que es exactamente cómo llevaban meses publicándose
// "Plessis" y "Maddalena". Esto se corre cuando entran luchadores nuevos.
//
// 🪤 Y NO PUEDE JUZGAR CON LA MISMA REGLA QUE EL CÓDIGO. Recalcular el apellido
// con una segunda copia de la regla daría siempre la razón al bug (le pasó a
// este proyecto el 11-ago con 152.249 comprobaciones). Así que aquí solo se
// SEÑALAN candidatos por criterios externos —repetición estadística de la
// primera palabra, partículas no arrastradas, apellidos de dos letras— y la
// decisión la toma una persona leyendo la lista.
//
// Uso:  DATABASE_URL=<dsn> node scripts/apellidos.mjs

import { Pool } from "pg";
import { register } from "node:module";

// Resuelve el alias "@/..." de tsconfig para poder importar el módulo real.
// Se importa el fichero de verdad, no una copia: un barrido que reimplemente la
// función comprueba su propia copia contra sí misma.
register(
  `data:text/javascript,
   const raiz = ${JSON.stringify(new URL("../src/", import.meta.url).href)};
   export async function resolve(spec, ctx, next) {
     if (spec.startsWith("@/")) return next(raiz + spec.slice(2) + ".ts", ctx);
     return next(spec, ctx);
   }`,
  import.meta.url,
);

const { displayLastName, APELLIDO_REVISADO } = await import("../src/lib/fight-headline.ts");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL (el de mma-ingesta/.env vale: solo se lee).");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(`
  select f.id, f.name, f.nationality,
         (select count(*) from fights fi
           where (fi.fighter_red_id = f.id or fi.fighter_blue_id = f.id)
             and fi.status is distinct from 'cancelled') as combates
  from fighters f
  where f.name is not null
  order by f.id
`);
await pool.end();

// Criterio EXTERNO 1: la primera palabra es un apellido que YA se confirmó a
// mano en otro luchador. Así es como entra un "Zhang Chenyu" nuevo.
//
// 🪤 La primera versión de este script usaba «primera palabra compartida por
// varias personas» y sacaba 1.711 candidatos —«Jim» abre cuatro nombres, «Alex»
// diecinueve—, que es una alarma que nadie lee. El criterio sirve para DESCUBRIR
// el patrón de golpe (y así se descubrió), pero no para vigilarlo: para vigilar
// hay que preguntar por los apellidos que ya sabemos que van delante.
const APELLIDOS_DELANTE = new Set(
  [...APELLIDO_REVISADO.entries()]
    .filter(([nombre, apellido]) => nombre.startsWith(apellido.toLowerCase() + " "))
    .map(([, apellido]) => apellido.toLowerCase()),
);

// Criterio EXTERNO 2: partículas de apellido conocidas en cualquier idioma, más
// amplias que las del módulo, para ver cuáles NO se arrastraron.
const PARTICULAS_AMPLIAS = new Set([
  "da", "das", "de", "del", "della", "delle", "di", "do", "dos", "du", "e", "y",
  "la", "las", "le", "les", "lo", "los", "saint", "st", "st.", "ste", "te",
  "van", "von", "der", "den", "ter", "af", "av", "bin", "ibn", "al", "el", "abu",
]);

const candidatos = [];
for (const r of rows) {
  if (APELLIDO_REVISADO.has(r.name.trim().toLowerCase().replace(/\s+/g, " "))) continue;

  const partes = r.name.trim().split(/\s+/);
  const publicado = displayLastName(r.name);
  const motivos = [];

  if (APELLIDOS_DELANTE.has(partes[0].toLowerCase())) {
    motivos.push(`«${partes[0]}» ya está confirmado como apellido que va DELANTE en otro luchador`);
  }
  const idx = partes.length - publicado.split(/\s+/).length;
  if (idx > 0 && PARTICULAS_AMPLIAS.has(partes[idx - 1].toLowerCase())) {
    motivos.push(`«${partes[idx - 1]}» delante y no se arrastró`);
  }
  if (publicado.replace(/[^A-Za-zÀ-ÿ]/g, "").length <= 2) {
    motivos.push(`el apellido publicado son ${publicado.length} caracteres`);
  }
  if (partes.length >= 3 && publicado.split(/\s+/).length === 1) {
    motivos.push("nombre de 3+ palabras y publica una sola");
  }

  if (motivos.length) candidatos.push({ ...r, publicado, motivos });
}

candidatos.sort((a, b) => Number(b.combates) - Number(a.combates));

console.log(`\n${rows.length} luchadores · ${APELLIDO_REVISADO.size} ya revisados a mano`);
console.log(`${candidatos.length} candidatos que NO están en la lista:\n`);
for (const c of candidatos) {
  console.log(`  ${String(c.id).padEnd(5)} ${c.name}  ->  "${c.publicado}"   (${c.combates} combates)`);
  for (const m of c.motivos) console.log(`        · ${m}`);
}
console.log(
  "\nNo son errores: son CANDIDATOS. Léelos y añade a APELLIDO_REVISADO solo los que\n" +
    "de verdad publican algo que no es el apellido de esa persona.\n",
);
