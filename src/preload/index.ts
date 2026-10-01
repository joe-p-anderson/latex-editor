import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api, TouchpadEvent, TreeNode, VaultInfo } from '../shared/api'

// The renderer's only door to the filesystem and compiler. Everything goes
// through named IPC channels handled in src/main/index.ts.
const api: Api & { onMenuOpenVault(cb: () => void): () => void } = {
  openVault: () => ipcRenderer.invoke('vault:open'),
  getVault: () => ipcRenderer.invoke('vault:get'),
  recentVaults: () => ipcRenderer.invoke('vault:recent'),
  openVaultAt: (root) => ipcRenderer.invoke('vault:open-path', root),
  newVault: () => ipcRenderer.invoke('vault:new'),
  closeVault: () => ipcRenderer.invoke('vault:close'),
  readFile: (rel) => ipcRenderer.invoke('file:read', rel),
  writeFile: (rel, text) => ipcRenderer.invoke('file:write', rel, text),
  compile: (rel) => ipcRenderer.invoke('compile', rel),
  compileDraft: (rel, buffers) => ipcRenderer.invoke('compile:draft', rel, buffers),
  readPdf: (abs) => ipcRenderer.invoke('pdf:read', abs),
  syncForward: (pdf, rel, line) => ipcRenderer.invoke('synctex:forward', pdf, rel, line),
  syncInverse: (pdf, page, x, y) => ipcRenderer.invoke('synctex:inverse', pdf, page, x, y),
  mathMacros: (rel) => ipcRenderer.invoke('math:macros', rel),
  editorContext: (rel) => ipcRenderer.invoke('editor:context', rel),
  bibInfo: (rel) => ipcRenderer.invoke('bib:info', rel),
  paperInfo: (rel) => ipcRenderer.invoke('paper:info', rel),
  declarePaper: (root, on) => ipcRenderer.invoke('paper:declare', root, on),
  listImages: () => ipcRenderer.invoke('images:list'),
  importImage: (sourcePath) => ipcRenderer.invoke('images:import', sourcePath),
  saveImage: (name, bytes) => ipcRenderer.invoke('images:save', name, bytes),
  moveToGlobalTemplates: (rel) => ipcRenderer.invoke('templates:move', rel),
  pathForFile: (file) => webUtils.getPathForFile(file),
  spellCheck: (words) => ipcRenderer.invoke('spell:check', words),
  spellSuggest: (word) => ipcRenderer.invoke('spell:suggest', word),
  addWord: (word) => ipcRenderer.invoke('spell:add', word),
  reloadWords: () => ipcRenderer.invoke('spell:reload'),
  setSpellcheckMenu: (on) => ipcRenderer.invoke('menu:set-spellcheck', on),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  touchpadStart: () => ipcRenderer.invoke('touchpad:start'),
  touchpadStop: () => ipcRenderer.invoke('touchpad:stop'),
  onTouchpad: (cb) => {
    const listener = (_e: unknown, ev: TouchpadEvent) => cb(ev)
    ipcRenderer.on('touchpad:event', listener)
    return () => ipcRenderer.removeListener('touchpad:event', listener)
  },
  onMenu: (cb) => {
    const listener = (_e: unknown, name: string, arg?: unknown) => cb(name, arg)
    ipcRenderer.on('menu', listener)
    return () => ipcRenderer.removeListener('menu', listener)
  },
  search: (query, opts, overrides) => ipcRenderer.invoke('search:run', query, opts, overrides),
  askAboutUnsaved:(files, action) => ipcRenderer.invoke('dialog:unsaved', files, action),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onCloseRequested: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('window:close-requested', listener)
    return () => ipcRenderer.removeListener('window:close-requested', listener)
  },
  onTreeChanged: (cb) => {
    const listener = (_e: unknown, tree: TreeNode[]) => cb(tree)
    ipcRenderer.on('tree-changed', listener)
    return () => ipcRenderer.removeListener('tree-changed', listener)
  },
  getAppearance: () => ipcRenderer.invoke('appearance:get'),
  setAppearance: (changes) => ipcRenderer.invoke('appearance:set', changes),
  setVaultAppearance: (changes) => ipcRenderer.invoke('appearance:set-vault', changes),
  setWindowChrome: (color, symbolColor) => ipcRenderer.invoke('window:chrome', color, symbolColor),
  popupMenu: (label, x, y) => ipcRenderer.invoke('menu:popup', label, x, y),
  gitBranch: () => ipcRenderer.invoke('vault:branch'),
  marbleGet: (key) => ipcRenderer.invoke('marble:get', key),
  marblePut: (key, bytes) => ipcRenderer.invoke('marble:put', key, bytes),
  onVaultChanged: (cb) => {
    const listener = (_e: unknown, vault: VaultInfo) => cb(vault)
    ipcRenderer.on('vault-changed', listener)
    return () => ipcRenderer.removeListener('vault-changed', listener)
  },
  onMenuOpenVault: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('menu:open-vault', listener)
    return () => ipcRenderer.removeListener('menu:open-vault', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)
