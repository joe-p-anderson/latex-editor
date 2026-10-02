import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bibInfo } from './bibliography'
import { cacheDirFor, compile, compileDraft, compileSection, fullBuildReason, resolveRoot } from './compile'
import { discoverPaperOf, paperInfo } from './project'
import { importImage, saveImage } from './images'
import { editorContextFor, macrosFor } from './mathmacros'
import { appAppearance, globalTemplatesDir, loadSettings, migrateSettings, saveAppAppearance, saveSettings } from './settings'
import { searchVault } from './search'
import { addWord, misspelled, reloadWords, suggestions } from './spell'
import { startTouchpad, stopTouchpad } from './touchpad'
import { forward, inverse } from './synctex'
import { Vault } from './vault'
import { isImage } from '../shared/images'
import type { SearchOptions } from '../shared/search'
import { normalizeVaultAppearance, PALETTES, type AppAppearance, type VaultAppearance } from '../shared/appearance'
import type { RecentVault, SectionTarget } from '../shared/api'

let win: BrowserWindow | null = null
let vault: Vault | null = null
// Set once the renderer has dealt with unsaved files, so the next close goes through.
let closeConfirmed = false

async function openVault(root: string): Promise<Vault> {
  await vault?.close()
  vault = new Vault(resolve(root), await globalTemplatesDir())
  await vault.load()
  vault.watch(async () => win?.webContents.send('tree-changed', await vault!.tree()))
  const recent = (await loadSettings()).recentVaults ?? []
  await saveSettings({
    lastVault: vault.root,
    recentVaults: [{ root: vault.root, opened: Date.now() }, ...recent.filter((r) => r.root !== vault!.root)].slice(0, 8),
  })
  return vault
}

/** The vaults opened before that still exist, with their endpapers, for the welcome screen. */
async function recentVaults(): Promise<RecentVault[]> {
  const out: RecentVault[] = []
  for (const r of (await loadSettings()).recentVaults ?? []) {
    if (!(await stat(r.root).then((s) => s.isDirectory(), () => false))) continue
    const settings = await readFile(join(r.root, '.vault.json'), 'utf8').then(JSON.parse, () => ({}))
    out.push({ root: r.root, name: basename(r.root), opened: r.opened, appearance: normalizeVaultAppearance(settings.appearance, basename(r.root)) })
  }
  return out
}

/** A new vault: a folder (picked or made in the dialog) given its own endpaper. */
async function newVault(): Promise<Vault | null> {
  const r = await dialog.showOpenDialog(win!, {
    title: 'Choose or make a folder for the new vault',
    buttonLabel: 'Make vault here',
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  })
  if (r.canceled || !r.filePaths[0]) return null
  const root = r.filePaths[0]
  await mkdir(root, { recursive: true })
  const v = await openVault(root)
  // A fresh vault gets a palette of its own, so the welcome screen tells them apart.
  if (!(await stat(join(root, '.vault.json')).then(() => true, () => false))) {
    await v.saveAppearance({ palette: PALETTES[Math.floor(Math.random() * PALETTES.length)] })
  }
  return v
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

/**
 * Asks what to do with unsaved files before `action` (closing a tab,
 * quitting, opening another vault): save them, discard them, or cancel.
 */
async function askAboutUnsaved(files: string[], action: string): Promise<'save' | 'discard' | 'cancel'> {
  const one = files.length === 1
  const r = await dialog.showMessageBox(win!, {
    type: 'warning',
    message: one ? `Save changes to ${files[0].split('/').pop()} before ${action}?` : `Save changes to ${files.length} files before ${action}?`,
    detail: one ? "Your changes will be lost if you don't save them." : files.join('\n'),
    buttons: [one ? 'Save' : 'Save all', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  })
  return (['save', 'discard', 'cancel'] as const)[r.response]
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
ipcMain.handle('vault:recent', () => recentVaults())
ipcMain.handle('vault:open-path', async (_e, root: string) => (await openVault(root)).info())
ipcMain.handle('vault:new', async () => (await newVault())?.info() ?? null)
ipcMain.handle('vault:close', async () => {
  await vault?.close()
  vault = null
  await saveSettings({ lastVault: undefined })
})
ipcMain.handle('file:read', (_e, rel: string) => readFile(requireVault().abs(rel), 'utf8'))
ipcMain.handle('file:write', (_e, rel: string, text: string) => writeFile(requireVault().abs(rel), text, 'utf8'))
ipcMain.handle('file:rename', async (_e, from: string, to: string) => {
  const v = requireVault()
  if (await stat(v.abs(to)).then(() => true, () => false)) throw new Error(`${to} already exists`)
  await rename(v.abs(from), v.abs(to))
})
ipcMain.handle('file:trash', (_e, rel: string) => shell.trashItem(requireVault().abs(rel)))
ipcMain.handle('compile', (_e, rel: string) => compile(requireVault(), rel))
ipcMain.handle('compile:draft', (_e, rel: string, buffers: Record<string, string>) => compileDraft(requireVault(), rel, buffers))
ipcMain.handle('compile:section', async (_e, rel: string, buffers: Record<string, string>, target: SectionTarget, saving: boolean) => {
  const v = requireVault()
  const root = await resolveRoot(v, rel, buffers[rel]).catch(() => null)
  if (!root) return compileDraft(v, rel, buffers)
  const full = async (reason: string) => {
    const r = Object.keys(buffers).length ? await compileDraft(v, rel, buffers) : await compile(v, rel)
    return r && { ...r, fullReason: reason }
  }
  if (saving) {
    const text = buffers[rel] ?? (await readFile(v.abs(rel), 'utf8').catch(() => ''))
    const reason = await fullBuildReason(v, root, rel, text)
    if (reason) return full(reason)
  }
  return (await compileSection(v, rel, buffers, target.unit, target.start, target.label)) ?? full("The paper hasn't been built in full yet")
})
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
// Credit links (e.g. Detexify's) open in the browser; only these sites.
ipcMain.handle('open-external', (_e, url: string) => {
  if (/^https:\/\/(detexify\.kirelabs\.org|github\.com\/kirel\/detexify)/.test(url)) shell.openExternal(url)
})
// Trackpad tracing: absolute finger positions while the symbol pad traces.
ipcMain.handle('touchpad:start', async () => {
  try {
    return { ok: true, ...(await startTouchpad((ev) => win?.webContents.send('touchpad:event', ev))) }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})
ipcMain.handle('touchpad:stop', () => stopTouchpad())
ipcMain.handle('spell:check', (_e, words: string[]) => misspelled(requireVault(), words))
ipcMain.handle('spell:suggest', (_e, word: string) => suggestions(requireVault(), word))
ipcMain.handle('spell:add', (_e, word: string) => addWord(requireVault(), word))
ipcMain.handle('spell:reload', () => reloadWords(requireVault()))
// The renderer remembers whether spelling is on; the menu's tick follows it.
ipcMain.handle('menu:set-spellcheck', (_e, on: boolean) => {
  const item = Menu.getApplicationMenu()?.getMenuItemById('spellcheck')
  if (item) item.checked = on
})
ipcMain.handle('search:run', (_e, query: string, opts: SearchOptions, overrides: Record<string, string>) =>
  searchVault(requireVault(), query, opts, overrides),
)
ipcMain.handle('dialog:unsaved', (_e, files: string[], action: string) => askAboutUnsaved(files, action))
ipcMain.handle('window:close', () => {
  closeConfirmed = true
  win?.close()
})
ipcMain.handle('appearance:get', () => appAppearance())
ipcMain.handle('appearance:set', (_e, changes: Partial<AppAppearance>) => saveAppAppearance(changes))
ipcMain.handle('appearance:set-vault', (_e, changes: Partial<VaultAppearance>) => requireVault().saveAppearance(changes))
// The custom title bar: its colours for the window controls, and its menu buttons.
ipcMain.handle('window:chrome', (_e, color: string, symbolColor: string) => {
  win?.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT })
})
ipcMain.handle('menu:popup', (_e, label: string, x: number, y: number) => {
  const item = Menu.getApplicationMenu()?.items.find((i) => i.label === label)
  if (win && item?.submenu) item.submenu.popup({ window: win, x: Math.round(x), y: Math.round(y) })
})
// Marbled sheets, rendered once in the renderer and cached here by
// engine|palette|tone|pattern|seed|size.
const marblePath = (key: string) => {
  if (!/^[a-z0-9|-]+$/i.test(key)) throw new Error('Bad marble key')
  return join(app.getPath('userData'), 'marbles', `${key.replace(/\|/g, '_')}.jpg`)
}
ipcMain.handle('marble:get', async (_e, key: string) => readFile(marblePath(key)).then((b) => new Uint8Array(b), () => null))
ipcMain.handle('marble:put', async (_e, key: string, bytes: Uint8Array) => {
  await mkdir(join(app.getPath('userData'), 'marbles'), { recursive: true })
  await writeFile(marblePath(key), bytes)
})
ipcMain.handle('vault:branch', () => (vault ? gitBranch(vault.root) : null))
ipcMain.handle('math:macros',async (_e, rel: string) => {
  const v = requireVault()
  return macrosFor(v, (await resolveRoot(v, rel).catch(() => null)) ?? rel)
})
ipcMain.handle('editor:context', async (_e, rel: string) => {
  const v = requireVault()
  return editorContextFor(v, (await resolveRoot(v, rel).catch(() => null)) ?? rel)
})
ipcMain.handle('bib:info', async (_e, rel: string) => {
  const v = requireVault()
  const root = (await resolveRoot(v, rel).catch(() => null)) ?? rel
  return bibInfo(v, root, cacheDirFor(v, root))
})
ipcMain.handle('paper:info', async (_e, rel: string) => {
  const v = requireVault()
  const root = await resolveRoot(v, rel).catch(() => null)
  if (root) {
    const info = await paperInfo(v, root)
    if (root === rel || info.files.some((f) => f.rel === rel)) return info
  }
  // Not part of the document it would build: perhaps of one not marked yet.
  const found = await discoverPaperOf(v, rel)
  return found ? paperInfo(v, found) : null
})
ipcMain.handle('paper:declare', (_e, root: string, on: boolean) => requireVault().savePaper(root, on))

/** The checked-out branch of the git repository containing `dir`, or null. */
async function gitBranch(dir: string): Promise<string | null> {
  for (let d = resolve(dir); ; d = resolve(d, '..')) {
    const head = await readFile(join(d, '.git', 'HEAD'), 'utf8').catch(() => null)
    if (head != null) return /^ref: refs\/heads\/(.+)$/m.exec(head)?.[1]?.trim() ?? head.trim().slice(0, 7)
    if (resolve(d, '..') === d) return null
  }
}

const TITLE_BAR_HEIGHT = 36

/** A menu item that asks the renderer to do `name`. */
const send = (name: string, arg?: unknown) => () => win?.webContents.send('menu', name, arg)

// Shortcuts the renderer handles itself are shown in the menus but not
// registered here (registerAccelerator: false), so the editor keeps them
// where it wants to (e.g. Ctrl+B is bold in the editor).
const shown = (accelerator: string) => ({ accelerator, registerAccelerator: false })

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Open Vault…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('menu:open-vault') },
          { label: 'Close Vault', click: send('close-vault') },
          { label: 'Go to File…', ...shown('CmdOrCtrl+P'), click: send('quick-open') },
          { label: 'Save All', ...shown('CmdOrCtrl+Alt+S'), click: send('save-all') },
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
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
          { type: 'separator' },
          { label: 'Find in Vault', ...shown('CmdOrCtrl+Shift+H'), click: send('find-in-vault') },
          { type: 'separator' },
          { label: 'Insert Image…', click: send('insert-image') },
          { label: 'Cite…', ...shown('CmdOrCtrl+Shift+C'), click: send('cite') },
          { label: 'Math Shortcuts…', click: send('math-shortcuts') },
        ],
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Check Spelling',
            type: 'checkbox',
            id: 'spellcheck',
            checked: true,
            click: (item) => win?.webContents.send('menu', 'spellcheck', item.checked),
          },
          { type: 'separator' },
          { label: 'Live View', ...shown('CmdOrCtrl+Shift+L'), click: send('toggle-live') },
          { label: 'PDF', ...shown('CmdOrCtrl+Alt+V'), click: send('toggle-pdf') },
          { label: 'Sidebar', ...shown('CmdOrCtrl+Shift+B'), click: send('toggle-sidebar') },
          { label: 'Problems and Log', ...shown('CmdOrCtrl+J'), click: send('toggle-panel') },
          { label: 'Appearance', click: send('appearance') },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
        ],
      },
      {
        label: 'Build',
        submenu: [
          { label: 'Recompile', click: send('recompile') },
          { label: 'Show Cursor in PDF', ...shown('CmdOrCtrl+Alt+J'), click: send('sync-forward') },
        ],
      },
    ]),
  )
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    title: 'endleaf',
    // The renderer draws the title bar; Windows draws the window controls over it.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0F1424', symbolColor: '#EBE2D3', height: TITLE_BAR_HEIGHT },
    backgroundColor: '#1F2539',
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true },
  })
  // The page never navigates: a link clicked anywhere (e.g. a \href inside
  // a math preview) must not replace the app or open new windows.
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  // The menus open from the title bar's buttons; their shortcuts still work.
  win.setMenuBarVisibility(false)
  // Closing asks the renderer first, which offers to save unsaved files and
  // then calls window:close. A crashed renderer can't answer, so it doesn't block.
  win.on('close', (e) => {
    if (closeConfirmed || !win || win.webContents.isCrashed()) return
    e.preventDefault()
    win.webContents.send('window:close-requested')
  })

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

app.whenReady().then(async () => {
  await migrateSettings()
  protocol.handle('vault', serveVaultFile)
  buildMenu()
  createWindow()
})
app.on('window-all-closed', () => app.quit())
app.on('will-quit', () => stopTouchpad())
