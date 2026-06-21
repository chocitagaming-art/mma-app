# MMA STATUS

Polished Next.js web app for browsing real MMA fighter profiles, fight history, and matchup stats from a Neon PostgreSQL database.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- PostgreSQL via `pg`

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your database connection:

   ```bash
   DATABASE_URL=your_connection_string
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Routes

- `/` home dashboard
- `/fighters` searchable fighter roster
- `/fighters/[id]` fighter profile and aggregate stats
- `/fights/[id]` fight result and side-by-side stat comparison
