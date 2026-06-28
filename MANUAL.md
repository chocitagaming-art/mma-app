# 🥊 MMA STATUS — Manual del producto

> Guía de **MMA STATUS**: para quien usa la web y para quien quiera entender cómo funciona por dentro.
> Web en producción: **https://mma-app-ruby.vercel.app**
>
> Está en español; el código y los identificadores van en inglés (estándar de la industria).

---

## 1. ¿Qué es MMA STATUS?

MMA STATUS es una web de estadísticas de MMA (UFC) construida sobre datos reales: perfiles de luchadores, historial de peleas, clasificación oficial, eventos y cartelera, noticias, vídeos y un modelo de machine learning que predice el resultado de un enfrentamiento. Incluye un asistente conversacional ("el Maestro") que responde con datos de la base de datos real.

Se compone de dos partes:

| Parte | Qué hace | Stack |
|---|---|---|
| **`mma-app`** | La web (lo que ve el usuario) | Next.js 16 (App Router) · TypeScript · Tailwind · `pg` |
| **`mma-ingesta`** | Scrapers de datos + pipeline y servicio de ML | Python · PostgreSQL · XGBoost · FastAPI |

Ambas comparten una base de datos PostgreSQL en Neon (la fuente de verdad).

---

## 2. Cómo se usa la web (página por página)

La barra de navegación superior tiene: **Inicio · Luchadores · Clasificación · Eventos · Enfrentamiento · Maestro · Noticias · Vídeos**. En móvil se colapsa en un menú hamburguesa (se cierra con `Esc`). Hay un conmutador de tema claro/oscuro (la estética por defecto es ESPN/oscuro).

### Inicio (`/`)
Portada con buscador global (luchadores, eventos, noticias), contadores en vivo (nº de luchadores, peleas, eventos, registros de estadísticas), un reel de noticias (marquee), las noticias recientes con imagen, los vídeos oficiales de UFC (YouTube) y el ranking libra por libra.

### Luchadores (`/fighters`)
Listado con filtros (categoría de peso, nacionalidad, guardia, orden) y búsqueda por nombre. Cada tarjeta enlaza a la ficha del luchador.

### Ficha del luchador (`/fighters/[id]`)
- **Resumen de rendimiento**: récord, racha actual (p.ej. "2 victorias seguidas") y forma reciente (últimas 5, p.ej. "4-1"), precisión de golpeo y de derribo.
- **Silueta de golpes**: muñeco que muestra, por zona (cabeza/cuerpo/pierna) y posición (a distancia/clinch/suelo), dónde conecta (ofensiva) y dónde recibe (defensiva).
- **Perfil de rendimiento**: volumen de golpeo, defensa, victorias por método.
- **Trayectoria de ranking**: evolución de su posición en el ranking a lo largo del tiempo.
- **Historial de peleas**: tabla con fecha, oponente, resultado, método, evento y un enlace "Ver" al vídeo (vídeo curado si existe, si no una búsqueda en YouTube). Las peleas aún no disputadas no muestran enlace de vídeo.
- **Próximos combates** (si los hay).

### Clasificación (`/clasificacion`)
Rankings oficiales por división (incluido libra por libra). Cada fila muestra el movimiento respecto al snapshot anterior (sube/baja/nuevo), accesible para lectores de pantalla.

### Eventos (`/eventos`) y ficha de evento (`/eventos/[id]`)
Listado de eventos y, en cada evento, su cartelera (estelar + preliminares). En los combates con cuotas (eventos próximos) se muestra un badge del favorito del mercado con su probabilidad implícita.

### Ficha de pelea (`/fights/[id]`)
- **Combate por disputarse**: si la pelea es futura, ofrece la predicción.
- **Mercado vs Modelo**: para combates próximos con cuotas y ambos peleadores, confronta la probabilidad implícita del mercado (cuotas sin el margen de la casa) contra la probabilidad del modelo. Indica si coinciden o si el modelo discrepa, y dónde ve más valor (en puntos). Comparar mercado y modelo lado a lado es poco habitual en proyectos parecidos.
- **Reproductor de combate**: si hay un vídeo de YouTube curado, lo reproduce embebido (sin cargar YouTube hasta que pulsas play); si no, ofrece "Ver combate" / "Buscar en YouTube".
- **Comparativa** (tale of the tape): estadísticas lado a lado.

### Enfrentamiento (`/enfrentamiento`)
El cara a cara configurable: eliges esquina roja y azul y, al instante, ves la comparativa, la silueta de golpes de ambos y el historial directo. Con el botón "Predecir resultado" se ejecuta el modelo y aparecen:
- **Probabilidad por esquina** + favorito del modelo.
- **Señales por esquina**: racha, victorias en las últimas 5, calidad del rival (% medio de victorias de sus oponentes) y defensas. (Se calculan a la fecha del enfrentamiento; en revanchas se indica.)
- **Factores clave del modelo**: las variables que más inclinan la predicción (en español).
- **Explicación IA** en lenguaje natural (Claude).

La URL es compartible (lleva los ids de ambos peleadores).

### Maestro (`/maestro`)
Asistente conversacional de UFC. Récords, estadísticas, rankings, eventos y noticias salen de la base de datos real (vía herramientas/tools); la historia y curiosidades, de su conocimiento. Anuncia sus respuestas a lectores de pantalla.

### Noticias (`/news`) y Vídeos (`/videos`)
Noticias de MMA con categorías (en español) y filtro; vídeos oficiales de canales de UFC en YouTube (destacados, resúmenes, entrevistas), reproducibles ahí mismo.

---

## 3. Cómo interpretar la predicción

- **Modelo puro**: el modelo se entrena solo con estadísticas (récords, físico, golpeo, grappling, forma, calidad de rival…), en total 20 features. Las cuotas no son una variable del modelo: solo se usan para la comparación visual "Mercado vs Modelo".
- **Precisión ~63%** (acc 0.6289) y **Brier 0.2266** (calibrado y simetrizado), entrenado sobre un dataset de ~2.838 luchadores y ~8.750 peleas. Es una estimación con incertidumbre, no una certeza: en MMA hasta un favorito claro puede caer.
- **Baja confianza**: si alguno de los dos peleadores tiene poco historial (p.ej. debutantes), el modelo no puede inclinar la balanza y muestra una base cercana al 50/50 etiquetada como tal — no la trates como un favorito real.
- **Mercado vs Modelo**: el "edge" es la diferencia en puntos entre lo que da el modelo y lo que implica el mercado para un peleador. Que discrepen es justo lo interesante: dónde el modelo ve valor que el mercado no.

### Aviso sobre cuotas y valor

Las cuotas y el "valor/edge" que muestra la web son **información estadística, no consejo de apuestas**. El modelo es una herramienta de análisis y puede equivocarse. Si decides apostar, hazlo con responsabilidad: apuesta solo lo que puedas permitirte perder y, ante cualquier señal de problema, busca ayuda de juego responsable.

---

## 4. Fuentes de datos

| Dato | Fuente |
|---|---|
| Luchadores, peleas, estadísticas, eventos, rankings | Scraping de UFC/ESPN (`mma-ingesta`) → Neon PostgreSQL |
| Cuotas (odds) | The Odds API (solo eventos próximos; las peleas históricas no tienen cuotas) |
| Vídeos | YouTube (Data API v3 con respaldo a RSS) — canales oficiales de UFC |
| Predicción ML | Modelo XGBoost entrenado en `mma-ingesta`, servido por un microservicio FastAPI |
| Explicaciones IA y Maestro | Anthropic (Claude) |

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
            │ XGBoost)                 │         │  scrapers + pipeline ML   │
            │                          │         │  + The Odds API + YouTube │
            └─────────────────────────┘         └──────────────────────────┘
                       │  /api/maestro, explicaciones
                       ▼
            ┌─────────────────────────┐
            │  Anthropic (Claude)      │
            └─────────────────────────┘
```

- **`mma-app`** es 100% lectura sobre Neon (no hace INSERT/UPDATE/DELETE). Las escrituras las hace `mma-ingesta`.
- La predicción se sirve a través del microservicio FastAPI: `/api/predict` consulta el modelo XGBoost y la UI muestra el resultado (probabilidades, factores y explicación).

---

## 6. Cómo ejecutar en local

**Web (`mma-app`):**
```bash
cd mma-app
npm install
npm run dev
```

**Microservicio de predicción (`mma-ingesta`):**
```bash
cd mma-ingesta
python -m uvicorn src.prediction.service:app --port 8000
# /health -> 200
```

**Tests:**
```bash
cd mma-app && npm test          # vitest
cd mma-ingesta && python -m pytest tests/ -q
```

**Lint / tipos (mma-app):** `npm run lint` · `npx tsc --noEmit`.

La configuración local (base de datos, claves de servicios) se toma de los `.env.example` de cada repo.

---

## 7. Operación y mantenimiento

- **Scrapers / ingesta** (`mma-ingesta`): cron de refresco (rankings, próximos eventos, etc.). Los scripts destructivos van en dry-run por defecto y requieren `--apply` para escribir.
- **Curar vídeos**: `python -m src.scrapers.backfill_fight_videos` (dry-run por defecto; `--apply` para escribir; busca el vídeo oficial de UFC con guarda de confianza).
- **Reentrenar el modelo** (con backup previo de `model.joblib`): pipeline `features → train → calibrate → evaluate` en `mma-ingesta`.

---

## 8. Glosario rápido

- **Tale of the tape / Comparativa**: comparación estadística lado a lado de dos peleadores.
- **Probabilidad implícita (sin vig)**: probabilidad que implican las cuotas tras quitar el margen de la casa de apuestas.
- **Edge / valor**: diferencia entre la probabilidad del modelo y la del mercado.
- **SoS / Calidad del rival**: *strength of schedule*; % medio de victorias de los oponentes enfrentados.
- **Baja confianza**: predicción ~50/50 por falta de historial de algún peleador.
- **Modelo puro**: entrenado solo con estadísticas, nunca con cuotas.

---

*Última actualización: junio 2026.*
