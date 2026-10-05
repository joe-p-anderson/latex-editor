// Makes the Windows icons, endleaf-marbled-themes/icons/*.ico, from the SVGs
// beside them: each SVG drawn by Chromium at every size Windows asks for, and
// the PNGs packed into one .ico. Run it again after editing an SVG.
//
//   npm run icons
//
// Runs under Electron (already a dev dependency), so it needs nothing else.
import { app, BrowserWindow } from 'electron'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
const DIR = join(import.meta.dirname, '../endleaf-marbled-themes/icons')

/** An .ico holding the PNGs in `images`, whose sizes are `sizes`. */
function packIco(images, sizes) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach((png, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e) // width (0 means 256)
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e + 1) // height
    header.writeUInt16LE(1, e + 4) // colour planes
    header.writeUInt16LE(32, e + 6) // bits per pixel
    header.writeUInt32LE(png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images])
}

/** Draws `svg` at each size in the window's page, and returns the PNGs. */
async function render(win, svg, sizes) {
  const urls = await win.webContents.executeJavaScript(`(async () => {
    const svg = ${JSON.stringify(svg)}
    const out = []
    for (const size of ${JSON.stringify(sizes)}) {
      // Sized in the markup, so Chromium rasterizes the vectors at this size rather than scaling a bitmap.
      const sized = svg.replace(/<svg\\b[^>]*>/, (tag) => tag.replace(/\\s(width|height)="[^"]*"/g, '') .replace('<svg', '<svg width="' + size + '" height="' + size + '"'))
      const img = new Image()
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized)
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d').drawImage(img, 0, 0, size, size)
      out.push(canvas.toDataURL('image/png'))
    }
    return out
  })()`)
  return urls.map((u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'))
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,<!doctype html><title>icons</title>')
  const svgs = readdirSync(DIR).filter((f) => f.endsWith('.svg'))
  for (const f of svgs) {
    const pngs = await render(win, readFileSync(join(DIR, f), 'utf8'), SIZES)
    writeFileSync(join(DIR, f.replace(/\.svg$/, '.ico')), packIco(pngs, SIZES))
  }
  console.log(`Made ${svgs.length} icons at ${SIZES.join(', ')} px.`)
  app.quit()
})
