// Headshots conseguidos a mano para luchadores que el enrichment de ESPN no resuelve
// (p.ej. atletas que ESPN solo lista en otro deporte). Se sirven desde /public y se usan
// SOLO como fallback cuando la BD no tiene headshot_url, así que no pisan el dato real:
// si algún día el backend consigue la foto oficial, esa tiene prioridad.
// Clave: nombre normalizado (trim + minúsculas).
const LOCAL_HEADSHOTS: Record<string, string> = {
  "josh hokit": "/fighters/josh-hokit.avif",
  // Debutantes de eventos próximos sin foto oficial en UFC/ESPN (fuente: Tapology).
  "farman hasanov": "/fighters/farman-hasanov.jpg",
  "vlasto čepo": "/fighters/vlasto-cepo.jpg",
  "michael aswell jr.": "/fighters/michael-aswell-jr.jpg",
  "michael aswell jr": "/fighters/michael-aswell-jr.jpg",
  "magomed tuchalov": "/fighters/magomed-tuchalov.png",
  "jovan leka": "/fighters/jovan-leka.jpg",
  "gable steveson": "/fighters/gable-steveson.webp",
  "jefferson nascimento": "/fighters/jefferson-nascimento.jpg",
  "tahir abdullayev": "/fighters/tahir-abdullayev.png",
  "theodor berggren": "/fighters/theodor-berggren.jpg",
  // Pioneers del Salón de la Fama sin headshot en BD (mostraban iniciales).
  // Retratos de Wikimedia Commons, optimizados a webp.
  "pat miletich": "/fighters/pat-miletich.webp",
  "bas rutten": "/fighters/bas-rutten.webp",
  "antônio rodrigo nogueira": "/fighters/antonio-rodrigo-nogueira.webp",
  "antonio rodrigo nogueira": "/fighters/antonio-rodrigo-nogueira.webp",
  "kazushi sakuraba": "/fighters/kazushi-sakuraba.webp",
  "kevin randleman": "/fighters/kevin-randleman.webp",
  "jens pulver": "/fighters/jens-pulver.webp",
  "mark kerr": "/fighters/mark-kerr.webp",
  // Esquinas del Fight Wing del Salón de la Fama sin headshot en BD (mostraban
  // iniciales). Retratos de dominio público de Wikimedia Commons, optimizados a
  // webp. Al keyear por nombre, también rellenan la ficha /fighters del luchador.
  "chael sonnen": "/fighters/chael-sonnen.webp",
  "frank trigg": "/fighters/frank-trigg.webp",
  "jessie rosas": "/fighters/jessie-rosas.jpg",
  "richie miranda": "/fighters/richie-miranda.jpg",
  "jose montanha da silva": "/fighters/jose-montanha-da-silva.jpg",
  "gigi canuto": "/fighters/gigi-canuto.jpg",
  "ce liu": "/fighters/ce-liu.png",
  "salahdine parnasse": "/fighters/salahdine-parnasse.jpg",
  // Debutantes del 1086 (22-ago): ufc.com tiene su página vacía y ESPN no trae
  // foto. Recortadas de Tapology; la de Dorsainvil venía de una foto de grupo.
  "terrance chatman": "/fighters/terrance-chatman.jpg",
  "ryan kuse": "/fighters/ryan-kuse.jpg",
  "stan dorsainvil": "/fighters/stan-dorsainvil.jpg",
  // La BD y Tapology lo llaman Stan; el alias cubre que ufc.com lo publique
  // como Stanley antes del sábado.
  "stanley dorsainvil": "/fighters/stan-dorsainvil.jpg",
  // 🪤 EL CUARTO, y el que casi se queda fuera. El parte hablaba de "tres
  // debutantes", pero el 1086 creó CUATRO fichas nuevas y las cuatro tenían
  // headshot_url a NULL. Wint se salvó de aparecer en la lista porque SÍ tiene
  // full_body_url, y SIN_FOTO_SQL exige que falten las tres fotos a la vez
  // (cara, cuerpo y cuerpo de pie) para contar a alguien: era invisible para su
  // propio chivato. Si algún día se busca "quién sale con la cabeza vacía", la
  // pregunta es por headshot_url a secas.
  "anthony wint": "/fighters/anthony-wint.jpg",
};

// Overrides de headshot con PRIORIDAD sobre la BD (espejo de local-bodies): para
// curar cabezas ausentes o de baja calidad, p.ej. sustituir el headshot B/N de
// una leyenda por una foto en color. A diferencia de LOCAL_HEADSHOTS (solo
// fallback), estas pisan el headshot_url de la BD.
const LOCAL_HEADSHOT_OVERRIDES: Record<string, string> = {
  // Forrest Griffin: en BD solo está su headshot 2012 en blanco y negro; foto en
  // color provista por el dueño, optimizada a webp.
  "forrest griffin": "/fighters/forrest-griffin.webp",
};

export function localHeadshot(name: string): string | null {
  return LOCAL_HEADSHOTS[name.trim().toLowerCase()] ?? null;
}

export function localHeadshotOverride(name: string): string | null {
  return LOCAL_HEADSHOT_OVERRIDES[name.trim().toLowerCase()] ?? null;
}
