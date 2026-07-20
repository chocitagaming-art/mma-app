import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sin conexión | MMA STATUS",
  robots: { index: false, follow: false },
};

// Esta pantalla la sirve el service worker cuando una navegación falla por red,
// así que tiene que pintarse con CERO peticiones: los estilos van en un <style>
// en línea (style-src ya permite 'unsafe-inline') y el logo es un SVG en línea.
// Si dependiera del CSS de /_next/static/, alguien que entra por primera vez y
// pierde la cobertura antes de llenar la caché la vería SIN estilos, justo en el
// momento en que quieres dar sensación de solidez.
//
// Ojo: el layout raíz ya envuelve el contenido en un <main>, así que aquí va un
// <div> (un <main> anidado es HTML inválido).
export default function OfflinePage() {
  return (
    <>
      <style>{`
        .offline-wrap{min-height:70vh;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:1.25rem;padding:2rem 1.5rem;
          text-align:center}
        .offline-title{font-size:1.5rem;font-weight:700;letter-spacing:.02em;margin:0}
        .offline-text{max-width:34rem;margin:0;opacity:.75;line-height:1.6}
        .offline-mark{opacity:.9}
        .offline-btn{display:inline-block;padding:.65rem 1.4rem;border-radius:.5rem;
          border:1px solid currentColor;font-weight:600;background:none;
          color:inherit;cursor:pointer;font:inherit;text-decoration:none}
      `}</style>
      <div className="offline-wrap">
        <svg
          className="offline-mark"
          width="72"
          height="72"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M2 2 22 22" strokeLinecap="round" />
          <path
            d="M5 12.5a10 10 0 0 1 4-2.4M2 8.8a15 15 0 0 1 4.2-2.6"
            strokeLinecap="round"
          />
          <path
            d="M19 12.5a10 10 0 0 0-6.3-2.9M21.8 8.8a15 15 0 0 0-9.5-3.7"
            strokeLinecap="round"
          />
          <path d="M8.5 16a5 5 0 0 1 7 0" strokeLinecap="round" />
          <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
        </svg>
        <h1 className="offline-title">Sin conexión</h1>
        <p className="offline-text">
          No hemos podido cargar esta página porque no hay conexión a internet.
          Los datos de MMA STATUS se actualizan en vivo, así que preferimos no
          enseñarte resultados antiguos.
        </p>
        {/*
          Aquí un <a> es lo correcto y <Link> sería un error: <Link> hace
          navegación de cliente, que sin red simplemente falla. Un <a> provoca
          una carga de documento completa, que es exactamente lo que significa
          "Reintentar" — y es la que el service worker vuelve a intentar contra
          la red.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="offline-btn" href="/">
          Reintentar
        </a>
      </div>
    </>
  );
}
