import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { copyFile, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compile, resolveRoot } from './compile'
import { importImage, saveImage } from './images'
import { editorContextFor, macrosFor } from './mathmacros'
import { globalTemplatesDir, loadSettings, saveSettings } from './settings'
import { forward, inverse } from './synctex'
import { Vault } from './vault'
import { isImage } from '../shared/images'

let win: BrowserWindow | null = null
let vault: Vault | null = null

async function openVault(root: string): Promise<Vault> {
  await vault?.close()
  vault = new Vault(resolve(root), await globalTemplatesDir())
  await vault.load()
  vault.watch(async () => win?.webContents.send('tree-changed', await vault!.tree()))
  await saveSettings({ lastVault: vault.root })
  return vault
}

/**
 * Moves a vault file into the global template library, asking before
 * replacing a file of the same name there. Returns where it went, or null
 * if the user said no.
 */
async function moveToGlobalTemplates(rel: string): Promise<string | null> {
  const v = requireVault()
  const from = v.abs(rel)
  const dir = await globalTemplatesDir()
  const to = join(dir, basename(from))
  if (await stat(to).then(() => true, () => false)) {
    const r = await dialog.showMessageBox(win!, {
      type: 'question',
      message: `${basename(from)} is already in the global template folder`,
      detail: `Replace it with the copy from this vault?\n\n${dir}`,
      buttons: ['Replace', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    })
    if (r.response !== 0) return null
  }
  try {
    await rename(from, to)
  } catch {
    // rename can't cross drives: copy, then remove the original.
    await copyFile(from, to)
    await unlink(from)
  }
  return to
}

/** Lets the user pick a new global template folder, and uses it from now on. */
async function changeGlobalTemplates(): Promise<void> {
  const r = await dialog.showOpenDialog(win!, {
    title: 'Choose the global template folder',
    defaultPath: await globalTemplatesDir(),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (r.canceled || !r.filePaths[0]) return
  await saveSettings({ templates: r.filePaths[0] })
  if (vault) {
    vault.globalTemplates = await globalTemplatesDir()
    win?.webContents.send('vault-changed', await vault.info())
  }
}

function requireVault(): Vault {
  if (!vault) throw new Error('No vault open')
  return vault
}

ipcMain.handle('vault:open', async () => {
  const r = await dialog.showOpenDialog(win!, { title: 'Open vault folder', properties: ['openDirectory'] })
  if (r.canceled || !r.filePaths[0]) return null
  return (await openVault(r.filePaths[0])).info()
})
ipcMain.handle('vault:get', async () => vault?.info() ?? null)
ipcMain.handle('file:read', (_e, rel: string) => readFile(requireVault().abs(rel), 'utf8'))
ipcMain.handle('file:write', (_e, rel: string, text: string) => writeFile(requireVault().abs(rel), text, 'utf8'))
ipcMain.handle('compile', (_e, rel: string) => compile(requireVault(), rel))
/** Only PDFs the compiler produced (in .texcache), never arbitrary files. */
function requireCompiledPdf(abs: string): string {
  const cache = join(requireVault().root, '.texcache') + sep
  if (!resolve(abs).startsWith(cache) || !abs.endsWith('.pdf')) throw new Error('Not a compiled PDF')
  return abs
}

ipcMain.handle('pdf:read', async (_e, abs: string) => new Uint8Array(await readFile(requireCompiledPdf(abs))))
ipcMain.handle('synctex:forward', (_e, pdf: string, rel: string, line: number) =>
  forward(requireCompiledPdf(pdf), requireVault().abs(rel), line),
)
ipcMain.handle('synctex:inverse', async (_e, pdf: string, page: number, x: number, y: number) => {
  const hit = await inverse(requireCompiledPdf(pdf), page, x, y)
  return hit && { file: requireVault().rel(hit.file) ?? hit.file, line: hit.line }
})
// Macros for previewing math in `rel`: those of the document it belongs to.
ipcMain.handle('images:list', async () => (await requireVault().files()).filter(isImage))
ipcMain.handle('images:import', (_e, source: string) => importImage(requireVault(), source))
ipcMain.handle('images:save', (_e, name: string, bytes: Uint8Array) => saveImage(requireVault(), name, bytes))
ipcMain.handle('templates:move', (_e, rel: string) => moveToGlobalTemplates(rel))
ipcMain.handle('math:macros',async (_e, rel: string) => {
  const v = requireVault()
  return macrosFor(v, (await resolveRoot(v, rel).catch(() => null)) ?? rel)
})
ipcMain.handle('editor:context', async (_e, rel: string) => {
  const v = requireVault()
  return editorContextFor(v, (await resolveRoot(v, rel).catch(() => null)) ?? rel)
})

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Open Vault…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('menu:open-vault') },
          {
            label: 'Template Folder',
            submenu: [
              { label: 'Show in Explorer', click: async () => shell.openPath(await globalTemplatesDir()) },
              { label: 'Change…', click: () => changeGlobalTemplates() },
            ],
          },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
      },
    ]),
  )
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    title: 'LaTeX Editor',
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true },
  })
  // The page never navigates: a link clicked anywhere (e.g. a \href inside
  // a math preview) must not replace the app or open new windows.
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // A vault given on the command line (--vault=path) wins over the remembered one.
  const arg = process.argv.find((a) => a.startsWith('--vault='))?.slice('--vault='.length)
  const initial = arg ?? process.env.LATEX_VAULT ?? (await loadSettings()).lastVault
  if (initial) await openVault(initial).catch(() => null)

  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

// vault://files/<vault-relative path> serves images and PDFs from the open
// vault to <img> tags and thumbnail rendering, and nothing outside it.
protocol.registerSchemesAsPrivileged([{ scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

async function serveVaultFile(request: Request): Promise<Response> {
  try {
    const rel = decodeURIComponent(new URL(request.url).pathname.slice(1))
    if (!isImage(rel)) return new Response('Only images are served', { status: 403 })
    const file = await net.fetch(pathToFileURL(requireVault().abs(rel)).toString())
    // The page's origin is file://, so fetch() (for PDF thumbnails) needs CORS.
    const headers = new Headers(file.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(file.body, { status: file.status, headers })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

app.whenReady().then(() => {
  protocol.handle('vault', serveVaultFile)
  buildMenu()
  createWindow()
})
app.on('window-all-closed', () => app.quit())
