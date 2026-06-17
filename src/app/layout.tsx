import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mma-stats.local"),
  title: {
    default: "MMA Stats",
    template: "%s | MMA Stats",
  },
  description:
    "Professional MMA fighter profiles, fight history, and stat comparisons powered by a live Neon PostgreSQL database.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-black text-white">
        <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(239,68,68,0.12),_transparent_30%),linear-gradient(180deg,_#09090b_0%,_#050505_100%)]">
          <SiteHeader />
          <main className="relative flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
