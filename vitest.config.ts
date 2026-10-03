import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// @shared/… as in the app's builds (plugins' modules use it).
const alias = { '@shared': resolve('src/shared') }

// Two projects: fast unit tests (no TeX needed) and end-to-end tests that
// run pdflatex. `npm test` runs the first, `npm run test:e2e` the second.
export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: 'unit', include: ['tests/**/*.test.ts'] } },
      { resolve: { alias }, test: { name: 'e2e', include: ['tests/**/*.e2e.ts'], testTimeout: 60_000 } },
    ],
  },
})
