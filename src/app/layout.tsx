import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Saira_Condensed, Archivo, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";

import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { SITE_URL } from "@/lib/site-url";

import "./globals.css";

const saira = Saira_Condensed({
  variable: "--font-saira",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // Con metadataBase puesto aquí, cada página declara su canónica como ruta
  // relativa ("/eventos") y Next compone la absoluta. Así el dominio vive en un
  // único sitio (src/lib/site-url.ts) y no hay 12 sitios que actualizar.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MMA STATUS",
    template: "%s | MMA STATUS",
  },
  description:
    "Perfiles profesionales de peleadores de MMA, historial de peleas y comparaciones de estadísticas impulsadas por una base de datos Neon PostgreSQL en vivo.",
  // PWA: nombre de la app instalada y modo standalone en iOS (Android/desktop
  // leen el manifest; iOS ignora sus iconos y usa apple-icon.png).
  applicationName: "MMA STATUS",
  appleWebApp: {
    capable: true,
    title: "MMA STATUS",
    statusBarStyle: "default",
  },
};

// En Next 16 themeColor va en viewport, no en metadata (aviso de deprecación).
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El proxy (src/proxy.ts) pone un nonce único por petición en esta cabecera. Leerlo
  // aquí cumple dos funciones: (1) pasarlo a next-themes para que su <script> de tema
  // inline lleve el nonce y no lo bloquee la CSP; (2) opta a TODO el árbol a render
  // dinámico, imprescindible para que Next estampe el nonce en sus scripts.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${saira.variable} ${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        {/* No renderiza nada: registra el service worker de /offline. */}
        <ServiceWorkerRegistrar />
        {/*
          Analítica sin cookies. No lleva nonce a propósito y NO le hace falta: el
          componente no emite ningún <script> en el HTML, sino que lo inserta con
          document.createElement desde su bundle de cliente — que sí va firmado con
          el nonce. 'strict-dynamic' propaga esa confianza al script insertado.
          El script y su endpoint son del propio dominio (/_vercel/insights/*), así
          que connect-src 'self' basta y la CSP no se toca.
        */}
        <Analytics />
        <ThemeProvider
          nonce={nonce}
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Skip-link: invisible hasta recibir foco con teclado. */}
          <a
            href="#main-content"
            className="sr-only rounded-md bg-primary px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
          >
            Saltar al contenido
          </a>
          <div className="relative flex min-h-screen flex-col">
            <SiteHeader />
            <main id="main-content" tabIndex={-1} className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
