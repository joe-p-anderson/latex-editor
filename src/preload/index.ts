import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Api, TreeNode, VaultInfo } from '../shared/api'

// The renderer's only door to the filesystem and compiler. Everything goes
// through named IPC channels handled in src/main/index.ts.
const api: Api & { onMenuOpenVault(cb: () => void): () => void } = {
  openVault: () => ipcRenderer.invoke('vault:open'),
  getVault: () => ipcRenderer.invoke('vault:get'),
  readFile: (rel) => ipcRenderer.invoke('file:read', rel),
  writeFile: (rel, text) => ipcRenderer.invoke('file:write', rel, text),
  compile: (rel) => ipcRenderer.invoke('compile', rel),
  readPdf: (abs) => ipcRenderer.invoke('pdf:read', abs),
  syncForward: (pdf, rel, line) => ipcRenderer.invoke('synctex:forward', pdf, rel, line),
  syncInverse: (pdf, page, x, y) => ipcRenderer.invoke('synctex:inverse', pdf, page, x, y),
  mathMacros: (rel) => ipcRenderer.invoke('math:macros', rel),
  editorContext: (rel) => ipcRenderer.invoke('editor:context', rel),
  listImages: () => ipcRenderer.invoke('images:list'),
  importImage: (sourcePath) => ipcRenderer.invoke('images:import', sourcePath),
  saveImage: (name, bytes) => ipcRenderer.invoke('images:save', name, bytes),
  moveToGlobalTemplates: (rel) => ipcRenderer.invoke('templates:move', rel),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onTreeChanged: (cb) => {
    const listener = (_e: unknown, tree: TreeNode[]) => cb(tree)
    ipcRenderer.on('tree-changed', listener)
    return () => ipcRenderer.removeListener('tree-changed', listener)
  },
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
