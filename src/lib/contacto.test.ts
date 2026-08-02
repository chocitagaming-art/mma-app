import { describe, expect, it } from "vitest";

import { LIMITES, validarContacto } from "@/lib/contacto";

// La puerta de verdad del formulario. La validación del navegador es una
// comodidad que cualquiera se salta con `curl`, así que todo lo que importa se
// prueba aquí.

const VALIDO = {
  nombre: "Ana",
  email: "ana@ejemplo.com",
  mensaje: "El récord de Charles Oliveira está mal en su ficha.",
  web: "",
};

describe("validarContacto", () => {
  it("acepta un mensaje normal", () => {
    const r = validarContacto(VALIDO);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.email).toBe("ana@ejemplo.com");
      expect(r.datos.nombre).toBe("Ana");
    }
  });

  it("el nombre es opcional y vacío se guarda como NULL, no como cadena vacía", () => {
    // Una cadena vacía obliga a comprobar dos cosas distintas al leer la bandeja.
    for (const nombre of ["", "   ", undefined]) {
      const r = validarContacto({ ...VALIDO, nombre });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.datos.nombre).toBeNull();
    }
  });

  it("recorta los espacios de los tres campos", () => {
    const r = validarContacto({
      ...VALIDO,
      nombre: "  Ana  ",
      email: "  ana@ejemplo.com  ",
      mensaje: `   ${VALIDO.mensaje}   `,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.nombre).toBe("Ana");
      expect(r.datos.email).toBe("ana@ejemplo.com");
      expect(r.datos.mensaje).toBe(VALIDO.mensaje);
    }
  });

  // ── La trampa para robots ────────────────────────────────────────────────
  it("un campo trampa relleno es spam, y NO se distingue de un envío bueno", () => {
    const r = validarContacto({ ...VALIDO, web: "http://spam.example" });
    expect(r.ok).toBe(false);
    // El motivo va aparte de "invalido" a propósito: la ruta contesta 200 al
    // robot para no enseñarle cuál es el campo que le delata.
    if (!r.ok) expect(r.motivo).toBe("spam");
  });

  it("el campo trampa vacío NO es spam", () => {
    expect(validarContacto({ ...VALIDO, web: "" }).ok).toBe(true);
    expect(validarContacto({ ...VALIDO, web: "   " }).ok).toBe(true);
  });

  // ── Correo ───────────────────────────────────────────────────────────────
  it("rechaza correos que no lo parecen", () => {
    for (const email of ["", "ana", "ana@", "@ejemplo.com", "ana@ejemplo", "a b@c.es"]) {
      const r = validarContacto({ ...VALIDO, email });
      expect(r.ok, `deberia rechazar ${JSON.stringify(email)}`).toBe(false);
      if (!r.ok) expect(r.motivo).toBe("invalido");
    }
  });

  it("acepta correos raros pero válidos, que una regex estricta tumbaría", () => {
    for (const email of [
      "ana+mma@ejemplo.com",
      "a@b.co",
      "nombre.apellido@sub.dominio.museum",
      "ñoño@ejemplo.es",
    ]) {
      expect(validarContacto({ ...VALIDO, email }).ok, email).toBe(true);
    }
  });

  // ── Topes, los mismos que los CHECK de la migración 025 ──────────────────
  it("respeta los topes de longitud por los dos extremos", () => {
    expect(validarContacto({ ...VALIDO, mensaje: "corto" }).ok).toBe(false);
    expect(
      validarContacto({ ...VALIDO, mensaje: "x".repeat(LIMITES.mensajeMin) }).ok,
    ).toBe(true);
    expect(
      validarContacto({ ...VALIDO, mensaje: "x".repeat(LIMITES.mensajeMax) }).ok,
    ).toBe(true);
    expect(
      validarContacto({ ...VALIDO, mensaje: "x".repeat(LIMITES.mensajeMax + 1) }).ok,
    ).toBe(false);
    expect(
      validarContacto({ ...VALIDO, nombre: "x".repeat(LIMITES.nombreMax + 1) }).ok,
    ).toBe(false);
    expect(
      validarContacto({
        ...VALIDO,
        email: `${"x".repeat(LIMITES.emailMax)}@ejemplo.com`,
      }).ok,
    ).toBe(false);
  });

  it("no revienta con basura en vez de un objeto", () => {
    for (const basura of [null, undefined, "texto", 42, []]) {
      const r = validarContacto(basura);
      expect(r.ok, String(basura)).toBe(false);
    }
  });

  it("ignora los campos que no espera en vez de guardarlos", () => {
    const r = validarContacto({ ...VALIDO, handled: true, id: 99, otro: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.datos).sort()).toEqual(["email", "mensaje", "nombre"]);
  });
});
