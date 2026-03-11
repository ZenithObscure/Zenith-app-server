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

interface ElectronAPI {
  readonly isElectron: true
  getVersion(): Promise<string>
  getDeviceId(): Promise<string>
  getSystemStats(): Promise<SystemStats>
  openExternal(url: string): Promise<void>
  installUpdate(): Promise<void>
  showWindow(): Promise<void>
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
