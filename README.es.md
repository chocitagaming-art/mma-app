# MMA STATUS

Una web de estadísticas de UFC, en vivo, con un modelo de machine learning que predice peleas. Fichas de luchadores, clasificación oficial, comparativas cara a cara, las cuotas del mercado frente al modelo, un asistente con IA y vídeos de combates, todo sobre datos reales scrapeados.

[![Demo en vivo](https://img.shields.io/badge/demo-en%20vivo-22c55e?style=flat-square)](https://mma-app-ruby.vercel.app)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss)
![Tests](https://img.shields.io/badge/tests-138%20passing-22c55e?style=flat-square)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue?style=flat-square)

**Web en vivo: [mma-app-ruby.vercel.app](https://mma-app-ruby.vercel.app)**

Léelo en: [English](./README.md) · **Español**

![Página de inicio de MMA STATUS](docs/screenshots/home.png)

## Qué es

MMA STATUS es la mitad web de un proyecto de dos repos. Este repo es el sitio que ves: una app de Next.js que lee datos de UFC y los sirve como fichas de luchador, clasificación, un comparador cara a cara y un predictor de peleas. El otro repo, [mma-ingesta](https://github.com/chocitagaming-art/mma-ingesta), hace el scraping, el machine learning y levanta el servicio de predicción. Los dos comparten una base de datos PostgreSQL en Neon, y la web solo lee de ella.

Los datos son reales. Luchadores, peleas, estadísticas, rankings y eventos salen de scrapear UFC y ESPN. Las cuotas vienen de The Odds API (solo eventos próximos). Los vídeos, de YouTube. La predicción la da un modelo XGBoost entrenado con estadísticas de los peleadores, y las explicaciones las escribe Claude.

## Un paseo por la web

**Ficha del luchador** con récord, racha actual, forma en las últimas cinco, precisión de golpeo y de derribo, y una silueta que muestra dónde conecta un peleador y dónde recibe, por zona y por posición.

![Ficha de luchador](docs/screenshots/fighter-profile.png)

**Predicción** para cualquier enfrentamiento. Eliges esquina roja y azul, pulsas predecir, y el modelo devuelve una probabilidad para cada uno, las señales por esquina que hay detrás (racha, victorias recientes, calidad del rival, defensa), los factores que más inclinan la decisión y una explicación corta en español.

![Predicción de pelea](docs/screenshots/prediction.png)

**Clasificación oficial** por división y libra por libra, masculina y femenina, con el movimiento desde el último snapshot.

![Clasificación UFC](docs/screenshots/rankings.png)

## Funciones

- Fichas de luchador: récord, racha actual y forma en las últimas cinco, precisión de golpeo y derribo, victorias por método, y una silueta de golpes por zona (cabeza, cuerpo, pierna) y posición (distancia, clinch, suelo).
- Un comparador cara a cara. Eliges dos luchadores y comparas la tabla comparativa, las dos siluetas de golpes y el historial directo. La URL se comparte, así que un enfrentamiento es un enlace.
- Predicción de peleas con un modelo entrenado solo con estadísticas. Nunca ve las cuotas. Cada predicción trae señales por esquina y una explicación escrita.
- Mercado vs modelo en peleas próximas: la probabilidad implícita de las cuotas, ya sin el margen de la casa, junto a lo que cree el modelo, y dónde ve valor.
- Trayectoria de ranking en cada ficha, para ver cómo un peleador sube o baja con el tiempo.
- "El Maestro", un asistente de chat que responde con datos de la base de datos real (récords, estadísticas, rankings, eventos) en vez de inventar.
- Vídeos de combates curados y noticias de MMA.

## Cómo funciona la predicción

Algunas cosas que conviene decir con honestidad, porque la mayoría de predictores no lo hacen:

- El modelo se entrena **solo con estadísticas** de los peleadores: récords, físico, golpeo, grappling, forma, calidad del rival. Las cuotas nunca entran. Cuando ves las cuotas al lado del modelo, es una comparación, no una variable.
- La precisión ronda el **63%** (0.6289, calibrado y simetrizado). Es una estimación con incertidumbre real, no una certeza. En MMA hasta un favorito claro acaba KO.
- Si uno de los dos tiene poco historial, como un debutante, el modelo lo dice y se queda cerca del 50/50 en lugar de inventarse confianza.
- El modelo lo sirve un microservicio FastAPI que vive en el otro repo. En desarrollo corre en local. En producción la app degrada con calma cuando el servicio está caído: muestra el lado del mercado y un botón de reintentar en vez de un error rojo.

## Stack

- **Web (este repo):** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, `pg`. Desplegado en Vercel.
- **Datos y ML ([mma-ingesta](https://github.com/chocitagaming-art/mma-ingesta)):** Python, PostgreSQL en Neon, XGBoost, FastAPI. Scrapers de UFC y ESPN, cuotas de The Odds API, vídeos de la YouTube Data API.
- **IA:** Anthropic Claude para las explicaciones de los enfrentamientos y el asistente Maestro.

## Arquitectura

```
            ┌──────────────────────────┐        ┌──────────────────────────┐
Navegador ─▶│  mma-app (Next.js)        │── SQL ▶│  PostgreSQL (Neon)        │
            │  Vercel · solo lectura    │        │  fuente de verdad         │
            └──────────┬───────────────┘        └──────────▲───────────────┘
                       │  /api/predict                       │ escrituras
                       ▼                                     │
            ┌──────────────────────────┐        ┌───────────┴──────────────┐
            │  Servicio de predicción   │── SQL ▶│  mma-ingesta (Python)     │
            │  FastAPI · XGBoost        │        │  scrapers + pipeline ML    │
            └──────────────────────────┘        │  + The Odds API + YouTube  │
                       │  explicaciones          └──────────────────────────┘
                       ▼
            ┌──────────────────────────┐
            │  Anthropic Claude         │
            └──────────────────────────┘
```

La web lee. El repo de Python escribe. Se encuentran en la base de datos.

## Ejecutar en local

Necesitas Node 20+ y un `DATABASE_URL` que apunte a un Postgres con el esquema del proyecto.

```bash
npm install
npm run dev -- -p 3100   # http://localhost:3100  (el 3000 suele estar ocupado)
```

Pon tus secretos en `.env.local`. Los nombres de las variables están en [`.env.example`](./.env.example):

- `DATABASE_URL` (obligatoria)
- `ANTHROPIC_API_KEY` (para el Maestro y las explicaciones)
- `PREDICTION_SERVICE_URL` (el servicio FastAPI, para predicciones en vivo)
- `YOUTUBE_API_KEY` (para los vídeos)

Para tener predicciones en vivo también necesitas el servicio del otro repo corriendo:

```bash
# en el repo mma-ingesta
python -m uvicorn src.prediction.service:app --port 8000
```

Luego apunta `PREDICTION_SERVICE_URL` a `http://localhost:8000`. Sin él, la app sigue funcionando y muestra el modo degradado.

## Comandos

```bash
npm run dev       # servidor de desarrollo
npm run build     # build de producción
npm test          # vitest (138 tests)
npm run lint      # eslint
npx tsc --noEmit  # comprobación de tipos
```

## Estructura

```
src/
  app/          # rutas: inicio, luchadores, clasificación, eventos, enfrentamiento, maestro, noticias, vídeos, api
  components/   # UI, incluido matchup/ (el comparador cara a cara) y las piezas de fighter/
  lib/          # queries (partidas por dominio), db, formato, cliente de predicción, tools del maestro
```

El acceso a datos vive en `src/lib/queries`, partido en módulos pequeños por dominio (list, detail, mappers, types) detrás de una ruta de import estable.

## Tests

138 tests de Vitest cubren la lógica pura: comparación mercado vs modelo, cálculo de forma, formato, parseo de YouTube. La comprobación de tipos y el build de producción salen limpios. El repo de datos y ML lleva otros 113 tests de pytest, incluidos los golden y de paridad que fijan las features del modelo.

## El otro repo

[**mma-ingesta**](https://github.com/chocitagaming-art/mma-ingesta) tiene los scrapers, el pipeline de features, el entrenamiento del modelo y el servicio FastAPI de predicción. Si quieres saber de dónde salen los datos y las predicciones, empieza por ahí.

Hay también un manual de producto más completo: [MANUAL.md](./MANUAL.md).

## Licencia

MIT.
