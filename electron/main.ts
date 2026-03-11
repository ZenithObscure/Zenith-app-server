import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  shell,
  Notification,
} from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function getResourcePath(filename: string): string {
  // Packaged: resources are at process.resourcesPath
  // Dev: relative to project root
  if (app.isPackaged) {
    return path.join(process.resourcesPath, filename)
  }
  return path.join(__dirname, '..', 'electron', 'resources', filename)
}

function loadIcon(): Electron.NativeImage {
  try {
    const img = nativeImage.createFromPath(getResourcePath('icon.png'))
    return img.isEmpty() ? nativeImage.createEmpty() : img
  } catch {
    return nativeImage.createEmpty()
  }
}

// ─── Main window ──────────────────────────────────────────────────────────────

function createWindow(): void {
  const icon = loadIcon()

  mainWindow = new BrowserWindow({
    width: 1340,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Zenith',
    backgroundColor: '#08050f',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed so preload can use Node built-ins via ESM import
    },
    show: false, // show once ready-to-show fires
  })

  // Load the app
  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Show gracefully after paint
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      // Show tray tip on first minimize
      if (tray) {
        tray.setToolTip('Zenith is running in the background')
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── System tray ──────────────────────────────────────────────────────────────

function createTray(): void {
  const icon = loadIcon()
  const trayIcon = icon.isEmpty()
    ? nativeImage.createEmpty()
    : icon.resize({ width: 16, height: 16 })

  tray = new Tray(trayIcon)

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Zenith',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: `Version ${app.getVersion()}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(menu)
  tray.setToolTip('Zenith')

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

// ─── Auto updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: { version: string }) => {
    mainWindow?.webContents.send('update-available', info.version)
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded')

    // Native notification as well
    if (Notification.isSupported()) {
      new Notification({
        title: 'Zenith update ready',
        body: 'A new version has been downloaded. Restart to apply it.',
      }).show()
    }
  })

  autoUpdater.on('error', () => {
    // Silent — network issues or missing releases shouldn't interrupt the user
  })

  // Check on launch and every 2 hours
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }, 3000)

  setInterval(
    () => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    },
    2 * 60 * 60 * 1000,
  )
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true)
})

ipcMain.handle('open-external', (_event, url: unknown) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    void shell.openExternal(url)
  }
})

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('show-window', () => {
  mainWindow?.show()
  mainWindow?.focus()
})

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Remove default menu on Windows/Linux
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
  }

  createWindow()
  createTray()

  if (!isDev) {
    setupAutoUpdater()
  }

  app.on('activate', () => {
    // macOS: re-open window when clicking dock icon
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS keep the app running without windows
  if (process.platform !== 'darwin') {
    // Don't quit — stay in tray
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

// Security: restrict navigation to known origins
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const allowed = isDev
      ? ['http://localhost:5173']
      : ['file://']
    const url = new URL(navigationUrl)
    const isAllowed = allowed.some(
      (origin) => navigationUrl.startsWith(origin) || url.protocol === 'file:',
    )
    if (!isAllowed) {
      event.preventDefault()
    }
  })

  contents.setWindowOpenHandler(({ url }) => {
    // Open all external links in the system browser
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
})
