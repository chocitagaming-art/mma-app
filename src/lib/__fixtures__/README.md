# Fixtures

Datos reales congelados, para tests que no tocan la red ni la base.

Convención (la que ya seguía `predict-response.json`): **copia fiel de lo que
el código recibe en producción**, no la forma cruda de la tabla. Se importan
con `import x from "@/lib/__fixtures__/…json"` (ver
`src/lib/prediction-contract.test.ts:17`).

| Fichero | Qué es |
|---|---|
| `predict-response.json` | Respuesta del servicio de predicción, byte a byte |
| `grip-live-*.json` | Series de muestras del directo para T3 (variante B del reparto de agarre) |

---

## `grip-live-<fight_id>.json` — series del directo

**Forma:** `FightTimelineSample[]` (`src/lib/fight-timeline.ts:24-31`), es decir
**la salida** de `getFightSampleSeries` (`src/lib/queries/live.ts:138-168`) para
ese `fight_id`, ya pasada por `mapFightTimelineSample`. Claves en *camelCase*,
`byFighter` indexado por `fighter_id` en texto y con las 15 claves compactas de
`LiveStatValues` (`src/lib/live-stats.ts:16-32`).

Se usan así:

```ts
import samples from "@/lib/__fixtures__/grip-live-14232.json";
import type { FightTimelineSample } from "@/lib/fight-timeline";

const series = samples as FightTimelineSample[];
```

Detalles que NO hay que "arreglar" al leerlas:

- `displayClock` vale `"-"` (no `null`) en los descansos: `mapFightTimelineSample`
  solo anula la cadena vacía, y `"-".trim()` es verdadero.
- `sampledAt` es el `timestamptz::text` de Postgres tal cual
  (`"2026-08-08 22:22:22.354888+00"`), porque la query pide `sampled_at::text`.
- El orden es el de la query: `sampled_at ASC, id ASC`.
- Ninguna fila se pierde en el mapeo: las 42 filas de 14232 son 42 muestras.

### Consulta exacta que las generó

Fecha de extracción: **2026-08-15**. Base: Neon (`DATABASE_URL` de
`mma-ingesta/.env`), tabla `live_fight_stat_samples` (migración 024). Solo
lectura.

```sql
-- psql "$DATABASE_URL" -At -v fid=14232 -f grip-fixture.sql
--   | node -e "…JSON.stringify(JSON.parse(entrada), null, 2)…"
SELECT json_agg(
         json_build_object(
           'state',        s.state,
           'statusName',   s.status_name,
           'period',       s.period,
           'displayClock', CASE WHEN btrim(coalesce(s.display_clock, '')) = ''
                                THEN NULL ELSE s.display_clock END,
           'byFighter',    (
             SELECT json_object_agg(e.k, json_build_object(
                      'kd',   (e.v->>'kd')::int,
                      'tsl',  (e.v->>'tsl')::int,
                      'tsa',  (e.v->>'tsa')::int,
                      'ssl',  (e.v->>'ssl')::int,
                      'ssa',  (e.v->>'ssa')::int,
                      'hl',   (e.v->>'hl')::int,
                      'ha',   (e.v->>'ha')::int,
                      'bl',   (e.v->>'bl')::int,
                      'ba',   (e.v->>'ba')::int,
                      'll',   (e.v->>'ll')::int,
                      'la',   (e.v->>'la')::int,
                      'tdl',  (e.v->>'tdl')::int,
                      'tda',  (e.v->>'tda')::int,
                      'sub',  (e.v->>'sub')::int,
                      'ctrl', (e.v->>'ctrl')::int
                    ) ORDER BY e.k::bigint)
             FROM jsonb_each(s.stats) AS e(k, v)
           ),
           'sampledAt',    s.sampled_at::text
         )
         ORDER BY s.sampled_at ASC, s.id ASC
       )
FROM live_fight_stat_samples s
WHERE s.fight_id = :fid;
```

Comprobado (2026-08-15) contra el camino real: mapear las filas crudas con
`mapFightTimelineSample` y serializar da **exactamente** el contenido de cada
fichero, en los **ocho** combates, sin perder ni una fila en el mapeo. La fixture
la escribió SQL y la comprobación la hizo el mapeador de producción: no es la
misma fórmula verificándose a sí misma.

Las tres últimas (`12875`, `12877`, `14493`) se añadieron en la sesión 9, al
escribir T3. Motivo: son los otros tres combates a los que les falta el ancla de
R1 —los cuatro son 12875, 12877, 12880 y 14493, no solo 12880— y sin ellos el
peor error de la variante ingenua quedaba cubierto por un único caso.

### Qué combate cubre qué

`ctrl` en segundos, rojo/azul. Las columnas del acta salen de otra fuente
(`fight_stats_rounds`, acta de ufcstats), nunca de estas muestras:

```sql
SELECT r.fight_id, r.fighter_id, r.round, r.control_time_seconds
FROM fight_stats_rounds r
WHERE r.fight_id IN (14232, 12872, 14022, 12880, 12873, 12875, 12877, 14493)
ORDER BY r.fight_id, r.fighter_id, r.round;
```

| Fichero | Muestras | Rojo / Azul | Acta por asalto | Para qué |
|---|---|---|---|---|
| `grip-live-14232.json` | 42 | 7245 Sousa / 9109 Miranda | 64/147 · 57/31 · 48/53 | El combate del maquetado (U-DEC, 3 asaltos). Anclas en los índices 12, 26 y 41 |
| `grip-live-12872.json` | 41 | 6254 Aliev / 6958 Davis | 269/18 · 249/0 · 227/18 | El ancla de R3 es `state:"post"` **con `displayClock:"-"`**: filtrar por estado y filtrar por reloj borran la misma fila. Anclas 13, 25, 40 |
| `grip-live-14022.json` | 39 | 6455 Gibson / 9099 Hussein | 66/62 · 0/284 · 10/121 | La `post` final **corrige a la baja** el `ctrl` del azul (469 → 467). Anclas 14, 28, 38 |
| `grip-live-12880.json` | 1 | 7184 Buzukja / 6243 Grad | 0/164 · 0/100 | Muestra única con `period: 2`: **R1 no tiene ancla**. Repartir por diferencias le daría a R2 los 264 s enteros; el acta dice 100 |
| `grip-live-12873.json` | 1 | 6290 Medic / 6930 Rodriguez | 4/0 | Control positivo del caso anterior: muestra única con `period: 1`, aquí el asalto **sí** es medible (4/0 = acta) |
| `grip-live-12877.json` | 1 | 6348 Klein / 6970 Musayev | 0/20 · 0/42 | Falta el ancla de R1 **con el error pequeño** (+20 s). El tamaño del fallo no decide si es un fallo: si solo se prueba con 12880 (+164 s), un umbral de tolerancia mal puesto deja pasar este |
| `grip-live-14493.json` | 1 | 9103 Nikolic / 9021 Vologdin | 28/62 · 41/4 · 176/5 | Falta el ancla de R1 y **se pasan LOS DOS lados** (+69 rojo, +66 azul). Además el `fighter_id` del azul es **menor** que el del rojo, así que delata a quien tome «el primero de `byFighter`» por la esquina roja |
| `grip-live-12875.json` | 1 | 6343 Rakic / 7053 Tybura | 0/0 · 0/0 · 191/0 | 🪤 **EL FALSO NEGATIVO PERFECTO.** También le falta el ancla de R1, pero su acta es 0 en los dos primeros asaltos, así que la regla equivocada —darle el acumulado entero al asalto de la muestra— **acierta por casualidad**. Está aquí para que nadie lo use como prueba de nada |

### Anclas (última muestra de cada `period`)

| Combate | R1 | R2 | R3 |
|---|---|---|---|
| 14232 | idx 12 · `in` · END_OF_ROUND · `"-"` · 64/147 | idx 26 · `in` · END_OF_ROUND · `"-"` · 121/178 | idx 41 · `post` · FINAL · `"5:00"` · 169/231 |
| 12872 | idx 13 · `in` · END_OF_ROUND · `"-"` · 269/18 | idx 25 · `in` · END_OF_ROUND · `"-"` · 518/18 | idx 40 · `post` · FINAL · `"-"` · 745/36 |
| 14022 | idx 14 · `in` · END_OF_ROUND · `"-"` · 66/62 | idx 28 · `in` · END_OF_ROUND · `"-"` · 66/346 | idx 38 · `post` · FINAL · `"1:51"` · 76/467 |

Los tres reproducen su acta exactamente restando acumulados entre anclas
consecutivas. Por eso el acta sirve de oráculo del test: es un número que la
fórmula bajo prueba no ha calculado.

### Por qué la serie entera y no solo las filas ancla

Con una sola fila por asalto, "la última", "la primera" y "la de mayor tiempo
transcurrido" son la misma fila, así que un test montado sobre las 3 anclas de
14232 da **verde** con la regla equivocada. Medido sobre estas fixtures
(2026-08-15), con la regla "me quedo con la última muestra que tenga reloj y,
si un asalto se queda sin ninguna, uso la última igualmente":

- sobre las 3 filas ancla → `64/147 · 57/31 · 48/53`, **verde**;
- sobre las 42 muestras reales → `61/149 · 58/29 · 50/53`, falla contra el acta.

Y al revés: 14232 completo **no** distingue el filtro por `state` (su `post`
final repite el `ctrl` de la muestra anterior, 169/231). Ese medio invariante lo
cazan 12872 (227/18 → 226/17), 14022 (10/121 → 10/123) y 12873/12880, donde
quitar las `post` deja el combate entero sin ninguna muestra.
