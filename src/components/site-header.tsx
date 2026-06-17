import Link from "next/link";

import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/fighters", label: "Fighters" },
  { href: "/compare", label: "Compare" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 via-orange-400 to-amber-300 text-sm font-black text-black shadow-lg shadow-red-950/40">
            MMA
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-300">
              Fight Intelligence
            </p>
            <p className="text-lg font-semibold text-white">MMA Stats</p>
          </div>
        </Link>
        <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}