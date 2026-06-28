<div align="center">

<img src="docs/banner.png" alt="MMA STATUS" width="720">

### A live UFC stats site with an ML model that predicts fights

Fighter profiles, official rankings, head to head comparisons, market odds against the model, an AI assistant, and fight videos, all on real scraped data.

[![Live demo](https://img.shields.io/badge/demo-live-22c55e?style=flat-square)](https://mma-app-ruby.vercel.app)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript)
![Tailwind](https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss)
[![CI](https://github.com/chocitagaming-art/mma-app/actions/workflows/ci.yml/badge.svg)](https://github.com/chocitagaming-art/mma-app/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

[![Stars](https://img.shields.io/github/stars/chocitagaming-art/mma-app?style=flat-square&color=ef4444)](https://github.com/chocitagaming-art/mma-app/stargazers)
![Forks](https://img.shields.io/github/forks/chocitagaming-art/mma-app?style=flat-square&color=ef4444)
![Last commit](https://img.shields.io/github/last-commit/chocitagaming-art/mma-app?style=flat-square&color=ef4444)

English · [Español](./README.es.md)

</div>

![MMA STATUS home page](docs/screenshots/home.png)

### Contents

- [What it is](#what-it-is)
- [See it in action](#see-it-in-action)
- [Features](#features)
- [How the prediction works](#how-the-prediction-works)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Run it locally](#run-it-locally)
- [License](#license)

## What it is

MMA STATUS is the web half of a two repo project. This repo is the site you see: a Next.js app that reads UFC data and serves it as fighter pages, rankings, a head to head builder, and a fight predictor. The other repo, [mma-ingesta](https://github.com/chocitagaming-art/mma-ingesta), does the scraping, the machine learning, and runs the prediction service. Both share one PostgreSQL database on Neon, and the web app only ever reads from it.

The data is real. Fighters, fights, stats, rankings, and events come from scraping UFC and ESPN. Odds come from The Odds API (upcoming fights only). Videos come from YouTube. The fight prediction comes from an XGBoost model trained on fighter stats, and the explanations are written by Claude.

## See it in action

Pick a red and a blue corner, compare them top to bottom, and let the model call the fight.

![Head to head walkthrough](docs/screenshots/cara-a-cara.gif)

## Features

Fighter profiles with career record, current streak, last five form, striking and takedown accuracy, win methods, and a strike map showing where a fighter lands and where they get hit, broken down by zone (head, body, leg) and range (distance, clinch, ground).

![Fighter profile](docs/screenshots/fighter-profile.png)

Fight prediction for any matchup. Pick a red and blue corner, hit predict, and the model returns a probability for each fighter, the per corner signals behind it (streak, recent wins, quality of opposition, defense), the factors that moved the call, and a short written explanation.

![Fight prediction](docs/screenshots/prediction.png)

Market vs model on upcoming fights. The implied probability from the odds, with the bookmaker margin stripped out, sits next to what the model thinks, with the edge called out in points. Putting the two side by side is uncommon in similar projects.

![Market vs model](docs/screenshots/market-vs-model.png)

El Maestro, a chat assistant that answers from the real database. Ask for a record or a stat line and it queries the data and shows its work, instead of guessing from memory.

![El Maestro assistant](docs/screenshots/maestro.png)

Official rankings by division and pound for pound, men and women, with the movement since the last snapshot.

![UFC rankings](docs/screenshots/rankings.png)

A head to head builder lets you choose two fighters and compare the tale of the tape, both strike maps, and any shared history. The URL is shareable, so a matchup is a link. Each profile also tracks ranking trajectory over time, and the site carries a feed of curated fight videos and MMA news.

## How the prediction works

- The model trains only on fighter stats: 20 features covering records, physical attributes, striking, grappling, form, and quality of opposition. Odds are never an input. When you see odds next to the model, that is a comparison, not a feature.
- Accuracy sits around 63% (0.6289, calibrated and symmetrized), with a Brier score of 0.2266, trained on roughly 2,838 fighters and 8,750 fights. These are estimates with real uncertainty, not locks: in MMA a clear favorite still gets knocked out.
- If either fighter is thin on history, like a debutant, the model says so and sits near 50/50 instead of inventing confidence.
- A FastAPI microservice in the data repo serves the model, and predictions run live on the site.

## Tech stack

- **Web (this repo):** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, `pg`. Deployed on Vercel.
- **Data and ML:** Python, PostgreSQL on Neon, XGBoost, FastAPI. Scrapers for UFC and ESPN, odds from The Odds API, videos from the YouTube Data API.
- **AI:** Anthropic Claude for the matchup explanations and the Maestro assistant.

## Architecture

```
            ┌──────────────────────────┐        ┌──────────────────────────┐
 Browser ──▶│  mma-app (Next.js)        │── SQL ▶│  PostgreSQL (Neon)        │
            │  Vercel · read only       │        │  single source of truth   │
            └──────────┬───────────────┘        └──────────▲───────────────┘
                       │  /api/predict                       │ writes
                       ▼                                     │
            ┌──────────────────────────┐        ┌───────────┴──────────────┐
            │  Prediction service       │── SQL ▶│  mma-ingesta (Python)     │
            │  FastAPI · XGBoost        │        │  scrapers + ML pipeline    │
            └──────────────────────────┘        │  + The Odds API + YouTube  │
                       │  explanations           └──────────────────────────┘
                       ▼
            ┌──────────────────────────┐
            │  Anthropic Claude         │
            └──────────────────────────┘
```

The web app only reads from the database, while the Python repo writes to it.

## Run it locally

You need Node 20+ and a `DATABASE_URL` pointing at a Postgres with the project schema.

```bash
npm install
npm run dev -- -p 3100   # http://localhost:3100  (3000 is often taken)
```

Put your secrets in `.env.local`. The variable names are in [`.env.example`](./.env.example):

- `DATABASE_URL` (required)
- `ANTHROPIC_API_KEY` (for the Maestro and matchup explanations)
- `PREDICTION_SERVICE_URL` (the FastAPI service)
- `YOUTUBE_API_KEY` (for videos)

To run predictions while developing locally, start the service from the data repo:

```bash
# in the mma-ingesta repo
python -m uvicorn src.prediction.service:app --port 8000
```

Then point `PREDICTION_SERVICE_URL` at `http://localhost:8000`.

## Commands

```bash
npm run dev       # dev server
npm run build     # production build
npm test          # vitest
npm run lint      # eslint
npx tsc --noEmit  # type check
```

## Project layout

```
src/
  app/          # routes: home, fighters, rankings, events, matchup, maestro, news, videos, api
  components/   # UI, including matchup/ (the head to head builder) and fighter/ pieces
  lib/          # queries (split by domain), db, formatting, prediction client, maestro tools
```

The data access lives in `src/lib/queries`, split into small modules by domain (list, detail, mappers, types) behind a stable import path.

## Tests

The Vitest suite covers the pure logic: market vs model comparison, form computation, formatting, YouTube parsing. Type checking and a production build run clean. The data and ML repo carries its own pytest suite, including golden and parity tests that pin the model features.

## The other repo

[**mma-ingesta**](https://github.com/chocitagaming-art/mma-ingesta) holds the scrapers, the feature pipeline, the model training, and the FastAPI prediction service. If you want to know where the data and the predictions come from, start there.

There is also a fuller product manual in Spanish: [MANUAL.md](./MANUAL.md).

## License

MIT © 2026 MMA STATUS. See [LICENSE](./LICENSE). A personal project by MMA STATUS; issues and pull requests are welcome.
