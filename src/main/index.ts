import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { compile } from './compile'
import { Vault } from './vault'

let win: BrowserWindow | null = null
let vault: Vault | null = null

// Remembers the last opened vault between launches.
const settingsPath = () => join(app.getPath('userData'), 'settings.json')
async function loadSettings(): Promise<{ lastVault?: string }> {
  try {
    return JSON.parse(await readFile(settingsPath(), 'utf8'))
  } catch {
    return {}
  }
}
async function saveSettings(s: { lastVault?: string }): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(s, null, 2))
}

async function openVault(root: string): Promise<Vault> {
  await vault?.close()
  vault = new Vault(resolve(root))
  await vault.load()
  vault.watch(async () => win?.webContents.send('tree-changed', await vault!.tree()))
  await saveSettings({ lastVault: vault.root })
  return vault
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
ipcMain.handle('pdf:read', async (_e, abs: string) => {
  // Only PDFs the compiler produced, never arbitrary files.
  const v = requireVault()
  const cache = join(v.root, '.texcache') + sep
  if (!resolve(abs).startsWith(cache) || !abs.endsWith('.pdf')) throw new Error('Not a compiled PDF')
  return new Uint8Array(await readFile(abs))
})

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Open Vault…', accelerator: 'CmdOrCtrl+O', click: () => win?.webContents.send('menu:open-vault') },
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

  // A vault given on the command line (--vault=path) wins over the remembered one.
  const arg = process.argv.find((a) => a.startsWith('--vault='))?.slice('--vault='.length)
  const initial = arg ?? process.env.LATEX_VAULT ?? (await loadSettings()).lastVault
  if (initial) await openVault(initial).catch(() => null)

  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()
})
app.on('window-all-closed', () => app.quit())
