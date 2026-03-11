import { contextBridge, ipcRenderer } from 'electron'

type Unsubscribe = () => void

const cleanupFns: Unsubscribe[] = []

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,

  getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  getDeviceId: (): Promise<string> => ipcRenderer.invoke('get-device-id'),

  getSystemStats: (): Promise<{
    deviceId: string
    hostname: string
    platform: string
    cpuModel: string
    cpuCores: number
    cpuPercent: number
    ramUsedGb: number
    ramTotalGb: number
    diskUsedGb: number
    diskTotalGb: number
  }> => ipcRenderer.invoke('get-system-stats'),

  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),

  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),

  showWindow: (): Promise<void> => ipcRenderer.invoke('show-window'),

  // ─── Local LLM (Fidus AI) ────────────────────────────────────────────────────

  fidusGetModelStatus: (): Promise<{ isModelUnpacked: boolean; isModelBundled: boolean }> =>
    ipcRenderer.invoke('fidus-model-status'),

  /** Trigger decompression of the bundled model (idempotent). */
  fidusInit: (): Promise<void> => ipcRenderer.invoke('fidus-init'),

  /**
   * Start a streaming inference request. Tokens arrive via onFidusToken().
   * Resolves with the full response string once inference is complete.
   */
  fidusChat: (
    convId: string,
    messages: Array<{ role: string; text: string }>,
  ): Promise<string> => ipcRenderer.invoke('fidus-chat', { convId, messages }),

  /** Listen for individual tokens during inference. Returns an unsubscribe fn. */
  onFidusToken: (
    cb: (payload: {
      convId: string
      chunk: string
      done: boolean
      fullText?: string
      error?: string
    }) => void,
  ): (() => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (_event: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('fidus-token', listener)
    return () => ipcRenderer.removeListener('fidus-token', listener)
  },

  /** Listen for model decompression / loading progress. Returns an unsubscribe fn. */
  onFidusModelProgress: (
    cb: (payload: { progress: number; message: string; phase: string }) => void,
  ): (() => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = (_event: Electron.IpcRendererEvent, payload: any) => cb(payload)
    ipcRenderer.on('fidus-model-progress', listener)
    return () => ipcRenderer.removeListener('fidus-model-progress', listener)
  },

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
