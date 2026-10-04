import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Saira_Extra_Condensed } from "next/font/google";

import { FavoritesStrip } from "@/components/home/favorites-strip";
import { FighterCard } from "@/components/fighter-card";
import { HomeLiveSlot } from "@/components/home/home-live-slot";
import { LastEventSection } from "@/components/home/last-event-section";
import { P4PTabs } from "@/components/home/p4p-tabs";
import { LiveBanner } from "@/components/live/live-banner";
import { UpNextHero } from "@/components/home/up-next-hero";
import { RecentNewsGrid } from "@/components/recent-news-grid";
import { SearchHero } from "@/components/search-hero";
import { SectionHeading } from "@/components/section-heading";
import { ShortsAttributionSlot, ShortsHeroSlot } from "@/components/home/shorts-hero-slot";
import { ShortsHeroPlaceholder } from "@/components/home/shorts-hero";
import { UfcVideosColumn } from "@/components/ufc-videos-column";
import { Button } from "@/components/ui/button";
import { getLastEventResults, getNextEventHero } from "@/lib/queries/events";
import { getFeaturedFighters, getHomeStats } from "@/lib/queries/fighters";
import { p4pDescription } from "@/lib/p4p-description";
import { getRecentNews } from "@/lib/queries/news";
import { getUfcShorts } from "@/lib/ufc-shorts";
import type { FighterCardData } from "@/lib/types";

// Home data (stats, destacados, noticias) cambia como mucho a diario, no en vivo.
// ISR: servir estático y revalidar cada 30 minutos en vez de consultar la BD en
// cada request (#33). Además existe POST /api/revalidate para forzar la
// revalidación bajo demanda. Las páginas que dependen de query params del
// usuario siguen dinámicas.
export const revalidate = 1800;

// The mobile headline (variant A of the shorts): narrower, so that
// «INTELIGENCIA» fits next to the 200 px short. Self-hosted by next/font like
// the layout's fonts (never a Google Fonts request from the browser), and
// declared HERE and not in the layout: only the home uses it, so only the home
// preloads it. Its variable goes on the hero's <section>.
const sairaXc = Saira_Extra_Condensed({
  variable: "--font-saira-xc",
  subsets: ["latin"],
  weight: "800",
});

export const metadata: Metadata = {
  title: { absolute: "MMA STATUS · Perfiles de peleadores UFC y análisis de peleas" },
  description:
    "Explora perfiles reales de peleadores, historial de peleas y estadísticas de rendimiento desde una base de datos de MMA en vivo.",
  alternates: { canonical: "/" },
};

// Rejilla de tarjetas de un libra por libra. Se pinta en SERVIDOR y, si hay
// masculino y femenino, P4PTabs solo decide cuál se ve.
function FighterGrid({ fighters }: { fighters: FighterCardData[] }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {fighters.map((fighter) => (
        <FighterCard key={fighter.id} fighter={fighter} />
      ))}
    </div>
  );
}

export default async function HomePage() {
  // The hero's shorts, started BEFORE the queries and not awaited here: the
  // promise goes down to two <Suspense> of the hero (the short and its
  // attribution). On a warm cache (30 min) it has resolved by the time they
  // render; on a cold one, YouTube does not hold the rest of the home back.
  // getUfcShorts never throws.
  const shortsPromise = getUfcShorts();

  // Noticias recientes (12; RecentNewsGrid escoge de ese conjunto sus 6 con
  // foto, paridad visual exacta). Con ISR la consulta solo corre al revalidar,
  // así que el coste es irrelevante (#68/#33).
  const [stats, featuredMen, featuredWomen, recentNews, nextEvent, lastEvent] =
    await Promise.all([
      getHomeStats(),
      getFeaturedFighters(6, "mens_pound_for_pound"),
      // El femenino NO tiene plan B: si su ranking no llega, devuelve [] y el
      // bloque se queda en el masculino, sin pestañas (fighters.list.ts).
      getFeaturedFighters(6, "womens_pound_for_pound"),
      getRecentNews(12),
      // FE1/FE10: próximo evento (Up Next) y resultados del último completado.
      getNextEventHero(),
      getLastEventResults(),
    ]);

  // Pestañas solo si hay algo que alternar. Con una sola rejilla (el femenino
  // vacío) se pinta tal cual, sin una pestaña «Masculino» huérfana.
  const p4pPanels = (
    [
      { key: "masculino", label: "Masculino", ...featuredMen },
      { key: "femenino", label: "Femenino", ...featuredWomen },
    ] as const
  ).filter((panel) => panel.fighters.length > 0);
  // «Sin distinción de categoría» dejó de ser verdad el 28-sep-2026: ahora hay
  // un libra por libra de cada sexo. El texto dice QUÉ paneles hay y de dónde
  // salen (ranking o plan B «los de más peleas»), no cuál se está viendo: se
  // pinta aquí, en servidor, y no cambia al alternar pestaña.
  const p4pText = p4pDescription(p4pPanels) ?? undefined;

  const statItems = [
    { value: stats.fighters.toLocaleString(), label: "Luchadores" },
    { value: stats.fights.toLocaleString(), label: "Peleas" },
    { value: stats.events.toLocaleString(), label: "Eventos" },
    { value: stats.fightStats.toLocaleString(), label: "Registros de stats" },
  ];

  return (
    <div className="pb-16">
      {/* T3-A: franja EN DIRECTO (cliente; no rompe el ISR de la home). Solo
          aparece con un evento en marcha — la fase previa ya la cubre Up Next. */}
      <LiveBanner />

      {/* Hero. Three layouts with ONE player in the DOM. Desktop and tablet are
          the ones approved on 29-sep-2026 (merge a215f8b); mobile is variant A
          of the shorts mockup (maqueta-shorts, the owner's pick on his phone):
          · Desktop (lg): text on the left, a 330 px short on the right.
          · Tablet (md): the same, two columns, the short at 280 px.
          · Mobile A (340-639 px): the headline first and the 200 px short on
            its right, flush with the screen edge (the grid drops its right
            padding; the search box and the buttons get it back with pr-4).
            200 px is YouTube's minimum (200x200): below it there is no legal
            player. The headline switches to Saira Extra Condensed so that
            «INTELIGENCIA» fits. From 640 to 767, the same 200 px column with
            the usual headline. Under 340 px, the old 7.5rem column: the
            poster opens the short on YouTube.
          The mobile trick: the text div is `contents`, so its children are
          items of THIS grid and are placed one by one. The DOM order is still
          text → short, which is what a screen reader hears.
          🪤 Under 340 px the text column is `1fr` and NOT `minmax(0,1fr)`: it
          never gets narrower than «INTELIGENCIA», so the poster cannot cover
          it; the one that gives is the poster's (`minmax(0,7.5rem)`). In A the
          short's column is fixed and the HEADLINE adapts: its size goes in
          `cqi` (the width of THIS grid without padding, via `@container`), not
          in `vw`, because with a classic scrollbar 100vw is 15 px wider than
          the page and broke «INTELIGENCIA». The sums: text column = 100cqi −
          12 (gap) − 200 (short) = 100cqi − 13.25rem, and «INTELIGENCIA» is
          3.731 em wide in that face → divided by 3.85 to leave a margin.
          The description row is `1fr`: it takes the spare height, so the
          headline does not drift away from it. `md:pb-24` leaves room for the
          short's buttons, which from md sit absolutely under the frame
          without off-centering it. */}
      <section className={`${sairaXc.variable} relative overflow-hidden border-b border-border`}>
        <div className="@container mx-auto grid max-w-7xl grid-cols-[1fr_minmax(0,7.5rem)] items-start gap-x-3.5 gap-y-0 px-4 py-12 max-md:grid-rows-[auto_auto_1fr_auto_auto] min-[340px]:max-sm:grid-cols-[minmax(0,1fr)_12.5rem] min-[340px]:max-sm:gap-x-3 min-[340px]:max-sm:pr-0 sm:px-6 sm:max-md:grid-cols-[1fr_12.5rem] md:grid-cols-[1.15fr_0.85fr] md:items-center md:gap-6 md:pb-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:px-8 lg:py-20">
          {/* Copy. ⚠️ En móvil, con `contents`, su «relative z-10» no se aplica:
              el desplegable del buscador sube por su propio z-20. */}
          <div className="relative z-10 contents md:col-start-1 md:row-start-1 md:block">
            <p className="animate-rise col-span-2 row-start-1 flex items-center gap-2.5 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-primary">
              <span className="live-dot inline-block size-2 rounded-full bg-primary shadow-[0_0_12px_2px_var(--primary)]" />
              Base de datos UFC en vivo
            </p>
            {/* Under 340 px the size follows the screen width, capped:
                «INTELIGENCIA» must fit in its column next to the poster. From
                340 to 639, the cqi sum above. */}
            <h1
              className="animate-rise col-start-1 row-start-2 mt-4 font-display text-[clamp(2.4rem,11.5vw,3rem)] font-extrabold uppercase leading-[0.86] tracking-tight text-foreground min-[340px]:max-sm:font-xc min-[340px]:max-sm:text-[clamp(1.75rem,calc((100cqi-13.25rem)/3.85),3rem)] min-[340px]:max-sm:[overflow-wrap:anywhere] sm:text-7xl lg:text-8xl"
              style={{ animationDelay: "80ms" }}
            >
              Inteligencia
              <br />
              de <span className="text-primary">combate</span>
            </h1>
            <div className="col-start-1 row-start-3 flex flex-col self-stretch">
              <p
                className="animate-rise mt-6 max-w-xl text-[0.95rem] leading-6 text-muted-foreground sm:text-lg sm:leading-7"
                style={{ animationDelay: "160ms" }}
              >
                Perfiles de peleadores UFC, historial de peleas, comparativas
                cara a cara y predicción por modelo de machine learning, sobre
                datos reales de eventos.
              </p>
              {/* On mobile the shorts' attribution goes at the foot of the
                  text column: under the 200 px short only its buttons fit
                  without the hero growing past 844 px. From md, under the frame. */}
              <Suspense fallback={null}>
                <ShortsAttributionSlot
                  shorts={shortsPromise}
                  className="mt-auto hidden pt-3 max-md:block"
                />
              </Suspense>
            </div>
            <div
              className="animate-rise relative z-20 col-span-2 row-start-4 mt-7 max-w-xl min-[340px]:max-sm:pr-4"
              style={{ animationDelay: "240ms" }}
            >
              <SearchHero />
            </div>
            <div
              className="animate-rise col-span-2 row-start-5 mt-4 flex flex-wrap gap-3 min-[340px]:max-sm:pr-4"
              style={{ animationDelay: "320ms" }}
            >
              <Link href="/maestro">
                <Button
                  variant="outline"
                  size="lg"
                  // Borde rojo de marca (dueño 17-jul): mismo patrón que el CTA
                  // "Ver historial completo" de la ficha. Los prefijos dark::
                  // hacen falta porque outline trae dark:border-input/dark:bg-input.
                  className="h-10 border-primary/60 font-semibold text-primary hover:border-primary hover:bg-primary/10 hover:text-primary dark:border-primary/60 dark:bg-transparent dark:hover:border-primary dark:hover:bg-primary/10 dark:hover:text-primary"
                >
                  Pregunta al Maestro de la UFC
                </Button>
              </Link>
              <Link href="/enfrentamiento">
                <Button size="lg" className="h-10">
                  Predecir una pelea
                </Button>
              </Link>
            </div>
          </div>

          {/* The UFC shorts (components/home/shorts-hero.tsx). On mobile they
              span the headline and description rows, with the headline's top
              margin so that their top edges line up.
              🪤 IN <Suspense>: the list asks YouTube (5 s timeout, 30 min
              cache) and the rest of the home does not wait for it. The
              fallback is our own poster at the same size: nothing jumps. */}
          <div className="col-start-2 row-span-2 row-start-2 mt-4 flex items-center justify-center md:row-span-1 md:row-start-1 md:mt-0">
            <Suspense fallback={<ShortsHeroPlaceholder />}>
              <ShortsHeroSlot shorts={shortsPromise} />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Up Next (FE1): próximo evento con combate estelar y cuenta atrás.
          Si no hay eventos futuros en la BD, la sección no se pinta. */}
      {nextEvent ? <UpNextHero event={nextEvent} /> : null}

      {/* El hueco de directos, entre el hero y los contadores: el directo de la
          velada si está en el aire, y si no UFC TV (peleas en directo o el
          bucle de peleas completas). El orden y el interruptor 'off' viven en
          components/home/home-live-slot.tsx.
          🪤 SIN franja propia: la primera versión lo metió en una <section> con
          `border-b bg-card` a todo lo ancho, y el resultado no se leía como un
          vídeo sino como un cajón enorme cruzando la página. Va en el mismo
          carril que el resto del contenido y el vídeo manda su tamaño; el
          carril lo pone el propio hueco, así que sin vídeo no queda ni el hueco.
          🪤 EN <Suspense> Y FUERA DEL Promise.all: pregunta a YouTube (con 3 s de
          tope y caché de 120 s), y si YouTube va lento el resto de la portada
          no puede quedarse esperándole. El fallback es null: mientras llega, no
          hay nada, que es exactamente lo que habría si no hubiera vídeo.
          ⚠️ PRECIO ACEPTADO: un salto de maquetación. Cuando el hueco llega
          por streaming empuja hacia abajo los contadores y todo lo de debajo
          (~300-560 px). A 390×844 y a 1280×800 el hueco cae por debajo del
          pliegue (el hero ocupa ~750 px) y no se ve; se nota con pantallas
          muy altas o si se baja antes de que llegue. Reservar el alto con un
          esqueleto dejaría el hueco vacío los días sin vídeo, que es lo que
          la regla de arriba prohíbe: lo decide el dueño. */}
      <Suspense fallback={null}>
        <HomeLiveSlot nextEvent={nextEvent} />
      </Suspense>

      {/* Stat strip */}
      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {statItems.map((stat, i) => (
            <div
              key={stat.label}
              className="animate-rise group relative overflow-hidden bg-card px-4 py-7 sm:px-6 lg:px-8"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-300 ease-out group-hover:scale-x-100" />
              <p className="tabular font-display text-4xl font-extrabold leading-none text-foreground sm:text-5xl">
                {stat.value}
              </p>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Tus favoritos (isla client): solo se pinta si el navegador tiene
          favoritos guardados; no toca el ISR/caché de datos de la home. */}
      <FavoritesStrip />

      {/* Acaba de pasar (FE10): resultados del último evento completado. Va
          tras la franja de stats para encadenar con el bloque de noticias. */}
      {lastEvent && lastEvent.bouts.length > 0 ? (
        <LastEventSection event={lastEvent} />
      ) : null}

      {/* Noticias recientes + columna de vídeos UFC (estilo ufc.com) */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-7">
            <SectionHeading
              eyebrow="Lo último"
              title="Noticias recientes"
              description="Lo más reciente del mundo UFC, con foto y titular."
            />
            <RecentNewsGrid limit={6} articles={recentNews} />
            {/* CTAs bajo las noticias: más noticias (→ Tendencias) y próximas
                carteleras (→ Eventos próximos), estética UFC. */}
            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:justify-center">
              <Link href="/tendencias" className="w-full sm:w-auto">
                <Button size="lg" className="h-10 w-full px-6 sm:w-auto">
                  Más noticias →
                </Button>
              </Link>
              <Link href="/eventos?view=proximos" className="w-full sm:w-auto">
                <Button size="lg" className="h-10 w-full px-6 sm:w-auto">
                  Próximas carteleras →
                </Button>
              </Link>
            </div>
          </div>
          <UfcVideosColumn limit={5} />
        </div>
      </section>

      {/* Mejores libra por libra (reubicado más abajo) */}
      <section className="mx-auto max-w-7xl space-y-7 border-t border-border px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-6">
          <SectionHeading
            eyebrow="Libra por libra"
            title="Mejores libra por libra"
            description={p4pText}
          />
          <Link href="/clasificacion" className="hidden shrink-0 sm:inline-flex">
            <Button
              variant="outline"
              size="lg"
              // Borde rojo de marca (mismo patrón que "Pregunta al Maestro"): era
              // variant="ghost" (sin borde ni fondo) y no se veía. Los prefijos
              // dark:: hacen falta porque outline trae dark:border-input/dark:bg-input.
              className="h-10 border-primary/60 font-semibold text-primary hover:border-primary hover:bg-primary/10 hover:text-primary dark:border-primary/60 dark:bg-transparent dark:hover:border-primary dark:hover:bg-primary/10 dark:hover:text-primary"
            >
              Ver clasificación →
            </Button>
          </Link>
        </div>
        {p4pPanels.length > 1 ? (
          <P4PTabs
            label="Libra por libra"
            panels={p4pPanels.map((panel) => ({
              key: panel.key,
              label: panel.label,
              content: <FighterGrid fighters={panel.fighters} />,
            }))}
          />
        ) : p4pPanels.length === 1 ? (
          <FighterGrid fighters={p4pPanels[0].fighters} />
        ) : null}
      </section>
    </div>
  );
}
