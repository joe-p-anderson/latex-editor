import { defineConfig } from 'vitest/config'

// Two projects: fast unit tests (no TeX needed) and end-to-end tests that
// run pdflatex. `npm test` runs the first, `npm run test:e2e` the second.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['tests/**/*.test.ts'] } },
      { test: { name: 'e2e', include: ['tests/**/*.e2e.ts'], testTimeout: 60_000 } },
    ],
  },
})
