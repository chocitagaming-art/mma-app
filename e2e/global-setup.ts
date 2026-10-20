import type { FullConfig } from "@playwright/test";

import { checkServerIdentity } from "../scripts/megatest-lib.mjs";

// Under the megatest only (playwright.config.ts registers this file when
// E2E_EXPECT_VERSION is set). Playwright runs it once the webServer answers and
// before the first test: if whoever answers on the url is not this worktree's
// build at HEAD, nothing runs and the e2e gate goes red.
//
// Why it is needed even with E2E_FRESH_SERVER=1: Playwright refuses a url that
// answers BEFORE it launches the command, but during the minutes of `next build`
// it only polls the url, and any server that starts answering there passes for
// ours (21-oct-2026: 16 tests ran against a fake "old build" started 4 s in).
export default async function globalSetup(config: FullConfig) {
  const version = process.env.E2E_EXPECT_VERSION;
  const distDir = process.env.E2E_EXPECT_DIST_DIR;
  const baseURL = config.projects[0]?.use.baseURL;
  if (!version || !distDir || !baseURL) {
    throw new Error("global-setup: faltan E2E_EXPECT_VERSION, E2E_EXPECT_DIST_DIR o baseURL");
  }
  const problem = await checkServerIdentity({ baseURL, distDir, version });
  if (problem) throw new Error(`No es el server que toca medir: ${problem}`);
}
