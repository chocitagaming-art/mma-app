import type { Metadata, Viewport } from "next";
import { Saira_Condensed, Archivo, IBM_Plex_Mono } from "next/font/google";
import { headers } from "next/headers";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";

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
  metadataBase: new URL("https://mma-app-ruby.vercel.app"),
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
