import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { readFileSync } from 'node:fs'

const mathjaxVersion: string = JSON.parse(readFileSync('node_modules/mathjax-full/package.json', 'utf8')).version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      // Sandboxed preloads must be CommonJS, even though the package is ESM.
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    plugins: [svelte()],
    // MathJax reads its version with eval() unless PACKAGE_VERSION is defined
    // at build time; the page's Content-Security-Policy (rightly) forbids eval.
    define: { PACKAGE_VERSION: JSON.stringify(mathjaxVersion) },
    optimizeDeps: { esbuildOptions: { define: { PACKAGE_VERSION: JSON.stringify(mathjaxVersion) } } },
  },
})
