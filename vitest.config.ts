import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests de lógica pura (sin Next ni DOM). El QA de UI se hace con Playwright.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
