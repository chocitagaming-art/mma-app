import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests de lógica pura (sin Next ni DOM). El QA de UI se hace con Playwright.
export default defineConfig({
  test: {
    environment: "node",
    // El `.tsx` está a propósito aunque hoy no exista ningún test de componente
    // (0 ficheros *.test.tsx). Con el glob antiguo, solo `.ts`, un test de
    // componente añadido por descuido se IGNORABA EN SILENCIO y el megatest
    // seguía en verde: comprobado montando un proyecto de usar y tirar con este
    // mismo glob, un a.test.ts que pasa y un b.test.tsx con expect(1).toBe(2) →
    // "Test Files 1 passed". Con `.tsx` incluido, ese fichero falla RUIDOSAMENTE
    // al no encontrar `document` en environment: "node", que es lo que se quiere:
    // el aviso de que la lógica de UI se prueba con Playwright, no aquí.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
