import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Créditos de imágenes",
  description:
    "Autores y licencias de las fotografías de Wikimedia Commons usadas en MMA STATUS.",
  alternates: { canonical: "/creditos" },
};

type Credit = {
  subject: string;
  author: string;
  license: string;
  licenseUrl?: string;
  fileUrl: string;
};

// Fotografías de personas alojadas por la app cuyo origen es Wikimedia Commons,
// con licencia verificada en su página File:. Se listan aquí para cumplir la
// atribución que exigen las licencias Creative Commons (autor + licencia + fuente).
// Las de dominio público no la exigen legalmente; se citan por cortesía.
const CREDITS: Credit[] = [
  {
    subject: "Pat Miletich",
    author: "Gage Skidmore",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    fileUrl: "https://commons.wikimedia.org/wiki/File:Pat_Miletich_by_Gage_Skidmore_Cropped.jpg",
  },
  {
    subject: "Bas Rutten",
    author: "Michael Dunn",
    license: "CC BY 2.5",
    licenseUrl: "https://creativecommons.org/licenses/by/2.5/",
    fileUrl: "https://commons.wikimedia.org/wiki/File:Bas_Rutten.jpg",
  },
  {
    subject: "Antônio Rodrigo Nogueira",
    author: "Assembleia Legislativa do Espírito Santo / Reinaldo Carvalho",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    fileUrl:
      "https://commons.wikimedia.org/wiki/File:Sess%C3%A3o_Solene_em_homenagem_ao_Dia_Estadual_do_MMA_-_12.11.2015_(22957902296)_CROPPED.jpg",
  },
  {
    subject: "Kazushi Sakuraba",
    author: "Yuzunet",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    fileUrl: "https://commons.wikimedia.org/wiki/File:20230122saku1.jpg",
  },
  {
    subject: "Kevin Randleman",
    author: "Larry Burton",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    fileUrl: "https://commons.wikimedia.org/wiki/File:Kevin_Randleman.jpg",
  },
  {
    subject: "Jens Pulver",
    author: "Kwallsk1 (edición de Jdcollins13)",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    fileUrl:
      "https://commons.wikimedia.org/wiki/File:Jens_Pulver_at_UFC_-_Neer_vs_Diaz_2013-12-03_22-51.jpg",
  },
  {
    subject: "Mark Kerr",
    author: "Harald Krichel",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    fileUrl: "https://commons.wikimedia.org/wiki/File:Mark_Kerr-1593.jpg",
  },
  {
    subject: "Chael Sonnen",
    author: "K.O. Artist Sports",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    fileUrl: "https://commons.wikimedia.org/wiki/File:Chael_Sonnen.jpg",
  },
  {
    subject: "Frank Trigg",
    author: "MC511",
    license: "Dominio público",
    fileUrl: "https://commons.wikimedia.org/wiki/File:FrankTrigg.jpg",
  },
  {
    subject: "Art Davie",
    author: "Ufccreator1",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    fileUrl: "https://commons.wikimedia.org/wiki/File:Art_Davie_-_photo_credit_Art_Davie.jpg",
  },
  {
    subject: 'Charles "Mask" Lewis Jr.',
    author: "ZoterX",
    license: "Dominio público",
    fileUrl: "https://commons.wikimedia.org/wiki/File:TPAR2009.jpg",
  },
];

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}

export default function CreditosPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-foreground sm:text-4xl">
        Créditos de imágenes
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
        Algunas fotografías de personas de esta web (retratos del Salón de la Fama y
        de ciertas fichas) proceden de{" "}
        <ExternalLink href="https://commons.wikimedia.org/">Wikimedia Commons</ExternalLink>{" "}
        y se utilizan bajo sus respectivas licencias. Agradecemos a sus autores.
        Las imágenes en dominio público se citan por cortesía. El resto del
        contenido gráfico es de MMA STATUS o de sus respectivos titulares.
      </p>

      <ul className="mt-8 divide-y divide-border border-y border-border">
        {CREDITS.map((c) => (
          <li key={c.subject} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="font-display text-base font-semibold uppercase tracking-wide text-foreground">
              {c.subject}
            </span>
            <span className="text-sm text-muted-foreground">
              Foto: {c.author} ·{" "}
              {c.licenseUrl ? (
                <ExternalLink href={c.licenseUrl}>{c.license}</ExternalLink>
              ) : (
                c.license
              )}{" "}
              · <ExternalLink href={c.fileUrl}>Wikimedia Commons</ExternalLink>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs leading-5 text-muted-foreground">
        Las licencias Creative Commons permiten el uso de estas imágenes citando a
        su autor y enlazando la licencia; las versiones «ShareAlike» (BY-SA)
        obligan a compartir las obras derivadas bajo la misma licencia. Si eres el
        titular de una imagen y detectas un error de atribución, escríbenos y lo
        corregimos.
      </p>
    </div>
  );
}
