import { contextBridge, ipcRenderer } from 'electron'

type Unsubscribe = () => void

const cleanupFns: Unsubscribe[] = []

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,

  getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),

  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),

  showWindow: (): Promise<void> => ipcRenderer.invoke('show-window'),

  onUpdateAvailable: (cb: (version: string) => void): void => {
    const listener = (_event: Electron.IpcRendererEvent, version: string) =>
      cb(version)
    ipcRenderer.on('update-available', listener)
    cleanupFns.push(() =>
      ipcRenderer.removeListener('update-available', listener),
    )
  },

  onUpdateDownloaded: (cb: () => void): void => {
    const listener = () => cb()
    ipcRenderer.on('update-downloaded', listener)
    cleanupFns.push(() =>
      ipcRenderer.removeListener('update-downloaded', listener),
    )
  },

  removeAllListeners: (): void => {
    cleanupFns.forEach((fn) => fn())
    cleanupFns.length = 0
  },
})
