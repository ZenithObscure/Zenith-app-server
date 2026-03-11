/** Global type declarations for the Electron context bridge API exposed via preload.ts */

interface ElectronAPI {
  readonly isElectron: true
  getVersion(): Promise<string>
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
