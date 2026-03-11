/** Global type declarations for the Electron context bridge API exposed via preload.ts */

interface SystemStats {
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
}

interface FidusToken {
  convId: string
  chunk: string
  done: boolean
  fullText?: string
  error?: string
}

interface FidusModelProgress {
  progress: number
  message: string
  phase: 'decompressing' | 'loading' | 'done' | 'error'
}

interface FidusModelStatus {
  isModelUnpacked: boolean
  isModelBundled: boolean
}

interface ElectronAPI {
  readonly isElectron: true
  getVersion(): Promise<string>
  getDeviceId(): Promise<string>
  getSystemStats(): Promise<SystemStats>
  openExternal(url: string): Promise<void>
  installUpdate(): Promise<void>
  showWindow(): Promise<void>
  // ─── Local LLM ─────────────────────────────────────────────────────────────
  fidusGetModelStatus(): Promise<FidusModelStatus>
  fidusInit(): Promise<void>
  fidusChat(convId: string, messages: Array<{ role: string; text: string }>): Promise<string>
  onFidusToken(cb: (payload: FidusToken) => void): () => void
  onFidusModelProgress(cb: (payload: FidusModelProgress) => void): () => void
  // ─── Auto-update ────────────────────────────────────────────────────────────
  onUpdateAvailable(cb: (version: string) => void): void
  onUpdateDownloaded(cb: () => void): void
  removeAllListeners(): void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
