# 🥊 MMA STATUS — Manual del producto

> Guía completa de **MMA STATUS**: qué es, cómo se usa, cómo funciona por dentro y cómo se opera y mantiene.
> Web en producción: **https://mma-app-ruby.vercel.app**
>
> Este manual está pensado para dos lectores: quien **usa** la web y quien la **mantiene** (tú). Está en español; el código y los identificadores van en inglés (estándar de la industria).

---

## 1. ¿Qué es MMA STATUS?

MMA STATUS es una **web de estadísticas de MMA (UFC)** construida sobre datos reales: perfiles de luchadores, historial de peleas, clasificación oficial, eventos y cartelera, noticias, vídeos y un **modelo de machine learning** que predice el resultado de un enfrentamiento. Incluye un asistente conversacional ("el Maestro") que responde con datos de la base de datos real.

Se compone de **dos repositorios**:

| Repo | Qué hace | Stack | Despliegue |
|---|---|---|---|
| **`mma-app`** | La web (lo que ve el usuario) | Next.js 16 (App Router) · TypeScript · Tailwind · `pg` | **Vercel** (auto-deploy al hacer push a `main`) |
| **`mma-ingesta`** | Scrapers de datos + pipeline y servicio de ML | Python · PostgreSQL · XGBoost · FastAPI | Cron de scraping; microservicio **no desplegado** (corre en local) |

Ambos comparten una base de datos **PostgreSQL en Neon** (la fuente de verdad).

---

## 2. Cómo se usa la web (página por página)

La barra de navegación superior tiene: **Inicio · Luchadores · Clasificación · Eventos · Enfrentamiento · Maestro · Noticias · Vídeos**. En móvil se colapsa en un menú hamburguesa (se cierra con `Esc`). Hay un conmutador de **tema claro/oscuro** (la estética por defecto es ESPN/oscuro).

### Inicio (`/`)
Portada con buscador global (luchadores, eventos, noticias), contadores en vivo (nº de luchadores, peleas, eventos, registros de estadísticas), un **reel de noticias** (marquee), las **noticias recientes** con imagen, los **vídeos oficiales de UFC** (YouTube) y el ranking **libra por libra**.

### Luchadores (`/fighters`)
Listado con **filtros** (categoría de peso, nacionalidad, guardia, orden) y búsqueda por nombre. Cada tarjeta enlaza a la ficha del luchador.

### Ficha del luchador (`/fighters/[id]`)
- **Resumen de rendimiento**: récord, **racha actual** (p.ej. "2 victorias seguidas") y **forma reciente** (últimas 5, p.ej. "4-1"), precisión de golpeo y de derribo.
- **Silueta de golpes**: muñeco que muestra, por zona (cabeza/cuerpo/pierna) y posición (a distancia/clinch/suelo), dónde **conecta** (ofensiva) y dónde **recibe** (defensiva).
- **Perfil de rendimiento**: volumen de golpeo, defensa, victorias por método.
- **Trayectoria de ranking**: evolución de su posición en el ranking a lo largo del tiempo.
- **Historial de peleas**: tabla con fecha, oponente, resultado, método, evento y un enlace **"Ver"** al vídeo (vídeo curado si existe, si no una búsqueda en YouTube). Las peleas aún no disputadas no muestran enlace de vídeo.
- **Próximos combates** (si los hay).

### Clasificación (`/clasificacion`)
Rankings oficiales por división (incluido libra por libra). Cada fila muestra el **movimiento** respecto al snapshot anterior (sube/baja/nuevo), accesible para lectores de pantalla.

### Eventos (`/eventos`) y ficha de evento (`/eventos/[id]`)
Listado de eventos y, en cada evento, su **cartelera** (estelar + preliminares). En los combates con cuotas (eventos próximos) se muestra un **badge del favorito del mercado** con su probabilidad implícita.

### Ficha de pelea (`/fights/[id]`)
- **Combate por disputarse**: si la pelea es futura, ofrece la predicción.
- **Mercado vs Modelo** (feature estrella): para combates próximos con cuotas y ambos peleadores, confronta la **probabilidad implícita del mercado** (cuotas sin el margen de la casa) contra la **probabilidad del modelo**. Indica si **coinciden** o si **el modelo discrepa**, y dónde ve más valor (en puntos). Si el servicio de predicción no está disponible, degrada con calma a "solo mercado".
- **Reproductor de combate**: si hay un vídeo de YouTube curado, lo reproduce embebido (sin cargar YouTube hasta que pulsas play); si no, ofrece "Ver combate" / "Buscar en YouTube".
- **Comparativa** (tale of the tape): estadísticas lado a lado.

### Enfrentamiento (`/enfrentamiento`)
El **cara a cara** configurable: eliges esquina roja y azul y, al instante, ves la **comparativa**, la **silueta de golpes** de ambos y el **historial directo**. Con el botón **"Predecir resultado"** se ejecuta el modelo y aparecen:
- **Probabilidad por esquina** + favorito del modelo.
- **Señales por esquina**: racha, victorias en las últimas 5, **calidad del rival** (% medio de victorias de sus oponentes) y defensas. (Se calculan a la fecha del enfrentamiento; en revanchas se indica.)
- **Factores clave del modelo**: las variables que más inclinan la predicción (en español).
- **Explicación IA** en lenguaje natural (Claude) — con respaldo a un resumen local si la IA no responde.

La URL es **compartible** (lleva los ids de ambos peleadores).

### Maestro (`/maestro`)
Asistente conversacional de UFC. Récords, estadísticas, rankings, eventos y noticias salen de la **base de datos real** (vía herramientas/tools); la historia y curiosidades, de su conocimiento. Anuncia sus respuestas a lectores de pantalla; si el servicio no está disponible, lo indica con calma.

### Noticias (`/news`) y Vídeos (`/videos`)
Noticias de MMA con categorías (en español) y filtro; vídeos oficiales de canales de UFC en YouTube (destacados, resúmenes, entrevistas), reproducibles ahí mismo.

---

## 3. Cómo interpretar la predicción

- **Modelo PURO**: el modelo se entrena **solo con estadísticas** (récords, físico, golpeo, grappling, forma, calidad de rival…). **Las cuotas NO son una variable del modelo** — solo se usan para la comparación visual "Mercado vs Modelo".
- **Precisión ~63%** (acc 0.6289, calibrado y simetrizado). Es una **estimación con incertidumbre**, no una certeza: en MMA hasta un favorito claro puede caer.
- **Baja confianza**: si alguno de los dos peleadores tiene poco historial (p.ej. debutantes), el modelo no puede inclinar la balanza y muestra una base cercana al **50/50** etiquetada como tal — no la trates como un favorito real.
- **Mercado vs Modelo**: el "edge" es la diferencia en puntos entre lo que da el modelo y lo que implica el mercado para un peleador. Que **discrepen** es justo lo interesante (dónde el modelo ve valor que el mercado no).

---

## 4. Fuentes de datos

| Dato | Fuente |
|---|---|
| Luchadores, peleas, estadísticas, eventos, rankings | Scraping de UFC/ESPN (repo `mma-ingesta`) → **Neon PostgreSQL** |
| Cuotas (odds) | **The Odds API** (solo eventos **próximos**; las peleas históricas no tienen cuotas) |
| Vídeos | **YouTube** (Data API v3 con respaldo a RSS) — canales oficiales de UFC |
| Predicción ML | Modelo XGBoost entrenado en `mma-ingesta`, servido por un microservicio FastAPI |
| Explicaciones IA y Maestro | **Anthropic (Claude)** |

---

## 5. Arquitectura (vista para desarrollador)

```
            ┌─────────────────────────┐         ┌──────────────────────────┐
 Usuario ──▶│  mma-app (Next.js)       │── SQL ─▶│  Neon PostgreSQL          │
            │  Vercel · solo LECTURA   │         │  (fuente de verdad)       │
            └──────────┬──────────────┘         └──────────▲───────────────┘
                       │  /api/predict                       │ escrituras
                       ▼                                     │
            ┌─────────────────────────┐         ┌───────────┴──────────────┐
            │ Microservicio ML (FastAPI│── SQL ─▶│  mma-ingesta (Python)     │
            │ XGBoost) — NO desplegado │         │  scrapers + pipeline ML   │
            │ (corre en local)         │         │  + The Odds API + YouTube │
            └─────────────────────────┘         └──────────────────────────┘
                       │  /api/maestro, explicaciones
                       ▼
            ┌─────────────────────────┐
            │  Anthropic (Claude)      │
            └─────────────────────────┘
```

- **`mma-app`** es **100% lectura** sobre Neon (no hace INSERT/UPDATE/DELETE). Las escrituras las hace `mma-ingesta`.
- El **microservicio de predicción** está endurecido pero **no desplegado** en esta tanda: en producción `/api/predict` responde **503** y la UI lo maneja con elegancia (muestra solo el mercado / botón "Reintentar"). En local funciona.
- Deploy de la web: **push a `chocitagaming-art/main`** dispara el build en Vercel automáticamente.

---

## 6. Cómo ejecutar en local

**Web (`mma-app`):**
```bash
cd mma-app
npm install
npm run dev -- -p 3100      # http://localhost:3100  (el :3000 suele estar ocupado)
```
Requiere `mma-app/.env.local` con `DATABASE_URL` y (opcional) `ANTHROPIC_API_KEY`, `PREDICTION_SERVICE_URL`, `YOUTUBE_API_KEY`.

**Microservicio de predicción (`mma-ingesta`)** — necesario para que la predicción funcione en local:
```bash
cd mma-ingesta
./.venv/Scripts/python.exe -m uvicorn src.prediction.service:app --port 8000
# /health -> 200 ; la web lee PREDICTION_SERVICE_URL=http://localhost:8000 de .env.local
```

**Tests:**
```bash
cd mma-app && npm test          # vitest
cd mma-ingesta && ./.venv/Scripts/python.exe -m pytest tests/ -q
```

**Lint / tipos (mma-app):** `npm run lint` · `npx tsc --noEmit`.

---

## 7. Operación y mantenimiento

- **Desplegar la web**: `git push` a `chocitagaming-art/main` (autor de commits `chocitagaming-art`). Vercel construye y publica.
- **Integración continua**: hay workflows de GitHub Actions (`.github/workflows/ci.yml`) en ambos repos (lint+tsc+tests en mma-app; pytest en mma-ingesta). **Pendiente: habilitar Actions** en la configuración de cada repo.
- **Scrapers / ingesta** (`mma-ingesta`): cron de refresco (rankings, próximos eventos, etc.). Los scripts destructivos van en **dry-run por defecto** y requieren `--apply` para escribir.
- **Curar vídeos**: `python -m src.scrapers.backfill_fight_videos` (dry-run por defecto; `--apply` para escribir; busca el vídeo oficial de UFC con guarda de confianza).
- **Reentrenar el modelo** (con backup previo de `model.joblib`): pipeline `features → train → calibrate → evaluate` en `mma-ingesta`.

---

## 8. Variables de entorno

Ver `.env.example` en cada repo. Resumen:

- **`mma-app`**: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `PREDICTION_SERVICE_URL`, `PREDICTION_SERVICE_API_KEY`, `YOUTUBE_API_KEY`.
- **`mma-ingesta`**: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`, `ODDS_API_KEY`, `PREDICTION_ENV`, `PREDICTION_DB_POOL_MAX`, `PREDICTION_DATA_TTL_SECONDS`, `PREDICTION_SERVICE_API_KEY`.

---

## 9. Limitaciones conocidas y pendientes

- **Microservicio de predicción no desplegado** → en producción la predicción IA y "Mercado vs Modelo (modelo)" degradan a 503 (manejado). Para activarlo: desplegar en Render/Railway y apuntar `PREDICTION_SERVICE_URL`.
- **Cuotas solo para eventos próximos** (The Odds API es *upcoming-only*); las peleas históricas no tienen "Mercado vs Modelo".
- **Dominio `mma-status.app`** referenciado pero sin DNS resuelto; la web vive en la URL `*.vercel.app`.
- **Pendientes de infra/calidad (Fase 13)**: habilitar GitHub Actions; crear un **rol read-only en Neon** para la web (es 100% lectura) y poner su credencial en Vercel; partir los *god files* (`fighters.ts`, `matchup-client.tsx`, `features.py`) — refactor de mantenibilidad.
- **Señales del cara a cara en revanchas**: se calculan a la fecha del combate compartido (indicado en la UI); mejora futura: anclarlas a "hoy" en el microservicio.

---

## 10. Glosario rápido

- **Tale of the tape / Comparativa**: comparación estadística lado a lado de dos peleadores.
- **Probabilidad implícita (sin vig)**: probabilidad que implican las cuotas tras quitar el margen de la casa de apuestas.
- **Edge / valor**: diferencia entre la probabilidad del modelo y la del mercado.
- **SoS / Calidad del rival**: *strength of schedule*; % medio de victorias de los oponentes enfrentados.
- **Baja confianza**: predicción ~50/50 por falta de historial de algún peleador.
- **Modelo puro**: entrenado solo con estadísticas, nunca con cuotas.

---

*Documento generado al cierre del roadmap de mejoras (Fases 1–13). Para el detalle técnico de cada fase, decisiones congeladas y followups, ver `docs/MMA_CONTINUACION_2026-06-27.md`, `docs/MMA_PLAN_MEJORAS_2026-06-27.md` y `docs/MMA_AUDIT_2026-06-27.md`.*
