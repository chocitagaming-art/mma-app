// Validación del formulario de contacto, SIN tocar ni la red ni la base de
// datos: la decisión entera es una función pura y por eso se puede probar sola.
//
// Los topes coinciden a propósito con los CHECK de la migración 025. Hay tres
// capas —el formulario, esto y la base— y no sobra ninguna: la del navegador es
// una comodidad que cualquiera se salta con `curl`, esta es la puerta de
// verdad, y la de la base es la última red por si alguien afloja esta al
// refactorizar.

export const LIMITES = {
  nombreMax: 80,
  emailMin: 5,
  emailMax: 160,
  mensajeMin: 10,
  mensajeMax: 2000,
} as const;

export type MensajeContacto = {
  nombre: string | null;
  email: string;
  mensaje: string;
};

export type ResultadoValidacion =
  | { ok: true; datos: MensajeContacto }
  | { ok: false; motivo: "spam" }
  | { ok: false; motivo: "invalido"; error: string };

// Deliberadamente PERMISIVO. Validar direcciones de correo con una expresión
// regular estricta es un clásico que rechaza direcciones válidas (las que
// llevan `+`, dominios largos, acentos): lo único que se comprueba es que haya
// algo, una arroba, algo, un punto y algo, sin espacios. Quien se equivoque al
// teclear su correo no recibirá respuesta, y eso no lo arregla una regex.
const FORMA_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export function validarContacto(entrada: unknown): ResultadoValidacion {
  if (typeof entrada !== "object" || entrada === null) {
    return { ok: false, motivo: "invalido", error: "Falta el mensaje." };
  }
  const cuerpo = entrada as Record<string, unknown>;

  // Trampa para robots: un campo que un humano NO ve y por tanto no rellena.
  // Se responde como si todo hubiera ido bien (lo hace la ruta) para no
  // enseñarle al robot cuál es el campo que le delata.
  if (texto(cuerpo.web).length > 0) {
    return { ok: false, motivo: "spam" };
  }

  const email = texto(cuerpo.email);
  if (email.length < LIMITES.emailMin || email.length > LIMITES.emailMax) {
    return { ok: false, motivo: "invalido", error: "Escribe un correo válido." };
  }
  if (!FORMA_DE_EMAIL.test(email)) {
    return { ok: false, motivo: "invalido", error: "Escribe un correo válido." };
  }

  const mensaje = texto(cuerpo.mensaje);
  if (mensaje.length < LIMITES.mensajeMin) {
    return {
      ok: false,
      motivo: "invalido",
      error: `El mensaje es muy corto (mínimo ${LIMITES.mensajeMin} caracteres).`,
    };
  }
  if (mensaje.length > LIMITES.mensajeMax) {
    return {
      ok: false,
      motivo: "invalido",
      error: `El mensaje es muy largo (máximo ${LIMITES.mensajeMax} caracteres).`,
    };
  }

  const nombre = texto(cuerpo.nombre);
  if (nombre.length > LIMITES.nombreMax) {
    return {
      ok: false,
      motivo: "invalido",
      error: `El nombre es muy largo (máximo ${LIMITES.nombreMax} caracteres).`,
    };
  }

  return {
    ok: true,
    // Vacío se guarda como NULL y no como "": la columna es opcional, y una
    // cadena vacía obliga a comprobar dos cosas distintas al leer la bandeja.
    datos: { nombre: nombre.length > 0 ? nombre : null, email, mensaje },
  };
}
