// Builds the endleaf UI mockup into a page you can open straight from disk.
// The source keeps two placeholders, filled from endleaf-marbled-themes/:
// __THEMES__ (themes.json) and __PATHS__ (the logo's leaf and ground paths).
//
//   node docs/design/build-mockup.mjs
//
// Output: docs/design/endleaf-mockup.html
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const themesDir = join(here, '../../endleaf-marbled-themes')
const path = (file, id) => readFileSync(join(themesDir, 'icons', file), 'utf8').match(new RegExp(`id="${id}" d="([^"]*)"`))[1]

const paths = {
  leaf: path('autumn-ember-dark-full.svg', 'e_L'),
  ground: path('autumn-ember-dark-full.svg', 'e_G'),
  leafSmall: path('autumn-ember-dark-small.svg', 'e_L'),
}
const page = readFileSync(join(here, 'endleaf-mockup.src.html'), 'utf8')
  .replace('__THEMES__', () => readFileSync(join(themesDir, 'themes.json'), 'utf8'))
  .replace('__PATHS__', () => JSON.stringify(paths))

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${page}
</body>
</html>
`
writeFileSync(join(here, 'endleaf-mockup.html'), html)
console.log('Wrote docs/design/endleaf-mockup.html')
