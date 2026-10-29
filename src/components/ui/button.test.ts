import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { Button, buttonType, buttonVariants } from "@/components/ui/button";

// Every button on the site speaks the header nav's UFC voice (owner,
// 29-oct-2026: «las letras de "Más noticias y vídeos", "Próximas carteleras"
// y etc., es decir botones, no llevan nuestra tipografía de letra estilo
// UFC»). It lives at the source, buttonVariants, so a future button inherits
// it. What it looks like on the real pages, measured, is e2e/botones.spec.ts.

const classes = (value: string) => value.split(/\s+/).filter(Boolean);

const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive"] as const;
const SIZES = ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const;

describe("buttonVariants: the UFC voice", () => {
  it("the base is Saira Condensed, uppercase, semibold, with the nav's tracking", () => {
    const base = classes(buttonVariants());
    expect(base).toEqual(
      expect.arrayContaining(["font-display", "uppercase", "font-semibold", "tracking-wide"]),
    );
    // The Archivo look it replaces.
    expect(base).not.toContain("font-medium");
    expect(base).not.toContain("text-sm");
  });

  it("every variant but link, at every size, keeps it", () => {
    for (const variant of VARIANTS) {
      for (const size of SIZES) {
        const c = classes(buttonVariants({ variant, size }));
        expect(c, `${variant}/${size}`).toEqual(
          expect.arrayContaining(["font-display", "uppercase", "font-semibold", "tracking-wide"]),
        );
      }
    }
  });

  it("condensed caps go one step bigger than the Archivo they replace: 15 px, 16 lg, 14 sm, 13 xs", () => {
    const size = (s: (typeof SIZES)[number]) =>
      classes(buttonVariants({ size: s })).filter((c) => /^text-(\[|xs|sm|base)/.test(c));
    expect(size("default")).toEqual(["text-[15px]"]);
    expect(size("icon")).toEqual(["text-[15px]"]);
    expect(size("lg")).toEqual(["text-base"]);
    expect(size("sm")).toEqual(["text-sm"]);
    expect(size("xs")).toEqual(["text-[13px]"]);
  });

  it("link keeps the inline text-link look: the body font, as written", () => {
    const c = classes(buttonVariants({ variant: "link" }));
    expect(c).not.toContain("font-display");
    expect(c).not.toContain("uppercase");
    expect(c).not.toContain("tracking-wide");
    expect(c).toEqual(expect.arrayContaining(["font-sans", "normal-case", "tracking-normal"]));
  });

  it("link keeps the body size it had at each size: 14 px, 14 lg, 12.8 sm, 12 xs", () => {
    // Before the UFC voice, link took its size from the size variant like any
    // button. A flat text-sm on link would have grown xs and sm.
    const size = (s: (typeof SIZES)[number]) =>
      classes(buttonVariants({ variant: "link", size: s })).filter((c) =>
        /^text-(\[\d|xs|sm|base)/.test(c),
      );
    expect(size("default")).toEqual(["text-sm"]);
    expect(size("lg")).toEqual(["text-sm"]);
    expect(size("sm")).toEqual(["text-[0.8rem]"]);
    expect(size("xs")).toEqual(["text-xs"]);
  });

  it("is merged on its own: no two classes fight for the same property, used bare as a className", () => {
    // buttonVariants({ variant: "link" }) straight into a Link's className
    // (the shadcn idiom) must not carry font-display AND font-sans: which one
    // wins would depend on the order Tailwind writes the CSS in.
    const link = classes(buttonVariants({ variant: "link", size: "lg" }));
    expect(link.filter((c) => /^font-(display|sans|mono)$/.test(c))).toEqual(["font-sans"]);
    expect(link.filter((c) => /^(uppercase|normal-case)$/.test(c))).toEqual(["normal-case"]);
    expect(link.filter((c) => /^text-(\[\d|xs|sm|base)/.test(c))).toEqual(["text-sm"]);
  });

  it("a caller's class still wins: font-bold replaces font-semibold, it does not stack", () => {
    const c = classes(buttonVariants({ className: "font-bold" }));
    expect(c).toContain("font-bold");
    expect(c).not.toContain("font-semibold");
  });

  it("buttonType is the shared voice, the very classes of the base", () => {
    expect(classes(buttonType)).toEqual(["font-display", "font-semibold", "uppercase", "tracking-wide"]);
    expect(classes(buttonVariants())).toEqual(expect.arrayContaining(classes(buttonType)));
  });

  it("<Button> renders with it", () => {
    const html = renderToStaticMarkup(createElement(Button, null, "Reintentar"));
    const cls = /class="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(classes(cls)).toEqual(expect.arrayContaining(["font-display", "uppercase", "text-[15px]"]));
  });
});

// ── The call sites, read from the source ─────────────────────────────────────
//
// A hand-rolled CTA is found only by READING the code, like
// event-tier-callsites.test.ts does with its queries.

const SRC = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(): { file: string; text: string }[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((file) => file.endsWith(".tsx") && !file.includes("node_modules"))
    .map((file) => ({ file: file.replaceAll("\\", "/"), text: readFileSync(SRC + file, "utf8") }));
}

// The children of every <Button>…</Button> in a file. A self-closing
// <Button /> has none, and must not swallow the text up to the next
// </Button>. The opening tag ends at the first ">" outside braces (two levels,
// enough for className={cn(…, { … })} and onClick={() => …}).
function buttonChildren(text: string): string[] {
  const button = /<Button\b(?:[^>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*(?<!\/)>([\s\S]*?)<\/Button>/g;
  return [...text.matchAll(button)].map((match) => match[1]);
}

describe("buttonChildren, the reader of the arrow guard", () => {
  it("reads the children of each <Button>…</Button>", () => {
    const src = `<Button size="lg" onClick={() => go(a > b)}>Ver cartelera <ArrowRight /></Button>`;
    expect(buttonChildren(src)).toEqual(["Ver cartelera <ArrowRight />"]);
  });

  it("a self-closing <Button /> does not swallow the text up to the next </Button>", () => {
    const src = [
      `<Button aria-label="Cerrar" className={cn("a", { b: c })} />`,
      `<Link href="/x">Ver más →</Link>`,
      `<Button>Enviar</Button>`,
    ].join("\n");
    expect(buttonChildren(src)).toEqual(["Enviar"]);
  });
});

describe("the button-looking links and buttons that are not <Button>", () => {
  it("none keeps the old IBM Plex Mono voice of the CTAs (/eventos, /en-vivo, /ufc-hoy, /tendencias, /videos)", () => {
    // The look of those CTAs: a padded box with a border or the red fill,
    // and mono semibold caps. Tags and chips (rounded-full, rounded-sm,
    // no padding box) are not CTAs and do not match.
    // 🪤 It reads LINE by line, as all those CTAs were written: one whose
    // classes are spread over several lines of a cn(…) would slip past it.
    const offenders: string[] = [];
    for (const { file, text } of sourceFiles()) {
      text.split("\n").forEach((line, i) => {
        const isMonoCta =
          /\brounded-md\b/.test(line) &&
          /\bfont-mono\b/.test(line) &&
          /\buppercase\b/.test(line) &&
          /\bfont-semibold\b/.test(line) &&
          /\bpx-\d/.test(line) &&
          /\bpy-[\d.]+\b/.test(line) &&
          /\b(border|bg-primary)\b/.test(line);
        if (isMonoCta) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("no <Button> carries a text arrow: «→» is not in Saira, it fell back to Arial, thin and low", () => {
    const offenders: string[] = [];
    for (const { file, text } of sourceFiles()) {
      for (const children of buttonChildren(text)) {
        if (children.includes("→")) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
