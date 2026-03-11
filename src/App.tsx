import './styles.css'
import { ChangeEvent, FormEvent, ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type AuthMode = 'login' | 'signup'
type ViewMode = 'auth' | 'launcher' | 'devices' | 'drive' | 'fidus' | 'photo-album' | 'hivemind' | 'storage' | 'engine' | 'wallet' | 'desktop' | 'settings' | 'admin' | 'theme'
type StatusKind = 'error' | 'success'
type DeviceStatus = 'Online' | 'Offline'
type DeviceType = 'Laptop' | 'Stationary' | 'Phone' | 'Other'
type DeviceRole = 'Main System' | 'Worker'
type ComputeProfile = 'Light Assist' | 'Balanced Worker' | 'Heavy AI Node'
type ChatRole = 'user' | 'fidus'

type AppTile = {
  id: string
  name: string
  description: string
  icon: ReactElement
  adminOnly?: boolean
}

type DeviceInfo = {
  id: string
  name: string
  type: DeviceType
  status: DeviceStatus
  role: DeviceRole
  computeProfile: ComputeProfile
  storageContributionGb: number
  appInstalled?: boolean
  // Electron heartbeat stats
  electronDeviceId?: string
  hostname?: string
  platform?: string
  cpuModel?: string
  cpuCores?: number
  cpuPercent?: number
  ramUsedGb?: number
  ramTotalGb?: number
  diskUsedGb?: number
  diskTotalGb?: number
  lastStatsAt?: number
}

type DriveNode = {
  id: string
  name: string
  kind: 'folder' | 'file'
  parentId: string | null
  isImage: boolean
  mimeType?: string | null
  sizeBytes?: number | null
  deviceId?: string
}

type DispatchAssignment = {
  deviceId: string
  deviceName: string
  sharePercent: number
  workUnits: number
}

type ChatMessage = {
  id: string
  role: ChatRole
  text: string
}

type FidusConversation = {
  id: string
  title: string
  messages: ChatMessage[]
}

type HiveAssignment = {
  deviceId: string
  deviceName: string
  sharePercent: number
  tokenReward: number
}

type WalletTransaction = {
  id: string
  direction: 'sent' | 'received'
  amount: number
  note: string | null
  createdAt: number
  counterpartName: string
}

type AppNotification = {
  id: string
  kind: string
  title: string
  body: string | null
  read: boolean
  created_at: number
}

type FidusMemory = { id: string; content: string; created_at: number }

type DashboardStats = {
  tokenBalance: number
  totalStorageGb: number
  usedStorageBytes: number
  fileCount: number
  onlineDevices: number
  totalDevices: number
  unreadNotifications: number
  recentConversations: Array<{ title: string; created_at: number }>
}

type ApiState = {
  devices: DeviceInfo[]
  driveNodes: DriveNode[]
  hiveContribution: Record<string, number>
  tokenBalance: number
}

type AuthResponse = {
  id: string
  name: string
  username: string
  email: string
  role: string
  token: string
}

type AdminStats = {
  totalUsers: number
  totalDevices: number
  onlineDevices: number
  totalFiles: number
  totalFolders: number
  totalConversations: number
  totalMessages: number
  totalStorageGb: number
  users: Array<{ id: string; name: string; email: string; role: string }>
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

const appTiles: AppTile[] = [
  {
    id: 'fidus',
    name: 'Fidus the Cat',
    description: 'AI companion chat UI for planning, drafting, and assistant workflows.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 8.5 4 4.5 3 10a7.4 7.4 0 0 0-1 3.8C2 18.3 6.1 22 12 22s10-3.7 10-8.2a7.4 7.4 0 0 0-1-3.8l-1-5.5-2.5 4a10.8 10.8 0 0 0-11 0ZM9 13a1.2 1.2 0 1 1 0-2.4A1.2 1.2 0 0 1 9 13Zm6 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4ZM8 16.5c1 .9 2.4 1.5 4 1.5s3-.6 4-1.5" />
      </svg>
    ),
  },
  {
    id: 'drive',
    name: 'Drive',
    description: 'Cloud folders and file management tools for your Zenith workspace.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 7.8A2.8 2.8 0 0 1 4.8 5H10l1.8 2.2H19A3 3 0 0 1 22 10v8.2a2.8 2.8 0 0 1-2.8 2.8H4.8A2.8 2.8 0 0 1 2 18.2V7.8Zm3 .2v10h14V10h-8.5L8.7 8H5Z" />
      </svg>
    ),
  },
  {
    id: 'photo-album',
    name: 'Photo Album',
    description: 'Photo and media browsing app powered by Drive image files.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v9.4l3.3-3.2 3.1 3 4.6-4.4L20 15.8V6H4Zm0 12h16v-.2l-5-5-4.6 4.4-3.1-3L4 17.4V18Zm4-7.6a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z" />
      </svg>
    ),
  },
  {
    id: 'engine-layout',
    name: 'Engine Layout',
    description: 'Choose an AI model and configure resource limits that power Fidus and HiveMind tasks.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 2h4v3.1a7.7 7.7 0 0 1 3 1.3l2.2-2.2 2.8 2.8-2.2 2.2a7.7 7.7 0 0 1 1.3 3H24v4h-3.1a7.7 7.7 0 0 1-1.3 3l2.2 2.2-2.8 2.8-2.2-2.2a7.7 7.7 0 0 1-3 1.3V24h-4v-3.1a7.7 7.7 0 0 1-3-1.3l-2.2 2.2-2.8-2.8 2.2-2.2a7.7 7.7 0 0 1-1.3-3H0v-4h3.1a7.7 7.7 0 0 1 1.3-3L2.2 4.2 5 1.4l2.2 2.2a7.7 7.7 0 0 1 3-1.3V2Zm2 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Z" />
      </svg>
    ),
  },
  {
    id: 'storage',
    name: 'Storage',
    description: 'View and manage storage contributed by each connected device in your network.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 4h18v5H3V4Zm0 7h18v9H3v-9Zm3 2v2h4v-2H6Zm0-7v1h12V6H6Z" />
      </svg>
    ),
  },
  {
    id: 'theme',
    name: 'Theme',
    description: 'UI look-and-feel controls. Current design is active for now.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2c5.5 0 10 3.8 10 8.5 0 4.5-3.8 8-8.7 8H10a2.5 2.5 0 0 0 0 5h3.6A10.4 10.4 0 0 1 2 13.2C2 7.2 6.5 2 12 2Zm-4 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm4-2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm4 2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      </svg>
    ),
  },
  {
    id: 'devices',
    name: 'Devices',
    description: 'Configure connected hardware and distributed resource allocation.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 5h13a2 2 0 0 1 2 2v8H1V7a2 2 0 0 1 2-2Zm0 10h15v2H3v-2Zm17-8h2a1 1 0 0 1 1 1v8h-3V7Zm-6 10h4v2h-4v-2Zm-9 0h4v2H5v-2Z" />
      </svg>
    ),
  },
  {
    id: 'hivemind',
    name: 'HiveMind',
    description: 'Split AI queries across connected users and reward shared compute with tokens.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a3 3 0 0 1 3 3v1.1a6.9 6.9 0 0 1 2.6 1.1l.8-.8a2.9 2.9 0 0 1 4.1 4.1l-.8.8a6.9 6.9 0 0 1 1.1 2.6H24a3 3 0 0 1 0 6h-1.1a6.9 6.9 0 0 1-1.1 2.6l.8.8a2.9 2.9 0 0 1-4.1 4.1l-.8-.8a6.9 6.9 0 0 1-2.6 1.1V29a3 3 0 0 1-6 0v-1.1a6.9 6.9 0 0 1-2.6-1.1l-.8.8a2.9 2.9 0 0 1-4.1-4.1l.8-.8A6.9 6.9 0 0 1 1.1 20H0a3 3 0 0 1 0-6h1.1a6.9 6.9 0 0 1 1.1-2.6l-.8-.8a2.9 2.9 0 0 1 4.1-4.1l.8.8A6.9 6.9 0 0 1 9 6.1V5a3 3 0 0 1 3-3Zm0 7a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z" />
      </svg>
    ),
  },
  {
    id: 'desktop',
    name: 'Desktop App',
    description: 'Download the native Zenith desktop app for Windows, macOS, and Linux.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v11h16V5H4Zm3 13h10v2H7v-2Zm5-10v4.6l1.8-1.8 1.4 1.4L12 16l-3.2-3.8 1.4-1.4L12 12.6V8h2Z" />
      </svg>
    ),
  },
  {
    id: 'wallet',
    name: 'Wallet',
    description: 'View your token balance, send tokens to other Zenith users, and check transaction history.',

    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7Zm3-1a1 1 0 0 0-1 1v1h16V7a1 1 0 0 0-1-1H5Zm-1 4v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6H4Zm11 2h3v2h-3v-2Z" />
      </svg>
    ),
  },
  {
    id: 'settings',
    name: 'Account Settings',
    description: 'Change your display name, email address, and password.',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 9c4.4 0 8 1.8 8 4v2H4v-2c0-2.2 3.6-4 8-4Z" />
      </svg>
    ),
  },
  {
    id: 'admin',
    name: 'Admin Panel',
    description: 'Platform-wide statistics, user management, and beta app access. Administrators only.',
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5l-9-4Zm0 4.6 5 2.2V11c0 3.4-2.4 6.7-5 7.9C9.4 17.7 7 14.4 7 11V7.8l5-2.2Z" />
      </svg>
    ),
  },
]

const starterDevices: DeviceInfo[] = [
  {
    id: 'computer-1',
    name: 'Computer 1',
    type: 'Stationary',
    status: 'Online',
    role: 'Main System',
    computeProfile: 'Heavy AI Node',
    storageContributionGb: 500,
    appInstalled: true,
  },
  {
    id: 'laptop',
    name: 'Laptop',
    type: 'Laptop',
    status: 'Online',
    role: 'Worker',
    computeProfile: 'Balanced Worker',
    storageContributionGb: 160,
    appInstalled: true,
  },
  {
    id: 'phone',
    name: 'Phone',
    type: 'Phone',
    status: 'Offline',
    role: 'Worker',
    computeProfile: 'Light Assist',
    storageContributionGb: 32,
    appInstalled: true,
  },
]

const starterDriveNodes: DriveNode[] = [
  { id: 'folder-conversations', name: 'Fidus Conversations', kind: 'folder', parentId: null, isImage: false, deviceId: 'computer-1' },
  { id: 'folder-photos', name: 'Photo Album', kind: 'folder', parentId: null, isImage: false, deviceId: 'computer-1' },
  { id: 'folder-shared', name: 'Shared Workspace', kind: 'folder', parentId: null, isImage: false, deviceId: 'computer-1' },
]

function App() {
  const [authToken, setAuthToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('zenith_auth_token') ?? '' : '',
  )
  const [view, setView] = useState<ViewMode>('auth')
  const [mode, setMode] = useState<AuthMode>('login')
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('')
  const [status, setStatus] = useState('')
  const [statusKind, setStatusKind] = useState<StatusKind>('error')
  const [tokenBalance, setTokenBalance] = useState(0)
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([])
  const [walletRecipientUsername, setWalletRecipientUsername] = useState('')
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null)
  const [desktopReleasesUrl, setDesktopReleasesUrl] = useState('https://github.com/ZenithObscure/Zenith-app-server/releases')
  const [desktopAssetBaseUrl, setDesktopAssetBaseUrl] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>(() => localStorage.getItem('zenith_user_role') ?? 'user')
  const [userId, setUserId] = useState<string>('')
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('zenith_theme') as 'dark' | 'light') ?? 'dark',
  )
  const [themeAccent, setThemeAccent] = useState<string>(() =>
    localStorage.getItem('zenith_accent') ?? 'pink',
  )
  const [walletAmount, setWalletAmount] = useState('')
  const [walletNote, setWalletNote] = useState('')
  const [walletSending, setWalletSending] = useState(false)
  const [accountName, setAccountName] = useState('Zenith User')
  const [accountEmail, setAccountEmail] = useState('not-set@zenith-app.net')
  const [devices, setDevices] = useState<DeviceInfo[]>(starterDevices)
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false)
  const [newDeviceName, setNewDeviceName] = useState('')
  const [newDeviceType, setNewDeviceType] = useState<DeviceType>('Laptop')
  const [newDeviceRole, setNewDeviceRole] = useState<DeviceRole>('Worker')
  const [newDeviceComputeProfile, setNewDeviceComputeProfile] = useState<ComputeProfile>('Balanced Worker')
  const [newDeviceStorageGb, setNewDeviceStorageGb] = useState(120)
  const [dispatchQuery, setDispatchQuery] = useState('Summarize this week project updates and prioritize next AI tasks.')
  const [dispatchAssignments, setDispatchAssignments] = useState<DispatchAssignment[]>([])
  const [driveNodes, setDriveNodes] = useState<DriveNode[]>(starterDriveNodes)
  const [driveTargetFolderId, setDriveTargetFolderId] = useState<string>('root')
  const [newFolderName, setNewFolderName] = useState('')
  const [newFileName, setNewFileName] = useState('')
  const [fidusInput, setFidusInput] = useState('')
  const [fidusSearchQuery, setFidusSearchQuery] = useState('')
  const [fidusConversations, setFidusConversations] = useState<FidusConversation[]>([])
  const [activeFidusConvId, setActiveFidusConvId] = useState<string>('conv-init')
  const [selectedMockPhotoId, setSelectedMockPhotoId] = useState<string | null>(null)
  const [hiveMindEnabled, setHiveMindEnabled] = useState(false)
  const [hiveContribution, setHiveContribution] = useState<Record<string, number>>(
    Object.fromEntries(starterDevices.map((device) => [device.id, 0])),
  )
  const [hiveQuery, setHiveQuery] = useState('Generate a deployment plan and split subtasks for parallel processing.')
  const [hiveAssignments, setHiveAssignments] = useState<HiveAssignment[]>([])
  const [hiveAnswer, setHiveAnswer] = useState('')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notifUnreadCount, setNotifUnreadCount] = useState(0)
  const [notifPanelOpen, setNotifPanelOpen] = useState(false)
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [drivePreviewNode, setDrivePreviewNode] = useState<DriveNode | null>(null)
  const [fidusMemories, setFidusMemories] = useState<FidusMemory[]>([])
  const [newMemoryInput, setNewMemoryInput] = useState('')
  const [settingsName, setSettingsName] = useState('')
  const [settingsEmail, setSettingsEmail] = useState('')
  const [settingsCurrentPw, setSettingsCurrentPw] = useState('')
  const [settingsNewPw, setSettingsNewPw] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState('')
  const [settingsMsgKind, setSettingsMsgKind] = useState<StatusKind>('success')
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const fidusThreadRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (view !== 'fidus') return
    const el = fidusThreadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [fidusConversations, view])

  // Apply theme mode and accent color to the document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode)
    document.documentElement.setAttribute('data-accent', themeAccent)
    localStorage.setItem('zenith_theme', themeMode)
    localStorage.setItem('zenith_accent', themeAccent)
  }, [themeMode, themeAccent])

  // Electron auto-update listeners
  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.onUpdateAvailable((version) => setUpdateVersion(version))
    window.electronAPI.onUpdateDownloaded(() => setUpdateDownloaded(true))
    return () => window.electronAPI?.removeAllListeners()
  }, [])

  // Local model status — check on mount, decompress proactively once auth is ready
  useEffect(() => {
    if (!window.electronAPI) return

    const cleanupProgress = window.electronAPI.onFidusModelProgress((p) => {
      setFidusModelPct(p.progress)
      setFidusModelMsg(p.message)
      if (p.phase === 'done') {
        setFidusLocalModel('ready')
      } else if (p.phase === 'loading') {
        setFidusLocalModel('loading')
      } else {
        setFidusLocalModel('extracting')
      }
    })

    window.electronAPI.fidusGetModelStatus().then((status) => {
      if (status.isModelUnpacked) {
        setFidusLocalModel('ready')
      } else if (status.isModelBundled) {
        // Start decompression now so it's ready before the user opens Fidus
        setFidusLocalModel('extracting')
        window.electronAPI!.fidusInit().catch(() => {
          setFidusLocalModel('missing')
        })
      } else {
        setFidusLocalModel('missing')
      }
    })

    return cleanupProgress
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Electron device heartbeat — register once then ping every 30 s with live stats
  useEffect(() => {
    if (!window.electronAPI || !authToken) return

    let deviceId = heartbeatDeviceId
    let stopped = false

    const sendHeartbeat = async () => {
      if (stopped) return
      try {
        const stats = await window.electronAPI!.getSystemStats()

        // Register this machine once per session
        if (!deviceId) {
          const regRes = await apiFetch('/api/devices/register-electron', {
            method: 'POST',
            body: JSON.stringify({
              electronDeviceId: stats.deviceId,
              hostname: stats.hostname,
              platform: stats.platform,
              cpuModel: stats.cpuModel,
              cpuCores: stats.cpuCores,
              storageContributionGb: Math.round(stats.diskTotalGb),
            }),
          })
          if (regRes.ok) {
            const data = (await regRes.json()) as { deviceId: string; created: boolean }
            deviceId = data.deviceId
            setHeartbeatDeviceId(deviceId)
            localStorage.setItem('zenith_electron_device_id', deviceId)
            if (data.created) {
              // Refresh device list so the new device appears
              loadApiState().catch(() => {})
            }
          }
        }

        if (!deviceId || stopped) return

        await apiFetch(`/api/devices/${deviceId}/ping`, {
          method: 'POST',
          body: JSON.stringify({
            electronDeviceId: stats.deviceId,
            hostname: stats.hostname,
            platform: stats.platform,
            cpuModel: stats.cpuModel,
            cpuCores: stats.cpuCores,
            cpuPercent: stats.cpuPercent,
            ramUsedGb: stats.ramUsedGb,
            ramTotalGb: stats.ramTotalGb,
            diskUsedGb: stats.diskUsedGb,
            diskTotalGb: stats.diskTotalGb,
          }),
        })

        // Update local device stats in-place
        setDevices((prev) =>
          prev.map((d) =>
            d.id === deviceId
              ? {
                  ...d,
                  status: 'Online' as DeviceStatus,
                  cpuPercent: stats.cpuPercent,
                  ramUsedGb: stats.ramUsedGb,
                  ramTotalGb: stats.ramTotalGb,
                  diskUsedGb: stats.diskUsedGb,
                  diskTotalGb: stats.diskTotalGb,
                  hostname: stats.hostname,
                  lastStatsAt: Date.now(),
                }
              : d,
          ),
        )
      } catch { /* silent — heartbeat failures shouldn't disrupt the UI */ }
    }

    // Send immediately, then every 30 s
    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 30_000)
    return () => {
      stopped = true
      clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])
  const [selectedEngineModel, setSelectedEngineModel] = useState<string>('standard')
  const [engineResourcePercent, setEngineResourcePercent] = useState(50)
  const [hiveSettingsLocked, setHiveSettingsLocked] = useState(false)
  const [driveFileMenuId, setDriveFileMenuId] = useState<string | null>(null)
  const [fidusStreaming, setFidusStreaming] = useState(false)
  const [fidusLocalModel, setFidusLocalModel] = useState<
    'unknown' | 'missing' | 'extracting' | 'loading' | 'ready'
  >('unknown')
  const [fidusModelPct, setFidusModelPct] = useState(0)
  const [fidusModelMsg, setFidusModelMsg] = useState('')
  const [heartbeatDeviceId, setHeartbeatDeviceId] = useState<string | null>(() =>
    localStorage.getItem('zenith_electron_device_id'),
  )

  const isWebRuntime = useMemo(() => !window.electronAPI?.isElectron, [])
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)

  const isEmailValid = (email: string) => /\S+@\S+\.\S+/.test(email)

  const helperText = useMemo(
    () =>
      mode === 'login'
        ? 'Welcome back. Sign in to continue building your Zenith workspace.'
        : 'Create your account to get started on Zenith-app.net.',
    [mode],
  )

  const mainSystemDevice = useMemo(
    () => devices.find((device) => device.role === 'Main System') ?? null,
    [devices],
  )

  const totalStorageGb = useMemo(
    () => devices.reduce((sum, device) => sum + device.storageContributionGb, 0),
    [devices],
  )

  const onlineDeviceCount = useMemo(
    () => devices.filter((device) => device.status === 'Online').length,
    [devices],
  )

  const folderOptions = useMemo(
    () => driveNodes.filter((node) => node.kind === 'folder'),
    [driveNodes],
  )

  const hiveResourcesConfigured = useMemo(
    () => Object.values(hiveContribution).some((value) => value > 0),
    [hiveContribution],
  )

  const hiveTotalContribution = useMemo(
    () => Object.values(hiveContribution).reduce((sum, value) => sum + value, 0),
    [hiveContribution],
  )

  const applyApiState = (state: ApiState) => {
    setDevices((prev) => {
      const prevMap = Object.fromEntries(prev.map((d) => [d.id, d]))
      return state.devices.map((d) => ({
        ...d,
        appInstalled: d.appInstalled ?? prevMap[d.id]?.appInstalled ?? false,
      }))
    })
    setDriveNodes(state.driveNodes)
    setHiveContribution(state.hiveContribution)
    setTokenBalance(state.tokenBalance)
  }

  const persistAuthSession = (payload: AuthResponse) => {
    const displayName = payload.username || payload.name
    setAccountName(displayName)
    setAccountEmail(payload.email)
    setSettingsName(displayName)
    setSettingsEmail(payload.email)
    setAuthToken(payload.token)
    setUserId(payload.id)
    setUserRole(payload.role ?? 'user')
    localStorage.setItem('zenith_auth_token', payload.token)
    localStorage.setItem('zenith_user_role', payload.role ?? 'user')
  }

  const apiFetch = useCallback(async (path: string, init: RequestInit = {}, tokenOverride?: string) => {
    const headers = new Headers(init.headers)

    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const token = tokenOverride ?? authToken
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    })
  }, [authToken])

  const loadApiState = useCallback(async (tokenOverride?: string) => {
    const response = await apiFetch('/api/state', {}, tokenOverride)
    if (!response.ok) {
      throw new Error('Failed to load backend state')
    }

    const payload = (await response.json()) as ApiState
    applyApiState(payload)
  }, [apiFetch])

  const loadFidusConversations = useCallback(async (tokenOverride?: string) => {
    const res = await apiFetch('/api/conversations', {}, tokenOverride)
    if (!res.ok) return
    const data = (await res.json()) as { conversations: FidusConversation[] }
    setFidusConversations(data.conversations)
    setActiveFidusConvId((prev) => {
      const exists = data.conversations.some((c) => c.id === prev)
      return exists ? prev : (data.conversations[0]?.id ?? prev)
    })
  }, [apiFetch])

  const loadWallet = useCallback(async (tokenOverride?: string) => {
    const res = await apiFetch('/api/wallet', {}, tokenOverride)
    if (!res.ok) return
    const data = (await res.json()) as { balance: number; transactions: WalletTransaction[] }
    setTokenBalance(data.balance)
    setWalletTransactions(data.transactions)
  }, [apiFetch])

  const loadNotifications = useCallback(async (tokenOverride?: string) => {
    const res = await apiFetch('/api/notifications', {}, tokenOverride)
    if (!res.ok) return
    const data = (await res.json()) as { notifications: AppNotification[]; unreadCount: number }
    setNotifications(data.notifications)
    setNotifUnreadCount(data.unreadCount)
  }, [apiFetch])

  const loadDashboard = useCallback(async (tokenOverride?: string) => {
    const res = await apiFetch('/api/dashboard', {}, tokenOverride)
    if (!res.ok) return
    const data = (await res.json()) as DashboardStats
    setDashboardStats(data)
  }, [apiFetch])

  const loadFidusMemories = useCallback(async (tokenOverride?: string) => {
    const res = await apiFetch('/api/fidus/memories', {}, tokenOverride)
    if (!res.ok) return
    const data = (await res.json()) as { memories: FidusMemory[] }
    setFidusMemories(data.memories)
  }, [apiFetch])

  const loadAdminStats = useCallback(async () => {
    const res = await apiFetch('/api/admin/stats')
    if (!res.ok) return
    const data = (await res.json()) as AdminStats
    setAdminStats(data)
  }, [apiFetch])

  useEffect(() => {
    if (!authToken) {
      return
    }

    Promise.all([loadApiState(), loadFidusConversations(), loadWallet(), loadNotifications(), loadDashboard(), loadFidusMemories()])
      .then(() => {
        setView('launcher')
      })
      .catch(() => {
        setAuthToken('')
        localStorage.removeItem('zenith_auth_token')
        setStatusKind('error')
        setStatus('Session restore failed. Please log in again and ensure backend API is running.')
      })
  }, [authToken, loadApiState, loadFidusConversations, loadWallet, loadNotifications, loadDashboard, loadFidusMemories])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (loginUsername.trim().length < 2) {
      setStatusKind('error')
      setStatus('Please enter your username.')
      return
    }

    if (loginPassword.length < 8) {
      setStatusKind('error')
      setStatus('Password must be at least 8 characters long.')
      return
    }

    let response: Response
    try {
      response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      })
    } catch {
      setStatusKind('error')
      setStatus('Unable to reach the server. Check your connection and try again.')
      return
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; message?: string } | null
      setStatusKind('error')
      if (body?.error === 'no_account') {
        setStatus(body.message ?? 'No account found with that username.')
      } else if (body?.error === 'wrong_password') {
        setStatus(body.message ?? 'Incorrect password.')
      } else if (body?.error === 'rate_limited') {
        setStatus(body.message ?? 'Too many attempts. Please wait before trying again.')
      } else {
        setStatus(body?.message ?? 'Login failed. Please check your credentials.')
      }
      return
    }

    const payload = (await response.json()) as AuthResponse
    persistAuthSession(payload)
    try {
      await Promise.all([loadApiState(payload.token), loadFidusConversations(payload.token), loadWallet(payload.token), loadNotifications(payload.token), loadDashboard(payload.token), loadFidusMemories(payload.token)])
    } catch {
      // State will load on next render via useEffect
    }
    setStatusKind('success')
    setStatus('Welcome back. Opening your Zenith app launcher...')
    setView('launcher')
  }

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (signupUsername.trim().length < 2) {
      setStatusKind('error')
      setStatus('Please enter a username with at least 2 characters.')
      return
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(signupUsername.trim())) {
      setStatusKind('error')
      setStatus('Username can only contain letters, numbers, underscores, and hyphens.')
      return
    }

    if (!isEmailValid(signupEmail)) {
      setStatusKind('error')
      setStatus('Please enter a valid email address for sign up.')
      return
    }

    if (signupPassword.length < 8) {
      setStatusKind('error')
      setStatus('Create a password with at least 8 characters.')
      return
    }

    if (signupPassword !== signupConfirmPassword) {
      setStatusKind('error')
      setStatus('Passwords do not match. Please try again.')
      return
    }

    let response: Response
    try {
      response = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: signupUsername.trim(),
          email: signupEmail,
          password: signupPassword,
        }),
      })
    } catch {
      setStatusKind('error')
      setStatus('Unable to reach the server. Check your connection and try again.')
      return
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string; message?: string } | null
      setStatusKind('error')
      if (body?.error === 'email_taken') {
        setStatus(body.message ?? 'An account with this email already exists.')
      } else if (body?.error === 'username_taken') {
        setStatus(body.message ?? 'That username is already taken. Please choose another.')
      } else if (body?.error === 'rate_limited') {
        setStatus(body.message ?? 'Too many attempts. Please wait before trying again.')
      } else {
        setStatus(body?.message ?? 'Signup failed. Please try again.')
      }
      return
    }

    const payload = (await response.json()) as AuthResponse
    persistAuthSession(payload)
    try {
      await Promise.all([loadApiState(payload.token), loadFidusConversations(payload.token), loadWallet(payload.token), loadNotifications(payload.token), loadDashboard(payload.token), loadFidusMemories(payload.token)])
    } catch {
      // State will load on next render via useEffect
    }
    setStatusKind('success')
    setStatus('Account created. Opening your Zenith app launcher...')
    setView('launcher')
  }

  const resetAddDeviceForm = () => {
    setNewDeviceName('')
    setNewDeviceType('Laptop')
    setNewDeviceRole('Worker')
    setNewDeviceComputeProfile('Balanced Worker')
    setNewDeviceStorageGb(120)
  }

  const handleAddDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const generatedName = `${newDeviceType} ${devices.length + 1}`
    const nextName = newDeviceName.trim() || generatedName

    if (newDeviceStorageGb < 0) {
      setStatusKind('error')
      setStatus('Storage contribution cannot be negative.')
      return
    }

    const response = await apiFetch('/api/devices', {
      method: 'POST',
      body: JSON.stringify({
        name: nextName,
        type: newDeviceType,
        status: 'Online',
        role: newDeviceRole,
        computeProfile: newDeviceComputeProfile,
        storageContributionGb: newDeviceStorageGb,
      }),
    })

    if (!response.ok) {
      setStatusKind('error')
      setStatus('Failed to add device via backend API.')
      return
    }

    await loadApiState()

    setStatusKind('success')
    setStatus(`${nextName} added. Resource allocation is now part of your shared system pool.`)
    setShowAddDeviceModal(false)
    resetAddDeviceForm()
  }

  const getProfileWeight = (profile: ComputeProfile) => {
    if (profile === 'Heavy AI Node') {
      return 4
    }

    if (profile === 'Balanced Worker') {
      return 2
    }

    return 1
  }

  const handleSimulateDispatch = () => {
    const onlineDevices = devices.filter((device) => device.status === 'Online')

    if (!dispatchQuery.trim()) {
      setStatusKind('error')
      setStatus('Please add a query before running dispatch simulation.')
      return
    }

    if (!onlineDevices.length) {
      setStatusKind('error')
      setStatus('No online devices available for distributed execution.')
      return
    }

    const totalWeight = onlineDevices.reduce((sum, device) => sum + getProfileWeight(device.computeProfile), 0)

    const nextAssignments = onlineDevices.map((device) => {
      const share = (getProfileWeight(device.computeProfile) / totalWeight) * 100
      const units = Math.max(1, Math.round(share))

      return {
        deviceId: device.id,
        deviceName: device.name,
        sharePercent: Number(share.toFixed(1)),
        workUnits: units,
      }
    })

    setDispatchAssignments(nextAssignments)
    setTokenBalance((prev) => Number((prev + onlineDevices.length * 0.2).toFixed(2)))
    setStatusKind('success')
    setStatus('Dispatch simulation complete. Main System coordinates and workers process their shares. +Token rewards applied.')
  }

  const handleRunHiveMind = async () => {
    const activeDevices = devices
      .filter((device) => device.status === 'Online')
      .map((device) => ({
        ...device,
        contribution: hiveContribution[device.id] ?? 0,
      }))
      .filter((device) => device.contribution > 0)

    if (!hiveQuery.trim()) {
      setStatusKind('error')
      setStatus('Please add a query before running HiveMind distribution.')
      return
    }

    if (!activeDevices.length) {
      setStatusKind('error')
      setStatus('No online devices with HiveMind resources available.')
      return
    }

    const response = await apiFetch('/api/hivemind/dispatch', {
      method: 'POST',
      body: JSON.stringify({ query: hiveQuery, contribution: hiveContribution }),
    })

    if (!response.ok) {
      setStatusKind('error')
      setStatus('HiveMind dispatch failed. Verify configured contributions and online devices.')
      return
    }

    const payload = (await response.json()) as {
      assignments: HiveAssignment[]
      totalReward: number
      tokenBalance: number
      answer?: string
    }

    setHiveAssignments(payload.assignments)
    setHiveAnswer(payload.answer ?? '')
    setTokenBalance(payload.tokenBalance)
    setStatusKind('success')
    setStatus(
      `HiveMind distributed query across ${payload.assignments.length} devices. +${payload.totalReward.toFixed(2)} tokens earned.`,
    )
  }

  const handleHiveContributionChange = (deviceId: string, value: number) => {
    const bounded = Math.max(0, Math.min(100, value))
    setHiveContribution((prev) => ({ ...prev, [deviceId]: bounded }))
  }

  const handleToggleHiveMind = () => {
    if (!hiveMindEnabled && !hiveResourcesConfigured) {
      setStatusKind('error')
      setStatus('Set at least one HiveMind resource contribution in the HiveMind app before enabling it.')
      return
    }

    setHiveMindEnabled((prev) => !prev)
    setStatusKind('success')
    setStatus(!hiveMindEnabled ? 'HiveMind enabled.' : 'HiveMind disabled.')
  }

  const handleLogout = () => {
    setAuthToken('')
    localStorage.removeItem('zenith_auth_token')
    localStorage.removeItem('zenith_user_role')
    setAccountName('Zenith User')
    setAccountEmail('not-set@zenith-app.net')
    setUserRole('user')
    setUserId('')
    setAdminStats(null)
    setNotifications([])
    setNotifUnreadCount(0)
    setNotifPanelOpen(false)
    setDashboardStats(null)
    setFidusMemories([])
    setView('auth')
    setMode('login')
    setLoginUsername('')
    setLoginPassword('')
    setStatusKind('success')
    setStatus('Logged out. See you soon!')
  }

  const addDriveNode = async (kind: 'folder' | 'file') => {
    const rawName = kind === 'folder' ? newFolderName : newFileName
    const name = rawName.trim()

    if (!name) {
      setStatusKind('error')
      setStatus(`Please provide a ${kind} name before creating it.`)
      return
    }

    const parentId = driveTargetFolderId === 'root' ? null : driveTargetFolderId

    const siblingExists = driveNodes.some(
      (node) => node.parentId === parentId && node.name.toLowerCase() === name.toLowerCase(),
    )

    if (siblingExists) {
      setStatusKind('error')
      setStatus(`A ${kind} with this name already exists in the selected location.`)
      return
    }

    const lowerName = name.toLowerCase()
    const imagePattern = /\.(png|jpe?g|gif|webp|bmp)$/i

    const response = await apiFetch('/api/drive', {
      method: 'POST',
      body: JSON.stringify({
        name,
        kind,
        parentId,
        isImage: kind === 'file' && imagePattern.test(lowerName),
      }),
    })

    if (!response.ok) {
      setStatusKind('error')
      setStatus(`Failed to create ${kind} in backend.`)
      return
    }

    await loadApiState()
    setStatusKind('success')
    setStatus(`${kind === 'folder' ? 'Folder' : 'File'} created in Drive.`)

    if (kind === 'folder') {
      setNewFolderName('')
    } else {
      setNewFileName('')
    }
  }

  const handleDeleteNode = async (node: DriveNode) => {
    const response = await apiFetch(`/api/drive/${node.id}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      setStatusKind('error')
      setStatus('Failed to delete Drive item from backend.')
      return
    }

    await loadApiState()
    setStatusKind('success')
    setStatus(`${node.name} deleted from Drive.`)
  }

  const handleRenameNode = async (node: DriveNode) => {
    const nextName = window.prompt(`Rename ${node.kind}:`, node.name)?.trim()

    if (!nextName || nextName === node.name) {
      return
    }

    const siblingExists = driveNodes.some(
      (item) =>
        item.id !== node.id &&
        item.parentId === node.parentId &&
        item.name.toLowerCase() === nextName.toLowerCase(),
    )

    if (siblingExists) {
      setStatusKind('error')
      setStatus('Another item with this name already exists in the same folder.')
      return
    }

    const lowerName = nextName.toLowerCase()
    const imagePattern = /\.(png|jpe?g|gif|webp|bmp)$/i
    const response = await apiFetch(`/api/drive/${node.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: nextName,
        isImage: node.kind === 'file' ? imagePattern.test(lowerName) : false,
      }),
    })

    if (!response.ok) {
      setStatusKind('error')
      setStatus('Failed to rename Drive item in backend.')
      return
    }

    await loadApiState()
    setStatusKind('success')
    setStatus(`${node.kind === 'folder' ? 'Folder' : 'File'} renamed successfully.`)
  }

  const handleUploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const parentId = driveTargetFolderId === 'root' ? null : driveTargetFolderId
    const formData = new FormData()
    for (const file of Array.from(files)) {
      formData.append('files', file)
    }
    if (parentId) formData.append('parentId', parentId)
    else formData.append('parentId', 'null')

    const response = await fetch(`${API_BASE}/api/drive/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    })

    if (!response.ok) {
      setStatusKind('error')
      setStatus('Upload failed. Please try again.')
      event.target.value = ''
      return
    }

    await loadApiState()
    setStatusKind('success')
    setStatus(`${files.length} file(s) uploaded to Drive.`)
    event.target.value = ''
  }

  const handleSendFidusMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextText = fidusInput.trim()
    if (!nextText || fidusStreaming) return

    const userMsgId = `user-${Date.now()}`
    const fidusMsgId = `fidus-${Date.now() + 1}`
    const userMessage: ChatMessage = { id: userMsgId, role: 'user', text: nextText }

    const activeConv = fidusConversations.find((c) => c.id === activeFidusConvId)
    const history = (activeConv?.messages ?? []).map((m) => ({ role: m.role, text: m.text }))

    // Optimistically add user message + empty fidus placeholder
    setFidusConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeFidusConvId
          ? {
              ...conv,
              messages: [
                ...conv.messages,
                userMessage,
                { id: fidusMsgId, role: 'fidus' as const, text: '' },
              ],
              title: conv.title === 'New Chat' ? nextText.slice(0, 30).trim() : conv.title,
            }
          : conv,
      ),
    )
    setFidusInput('')
    setFidusStreaming(true)

    let fullText = ''

    // ── Electron: stream from local model ─────────────────────────────────────
    if (window.electronAPI && fidusLocalModel === 'ready') {
      const convId = activeFidusConvId  // capture before async work

      await new Promise<void>((resolve) => {
        const cleanup = window.electronAPI!.onFidusToken(({ convId: tokenConvId, chunk, done, fullText: ft, error }) => {
          if (tokenConvId !== convId) return

          if (error) {
            fullText = 'Sorry, the local AI had an error. Please try again.'
            setFidusConversations((prev) =>
              prev.map((conv) =>
                conv.id === convId
                  ? { ...conv, messages: conv.messages.map((m) => m.id === fidusMsgId ? { ...m, text: fullText } : m) }
                  : conv,
              ),
            )
            cleanup()
            setFidusStreaming(false)
            resolve()
            return
          }

          if (!done) {
            fullText += chunk
            const snapshot = fullText
            setFidusConversations((prev) =>
              prev.map((conv) =>
                conv.id === convId
                  ? { ...conv, messages: conv.messages.map((m) => m.id === fidusMsgId ? { ...m, text: snapshot } : m) }
                  : conv,
              ),
            )
          } else {
            fullText = ft ?? fullText
            cleanup()
            setFidusStreaming(false)
            resolve()
          }
        })

        // Kick off inference — tokens arrive via IPC push events above
        window.electronAPI!
          .fidusChat(convId, [...history, { role: 'user', text: nextText }])
          .catch((err: unknown) => {
            cleanup()
            fullText = `Sorry — ${String(err)}`
            setFidusConversations((prev) =>
              prev.map((conv) =>
                conv.id === convId
                  ? { ...conv, messages: conv.messages.map((m) => m.id === fidusMsgId ? { ...m, text: fullText } : m) }
                  : conv,
              ),
            )
            setFidusStreaming(false)
            resolve()
          })
      })

      apiFetch(`/api/conversations/${activeFidusConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          messages: [userMessage, { id: fidusMsgId, role: 'fidus', text: fullText }],
        }),
      }).catch(() => {})
      return
    }

    // ── Web (or model not yet ready): stream from backend API ─────────────────
    try {
      const res = await fetch(`${API_BASE}/api/fidus/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          conversationId: activeFidusConvId,
          messages: [...history, { role: 'user', text: nextText }],
        }),
      })

      if (!res.ok || !res.body) throw new Error('Stream unavailable')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6)) as {
              chunk?: string; done?: boolean; fullText?: string
            }
            if (payload.done) {
              fullText = payload.fullText ?? fullText
            } else if (payload.chunk) {
              fullText += payload.chunk
              const snapshot = fullText
              setFidusConversations((prev) =>
                prev.map((conv) =>
                  conv.id === activeFidusConvId
                    ? {
                        ...conv,
                        messages: conv.messages.map((m) =>
                          m.id === fidusMsgId ? { ...m, text: snapshot } : m,
                        ),
                      }
                    : conv,
                ),
              )
            }
          } catch { /* ignore malformed SSE line */ }
        }
      }
    } catch {
      fullText = 'Sorry, I had trouble connecting. Please try again.'
      setFidusConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeFidusConvId
            ? {
                ...conv,
                messages: conv.messages.map((m) =>
                  m.id === fidusMsgId ? { ...m, text: fullText } : m,
                ),
              }
            : conv,
        ),
      )
    } finally {
      setFidusStreaming(false)
    }

    apiFetch(`/api/conversations/${activeFidusConvId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [userMessage, { id: fidusMsgId, role: 'fidus', text: fullText }],
      }),
    }).catch(() => {})
  }

  const handleOpenDesktopView = () => {
    apiFetch('/api/updates/latest', {}).then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { latestVersion: string; releasesUrl: string; assetBaseUrl?: string }
        setDesktopVersion(data.latestVersion)
        setDesktopReleasesUrl(data.releasesUrl)
        if (data.assetBaseUrl) setDesktopAssetBaseUrl(data.assetBaseUrl)
      }
    }).catch(() => {})
    setStatus('')
    setView('desktop')
  }

  const renderMarkdown = (text: string): ReactElement => {
    // Split into code-block and normal segments
    const segments: Array<{ type: 'code'; lang: string; content: string } | { type: 'text'; content: string }> = []
    const codeBlockRe = /```(\w*)\n?([\s\S]*?)```/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = codeBlockRe.exec(text)) !== null) {
      if (match.index > lastIndex) segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
      segments.push({ type: 'code', lang: match[1] ?? '', content: match[2] ?? '' })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) segments.push({ type: 'text', content: text.slice(lastIndex) })

    const renderInline = (s: string): Array<ReactElement | string> => {
      // Bold: **text** or __text__
      const parts = s.split(/(\*\*[\s\S]+?\*\*|__[\s\S]+?__)/g)
      return parts.map((part, i) => {
        if (/^(\*\*|__)/.test(part) && /(\*\*|__)$/.test(part)) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        // Inline code: `code`
        const codeParts = part.split(/(`[^`]+`)/g)
        if (codeParts.length > 1) {
          return (
            <span key={i}>
              {codeParts.map((cp, j) =>
                cp.startsWith('`') && cp.endsWith('`')
                  ? <code key={j} className="fidus-inline-code">{cp.slice(1, -1)}</code>
                  : cp,
              )}
            </span>
          )
        }
        return part
      })
    }

    const renderTextSegment = (text: string, segIdx: number): ReactElement => {
      const lines = text.split('\n')
      const nodes: ReactElement[] = []
      let i = 0
      while (i < lines.length) {
        const line = lines[i]!
        if (/^(\s*[-*+]|\s*\d+\.) /.test(line)) {
          // Collect list items
          const listItems: string[] = []
          while (i < lines.length && /^(\s*[-*+]|\s*\d+\.) /.test(lines[i]!)) {
            listItems.push(lines[i]!.replace(/^(\s*[-*+]|\s*\d+\.) /, ''))
            i++
          }
          nodes.push(
            <ul key={`${segIdx}-ul-${nodes.length}`} className="fidus-md-list">
              {listItems.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
            </ul>,
          )
        } else if (line.trim() === '') {
          i++
        } else {
          nodes.push(<p key={`${segIdx}-p-${nodes.length}`}>{renderInline(line)}</p>)
          i++
        }
      }
      return <>{nodes}</>
    }

    return (
      <>
        {segments.map((seg, idx) =>
          seg.type === 'code'
            ? <pre key={idx} className="fidus-code-block"><code className={seg.lang ? `language-${seg.lang}` : ''}>{seg.content.trimEnd()}</code></pre>
            : <span key={idx}>{renderTextSegment(seg.content, idx)}</span>,
        )}
      </>
    )
  }

  const renderDriveTree = (parentId: string | null, depth = 0): ReactElement[] => {
    const children = driveNodes
      .filter((node) => node.parentId === parentId)
      .sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'folder' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

    return children.flatMap((node) => {
      const nodeDevice = node.deviceId ? devices.find((d) => d.id === node.deviceId) ?? null : null
      const menuOpen = driveFileMenuId === node.id
      const storageDevices = devices.filter((d) => d.storageContributionGb > 0)

      const row = (
        <li key={node.id} className="tree-row" style={{ paddingLeft: `${depth * 16}px` }}>
          <span className="tree-kind">{node.kind === 'folder' ? 'Folder' : 'File'}</span>
          <span className="tree-name-wrap">
            {node.name}
            {node.sizeBytes != null && node.kind === 'file' && (
              <em className="drive-file-size">{node.sizeBytes < 1024 * 1024
                ? `${(node.sizeBytes / 1024).toFixed(1)} KB`
                : `${(node.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}</em>
            )}
            {node.isImage && <span className="album-tag">Photo Album</span>}
            {nodeDevice && <em className="drive-device-label">on {nodeDevice.name}</em>}
          </span>
          <span className="tree-actions">
            {node.kind === 'file' && (
              <button
                className="mini-button"
                type="button"
                title={`Download ${node.name}`}
                onClick={async (e) => {
                  e.stopPropagation()
                  const res = await fetch(`${API_BASE}/api/drive/${node.id}/content`, {
                    headers: { Authorization: `Bearer ${authToken}` },
                  })
                  if (!res.ok) return
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = node.name
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                ↓
              </button>
            )}
            {node.isImage && (
              <button
                className="mini-button"
                type="button"
                onClick={async () => {
                  setDrivePreviewNode(node)
                }}
              >
                Preview
              </button>
            )}
            <div className="tree-menu-wrap">
              <button
                className="mini-button"
                type="button"
                aria-label="More options"
                onClick={() => setDriveFileMenuId(menuOpen ? null : node.id)}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="tree-menu-dropdown">
                  <button
                    className="tree-menu-item"
                    type="button"
                    onClick={() => {
                      handleRenameNode(node)
                      setDriveFileMenuId(null)
                    }}
                  >
                    Rename
                  </button>
                  {storageDevices.length > 0 && (
                    <>
                      <div className="tree-menu-divider" />
                      <p className="tree-menu-label">Set Location</p>
                      {storageDevices.map((d) => (
                        <button
                          key={d.id}
                          className={node.deviceId === d.id ? 'tree-menu-item active' : 'tree-menu-item'}
                          type="button"
                          onClick={() => {
                            setDriveNodes((prev) =>
                              prev.map((n) => (n.id === node.id ? { ...n, deviceId: d.id } : n)),
                            )
                            setDriveFileMenuId(null)
                            setStatusKind('success')
                            setStatus(`${node.name} location set to ${d.name}.`)
                          }}
                        >
                          {d.name}{node.deviceId === d.id ? ' ✓' : ''}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="tree-menu-divider" />
                  <button
                    className="tree-menu-item danger"
                    type="button"
                    onClick={() => {
                      handleDeleteNode(node)
                      setDriveFileMenuId(null)
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </span>
        </li>
      )

      if (node.kind === 'folder') {
        return [row, ...renderDriveTree(node.id, depth + 1)]
      }

      return [row]
    })
  }

  const renderSidebar = () => (
    <aside className="account-sidebar" aria-label="Account and device information">
      <div className="sidebar-toprow">
        <p className="kicker">Account</p>
        <div className="sidebar-toprow-actions">
          <button
            className="notif-bell-btn"
            type="button"
            aria-label={`Notifications${notifUnreadCount > 0 ? ` (${notifUnreadCount} unread)` : ''}`}
            onClick={() => setNotifPanelOpen((p) => !p)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="notif-bell-icon">
              <path d="M12 2a7 7 0 0 0-7 7v3.5l-1.7 2.5A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7L19 12.5V9a7 7 0 0 0-7-7Zm0 20a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2Z" />
            </svg>
            {notifUnreadCount > 0 && (
              <span className="notif-badge">{notifUnreadCount > 9 ? '9+' : notifUnreadCount}</span>
            )}
          </button>
          {view !== 'launcher' && view !== 'auth' && (
            <button className="sidebar-back-btn" type="button" onClick={() => setView('launcher')}>
              ← Launcher
            </button>
          )}
        </div>
      </div>
      <h2>@{accountName}</h2>
      <p className="sidebar-email">{accountEmail}</p>
  <p
        className="token-balance"
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onClick={() => setView('wallet')}
        onKeyDown={(e) => e.key === 'Enter' && setView('wallet')}
        title="Open Wallet"
      >⬡ {tokenBalance.toFixed(2)} Tokens
      </p>
      <div className="hive-quick-toggle">
        <span>HiveMind</span>
        <button
          className={hiveMindEnabled ? 'mini-button active' : 'mini-button'}
          type="button"
          onClick={handleToggleHiveMind}
          disabled={!hiveResourcesConfigured && !hiveMindEnabled}
        >
          {hiveMindEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {(() => {
        const hiveWorkers = devices.filter((d) => d.role === 'Worker' && d.appInstalled)
        const hiveReady = hiveWorkers.filter((d) => d.status === 'Online')
        const hiveActive = hiveReady.filter((d) => (hiveContribution[d.id] ?? 0) > 0)
        return (
          <div className="hive-status-panel">
            <div className="hive-status-header">
              <span className="hive-status-title">HiveMind Status</span>
              {hiveMindEnabled && <span className="hive-status-dot" />}
            </div>
            <div className="hive-status-row">
              <span className="hive-status-label">Total Contribution</span>
              <span className="hive-status-value">{hiveTotalContribution}%</span>
            </div>
            <div className="hive-status-row">
              <span className="hive-status-label">Active Workers</span>
              <span className="hive-status-value">{hiveActive.length} / {hiveWorkers.length}</span>
            </div>
            {hiveWorkers.length === 0 ? (
              <p className="hive-status-empty">No Worker devices with app installed.</p>
            ) : (
              <ul className="hive-device-mini-list">
                {hiveWorkers.map((device) => {
                  const contribution = hiveContribution[device.id] ?? 0
                  const isOnline = device.status === 'Online'
                  const isContributing = isOnline && contribution > 0
                  return (
                    <li key={device.id} className="hive-device-mini-item">
                      <div className="hive-device-mini-left">
                        <span
                          className={
                            isContributing
                              ? 'hive-device-dot contributing'
                              : isOnline
                              ? 'hive-device-dot ready'
                              : 'hive-device-dot offline'
                          }
                        />
                        <span className="hive-device-mini-name">{device.name}</span>
                      </div>
                      <span className="hive-device-mini-meta">
                        {isContributing
                          ? `${contribution}%`
                          : isOnline
                          ? 'Ready'
                          : 'Offline'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })()}

      <div className="device-section">
        <h3>Active Connections</h3>
        <p className="device-caption">{onlineDeviceCount} of {devices.length} device{devices.length !== 1 ? 's' : ''} online</p>
        <button
          type="button"
          className="sidebar-link-card"
          onClick={() => setView('devices')}
        >
          <span>Manage in Devices</span>
          <span className="sidebar-link-arrow">→</span>
        </button>
      </div>

      <div className="sidebar-bottom">
        <button
          className="secondary-button sidebar-full-btn"
          type="button"
          onClick={() => {
            setSettingsName(accountName)
            setSettingsEmail(accountEmail)
            setSettingsCurrentPw('')
            setSettingsNewPw('')
            setSettingsMsg('')
            setView('settings')
          }}
        >
          Account Settings
        </button>
        <button className="secondary-button sidebar-full-btn" type="button" onClick={handleOpenDesktopView}>
          {isWebRuntime ? 'Get Desktop App' : 'Desktop App & Updates'}
        </button>
        <button className="logout-button" type="button" onClick={handleLogout}>
          Sign Out
        </button>
      </div>

      {notifPanelOpen && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <span className="notif-panel-title">Notifications</span>
            <div className="notif-panel-actions">
              {notifUnreadCount > 0 && (
                <button
                  className="mini-button"
                  type="button"
                  onClick={async () => {
                    await apiFetch('/api/notifications/read-all', { method: 'PATCH' })
                    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                    setNotifUnreadCount(0)
                  }}
                >
                  Mark all read
                </button>
              )}
              <button className="mini-button" type="button" onClick={() => setNotifPanelOpen(false)}>✕</button>
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="notif-empty">No notifications yet.</p>
          ) : (
            <ul className="notif-list">
              {notifications.map((n) => (
                <li key={n.id} className={n.read ? 'notif-item read' : 'notif-item'}>
                  <div className="notif-item-body">
                    <span className="notif-title">{n.title}</span>
                    {n.body && <span className="notif-body">{n.body}</span>}
                    <span className="notif-time">{new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <button
                    className="notif-dismiss"
                    type="button"
                    aria-label="Dismiss"
                    onClick={async () => {
                      await apiFetch(`/api/notifications/${n.id}`, { method: 'DELETE' })
                      setNotifications((prev) => prev.filter((x) => x.id !== n.id))
                      setNotifUnreadCount((c) => Math.max(0, c - (n.read ? 0 : 1)))
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Electron update banner — shown when a new version has been downloaded */}
      {updateDownloaded && (
        <div className="electron-update-banner" role="status">
          <span className="electron-update-text">
            {updateVersion ? `Update v${updateVersion} ready` : 'Update ready'} — restart to apply
          </span>
          <button
            type="button"
            className="mini-button"
            onClick={() => window.electronAPI?.installUpdate()}
          >
            Restart &amp; Update
          </button>
        </div>
      )}
    </aside>
  )

  if (view === 'devices') {
    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Devices</p>
                  <h1>Distributed Resource Manager</h1>
                  <p className="lead">
                    Assign a main system device and combine connected hardware power to process
                    future AI tasks collaboratively.
                  </p>
                </div>
              </header>

              <section className="allocation-summary">
                <article className="summary-card">
                  <p className="summary-label">Main System</p>
                  <p className="summary-value">{mainSystemDevice ? mainSystemDevice.name : 'Not Assigned'}</p>
                </article>
                <article className="summary-card">
                  <p className="summary-label">Online Devices</p>
                  <p className="summary-value">{onlineDeviceCount}</p>
                </article>
                <article className="summary-card">
                  <p className="summary-label">Total Shared Storage</p>
                  <p className="summary-value">{totalStorageGb} GB</p>
                </article>
              </section>

              <div className="devices-add-row">
                <h3 className="devices-section-title">Main System</h3>
                <button className="secondary-button" type="button" onClick={() => setShowAddDeviceModal(true)}>
                  + Add Device
                </button>
              </div>

              {mainSystemDevice ? (
                <article className="device-card device-card-main">
                  <div className="device-card-head">
                    <h3>{mainSystemDevice.name}</h3>
                    <div className="device-head-badges">
                      {heartbeatDeviceId === mainSystemDevice.id && (
                        <span className="badge-this-device">This Device</span>
                      )}
                      {mainSystemDevice.appInstalled && (
                        <span className="badge-app-installed">Zenith Installed</span>
                      )}
                      <span className={mainSystemDevice.status === 'Online' ? 'device-badge online' : 'device-badge'}>
                        {mainSystemDevice.status}
                      </span>
                    </div>
                  </div>
                  <p className="device-meta">{mainSystemDevice.type} · Main System</p>
                  <p className="device-meta">Compute: {mainSystemDevice.computeProfile}</p>
                  <p className="device-meta">Storage Contribution: {mainSystemDevice.storageContributionGb} GB</p>
                  {mainSystemDevice.cpuPercent !== undefined && (
                    <div className="device-stat-bars">
                      <div className="device-stat-row">
                        <span className="device-stat-label">CPU</span>
                        <div className="device-stat-bar">
                          <div className="device-stat-bar-fill" style={{ width: `${Math.min(100, mainSystemDevice.cpuPercent)}%` }} />
                        </div>
                        <span className="device-stat-value">{mainSystemDevice.cpuPercent.toFixed(0)}%</span>
                      </div>
                      {(mainSystemDevice.ramTotalGb ?? 0) > 0 && (
                        <div className="device-stat-row">
                          <span className="device-stat-label">RAM</span>
                          <div className="device-stat-bar">
                            <div className="device-stat-bar-fill" style={{ width: `${Math.min(100, ((mainSystemDevice.ramUsedGb ?? 0) / (mainSystemDevice.ramTotalGb ?? 1)) * 100)}%` }} />
                          </div>
                          <span className="device-stat-value">{(mainSystemDevice.ramUsedGb ?? 0).toFixed(1)} / {(mainSystemDevice.ramTotalGb ?? 0).toFixed(1)} GB</span>
                        </div>
                      )}
                      {(mainSystemDevice.diskTotalGb ?? 0) > 0 && (
                        <div className="device-stat-row">
                          <span className="device-stat-label">Disk</span>
                          <div className="device-stat-bar">
                            <div className="device-stat-bar-fill" style={{ width: `${Math.min(100, ((mainSystemDevice.diskUsedGb ?? 0) / (mainSystemDevice.diskTotalGb ?? 1)) * 100)}%` }} />
                          </div>
                          <span className="device-stat-value">{(mainSystemDevice.diskUsedGb ?? 0).toFixed(0)} / {(mainSystemDevice.diskTotalGb ?? 0).toFixed(0)} GB</span>
                        </div>
                      )}
                    </div>
                  )}
                  {mainSystemDevice.storageContributionGb > 0 && mainSystemDevice.status === 'Online' && (
                    <p className="device-meta cloud-ok">☁ ✓ Cloud storage online — files accessible from all devices</p>
                  )}
                </article>
              ) : (
                <p className="device-caption">No Main System device configured. Add one using the button above.</p>
              )}

              {(() => {
                const workerDevices = devices.filter((d) => d.role === 'Worker')
                return (
                  <>
                    <h3 className="devices-section-title" style={{ marginTop: '1.4rem' }}>Worker Devices</h3>
                    <p className="device-caption">
                      Workers must have the Zenith app installed to participate in HiveMind and task distribution.
                    </p>
                    {workerDevices.length === 0 ? (
                      <p className="device-caption">No Worker devices added yet.</p>
                    ) : (
                      <section className="devices-grid" aria-label="Worker devices">
                        {workerDevices.map((device) => (
                          <article key={device.id} className="device-card">
                            <div className="device-card-head">
                              <h3>{device.name}</h3>
                              <div className="device-head-badges">
                                {heartbeatDeviceId === device.id && (
                                  <span className="badge-this-device">This Device</span>
                                )}
                                {device.appInstalled ? (
                                  <span className="badge-app-installed">App ✓</span>
                                ) : (
                                  <span className="badge-app-missing">No App</span>
                                )}
                                <span className={device.status === 'Online' ? 'device-badge online' : 'device-badge'}>
                                  {device.status}
                                </span>
                              </div>
                            </div>
                            <p className="device-meta">{device.type}</p>
                            <p className="device-meta">Compute: {device.computeProfile}</p>
                            <p className="device-meta">Storage: {device.storageContributionGb} GB</p>
                            {device.cpuPercent !== undefined && (
                              <div className="device-stat-bars">
                                <div className="device-stat-row">
                                  <span className="device-stat-label">CPU</span>
                                  <div className="device-stat-bar">
                                    <div className="device-stat-bar-fill" style={{ width: `${Math.min(100, device.cpuPercent)}%` }} />
                                  </div>
                                  <span className="device-stat-value">{device.cpuPercent.toFixed(0)}%</span>
                                </div>
                                {(device.ramTotalGb ?? 0) > 0 && (
                                  <div className="device-stat-row">
                                    <span className="device-stat-label">RAM</span>
                                    <div className="device-stat-bar">
                                      <div className="device-stat-bar-fill" style={{ width: `${Math.min(100, ((device.ramUsedGb ?? 0) / (device.ramTotalGb ?? 1)) * 100)}%` }} />
                                    </div>
                                    <span className="device-stat-value">{(device.ramUsedGb ?? 0).toFixed(1)} / {(device.ramTotalGb ?? 0).toFixed(1)} GB</span>
                                  </div>
                                )}
                                {(device.diskTotalGb ?? 0) > 0 && (
                                  <div className="device-stat-row">
                                    <span className="device-stat-label">Disk</span>
                                    <div className="device-stat-bar">
                                      <div className="device-stat-bar-fill" style={{ width: `${Math.min(100, ((device.diskUsedGb ?? 0) / (device.diskTotalGb ?? 1)) * 100)}%` }} />
                                    </div>
                                    <span className="device-stat-value">{(device.diskUsedGb ?? 0).toFixed(0)} / {(device.diskTotalGb ?? 0).toFixed(0)} GB</span>
                                  </div>
                                )}
                              </div>
                            )}
                            {device.storageContributionGb > 0 && device.status === 'Online' && (
                              <p className="device-meta cloud-ok">☁ ✓ Cloud storage online</p>
                            )}
                          </article>
                        ))}
                      </section>
                    )}
                  </>
                )
              })()}

              <section className="dispatcher-panel" aria-label="Task dispatch simulator">
                <h3>Task Dispatcher (Mock)</h3>
                <p className="device-caption">
                  Simulate how the Main System splits an incoming AI query across online devices.
                </p>
                <label htmlFor="dispatch-query">AI Query</label>
                <input
                  id="dispatch-query"
                  name="dispatch-query"
                  type="text"
                  value={dispatchQuery}
                  onChange={(event) => setDispatchQuery(event.target.value)}
                />
                <button className="secondary-button" type="button" onClick={handleSimulateDispatch}>
                  Run Dispatch Simulation
                </button>

                {dispatchAssignments.length > 0 && (
                  <ul className="dispatch-list">
                    {dispatchAssignments.map((assignment) => (
                      <li key={assignment.deviceId} className="dispatch-item">
                        <span>{assignment.deviceName}</span>
                        <span>{assignment.sharePercent}% load</span>
                        <span>{assignment.workUnits} units</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {status && (
                <p className={statusKind === 'success' ? 'status-message success' : 'status-message'}>
                  {status}
                </p>
              )}
            </section>
          </div>

          {showAddDeviceModal && (
            <section className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add device">
              <form className="modal-card" onSubmit={handleAddDevice}>
                <h2>Add Device</h2>
                <p className="modal-copy">
                  Choose the device type and define how much compute/storage this hardware contributes
                  to the shared Zenith system.
                </p>

                <label htmlFor="device-name">Device Name (optional)</label>
                <input
                  id="device-name"
                  name="device-name"
                  type="text"
                  placeholder="Example: Office Laptop"
                  value={newDeviceName}
                  onChange={(event) => setNewDeviceName(event.target.value)}
                />

                <label htmlFor="device-type">Device Type</label>
                <select
                  id="device-type"
                  name="device-type"
                  value={newDeviceType}
                  onChange={(event) => setNewDeviceType(event.target.value as DeviceType)}
                >
                  <option value="Laptop">Laptop</option>
                  <option value="Stationary">Stationary</option>
                  <option value="Phone">Phone</option>
                  <option value="Other">Other</option>
                </select>

                <label htmlFor="device-role">System Role</label>
                <select
                  id="device-role"
                  name="device-role"
                  value={newDeviceRole}
                  onChange={(event) => setNewDeviceRole(event.target.value as DeviceRole)}
                >
                  <option value="Worker">Worker</option>
                  <option value="Main System">Main System</option>
                </select>

                <label htmlFor="compute-profile">Compute Allocation</label>
                <select
                  id="compute-profile"
                  name="compute-profile"
                  value={newDeviceComputeProfile}
                  onChange={(event) =>
                    setNewDeviceComputeProfile(event.target.value as ComputeProfile)
                  }
                >
                  <option value="Light Assist">Light Assist</option>
                  <option value="Balanced Worker">Balanced Worker</option>
                  <option value="Heavy AI Node">Heavy AI Node</option>
                </select>

                <label htmlFor="storage-allocation">Storage Contribution (GB)</label>
                <input
                  id="storage-allocation"
                  name="storage-allocation"
                  type="number"
                  min={0}
                  step={1}
                  value={newDeviceStorageGb}
                  onChange={(event) => setNewDeviceStorageGb(Number(event.target.value))}
                />

                <div className="modal-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setShowAddDeviceModal(false)
                      resetAddDeviceForm()
                    }}
                  >
                    Cancel
                  </button>
                  <button className="primary-button" type="submit">
                    Save Device
                  </button>
                </div>
              </form>
            </section>
          )}
        </section>
      </main>
    )
  }

  if (view === 'drive') {
    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Drive</p>
                  <h1>Shared File Tree</h1>
                  <p className="lead">
                    Fidus conversations and Photo Album assets are stored here. Photo Album reads image
                    files directly from Drive.
                  </p>
                </div>
                <div className="header-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                  >
                    Upload Placeholder
                  </button>
                </div>
              </header>

              <input
                ref={uploadInputRef}
                className="hidden-input"
                type="file"
                multiple
                onChange={handleUploadFiles}
              />

              <section className="drive-toolbar">
                <label htmlFor="parent-folder">Target Folder</label>
                <select
                  id="parent-folder"
                  name="parent-folder"
                  value={driveTargetFolderId}
                  onChange={(event) => setDriveTargetFolderId(event.target.value)}
                >
                  <option value="root">Root</option>
                  {folderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </section>

              <section className="drive-actions">
                <div className="drive-action-card">
                  <h3>Create Folder</h3>
                  <input
                    type="text"
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                  />
                  <button className="secondary-button" type="button" onClick={() => addDriveNode('folder')}>
                    Add Folder
                  </button>
                </div>

                <div className="drive-action-card">
                  <h3>Create File</h3>
                  <input
                    type="text"
                    placeholder="File name"
                    value={newFileName}
                    onChange={(event) => setNewFileName(event.target.value)}
                  />
                  <button className="secondary-button" type="button" onClick={() => addDriveNode('file')}>
                    Add File
                  </button>
                </div>
              </section>

              <section className="drive-tree-panel" aria-label="Drive file tree">
                <h3>File Tree</h3>
                {driveNodes.length === 0 ? (
                  <p className="device-caption">Drive is empty. Create your first folder or file.</p>
                ) : (
                  <ul className="tree-list">{renderDriveTree(null)}</ul>
                )}
              </section>

              {devices.filter((d) => d.storageContributionGb > 0).length > 1 && (
                <section className="drive-offload-section" aria-label="Device storage offload">
                  <h3>Offload Device Storage</h3>
                  <p className="device-caption">
                    Move all files from one storage device to another to free up its contribution.
                  </p>
                  {devices
                    .filter((d) => d.storageContributionGb > 0)
                    .map((sourceDevice) => {
                      const fileCount = driveNodes.filter((n) => n.deviceId === sourceDevice.id).length
                      const targets = devices.filter(
                        (d) => d.id !== sourceDevice.id && d.storageContributionGb > 0,
                      )
                      if (targets.length === 0) return null
                      return (
                        <div key={sourceDevice.id} className="drive-offload-row">
                          <span className="drive-offload-source">
                            {sourceDevice.name} ({fileCount} item{fileCount !== 1 ? 's' : ''})
                          </span>
                          <span className="device-caption">→ Move all to:</span>
                          {targets.map((target) => (
                            <button
                              key={target.id}
                              className="mini-button"
                              type="button"
                              onClick={() => {
                                setDriveNodes((prev) =>
                                  prev.map((n) =>
                                    n.deviceId === sourceDevice.id ? { ...n, deviceId: target.id } : n,
                                  ),
                                )
                                setStatusKind('success')
                                setStatus(
                                  `All files from ${sourceDevice.name} moved to ${target.name}.`,
                                )
                              }}
                            >
                              {target.name}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                </section>
              )}

              {status && (
                <p className={statusKind === 'success' ? 'status-message success' : 'status-message'}>
                  {status}
                </p>
              )}
            </section>
          </div>

          {drivePreviewNode && (
            <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Preview ${drivePreviewNode.name}`} onClick={() => setDrivePreviewNode(null)}>
              <div className="drive-preview-modal" onClick={(e) => e.stopPropagation()}>
                <div className="drive-preview-header">
                  <span className="drive-preview-name">{drivePreviewNode.name}</span>
                  <button className="mini-button" type="button" onClick={() => setDrivePreviewNode(null)}>✕ Close</button>
                </div>
                <div className="drive-preview-body">
                  <img
                    src={`${API_BASE}/api/drive/${drivePreviewNode.id}/content${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`}
                    alt={drivePreviewNode.name}
                    className="drive-preview-img"
                    style={{ display: 'block', maxWidth: '100%', maxHeight: '65vh', margin: '0 auto', borderRadius: '8px' }}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                      const el = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null
                      if (el) el.style.display = 'block'
                    }}
                  />
                  <p className="device-caption" style={{ display: 'none', textAlign: 'center', padding: '2rem' }}>
                    Preview unavailable — the file may not have content yet.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    )
  }

  if (view === 'fidus') {
    const activeConv = fidusConversations.find((c) => c.id === activeFidusConvId) ?? fidusConversations[0]
    const fidusMessages = activeConv?.messages ?? []

    const handleAddMemory = async () => {
      const content = newMemoryInput.trim()
      if (!content) return
      const res = await apiFetch('/api/fidus/memories', {
        method: 'POST',
        body: JSON.stringify({ content }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { memory: FidusMemory }
      setFidusMemories((prev) => [data.memory, ...prev])
      setNewMemoryInput('')
    }

    const handleDeleteMemory = async (id: string) => {
      await apiFetch(`/api/fidus/memories/${id}`, { method: 'DELETE' })
      setFidusMemories((prev) => prev.filter((m) => m.id !== id))
    }

    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Fidus the Cat</p>
                  <h1>Fidus</h1>
                </div>
              </header>

              <div className="fidus-shell">
                {/* Past Conversations */}
                <aside className="fidus-history" aria-label="Past conversations">
                  <div className="fidus-history-head">
                    <span className="fidus-history-title">Conversations</span>
                    <button
                      className="mini-button"
                      type="button"
                      onClick={async () => {
                        const res = await apiFetch('/api/conversations', { method: 'POST', body: JSON.stringify({}) })
                        if (!res.ok) return
                        const data = (await res.json()) as { conversation: FidusConversation }
                        setFidusConversations((prev) => [data.conversation, ...prev])
                        setActiveFidusConvId(data.conversation.id)
                      }}
                    >
                      + New
                    </button>
                  </div>
                  <div className="fidus-search-row">
                    <input
                      type="search"
                      className="fidus-search-input"
                      placeholder="Search conversations…"
                      value={fidusSearchQuery}
                      onChange={(e) => setFidusSearchQuery(e.target.value)}
                    />
                  </div>
                  <ul className="fidus-history-list">
                    {fidusConversations
                      .filter((c) => fidusSearchQuery === '' || c.title.toLowerCase().includes(fidusSearchQuery.toLowerCase()))
                      .map((conv) => {
                      const lastMsg = conv.messages[conv.messages.length - 1]
                      const preview = lastMsg ? lastMsg.text.slice(0, 55) + (lastMsg.text.length > 55 ? '…' : '') : ''
                      return (
                        <li key={conv.id}>
                          <button
                            type="button"
                            className={
                              conv.id === activeFidusConvId
                                ? 'fidus-conv-item active'
                                : 'fidus-conv-item'
                            }
                            onClick={() => setActiveFidusConvId(conv.id)}
                          >
                            <span className="fidus-conv-title">{conv.title}</span>
                            <span className="fidus-conv-preview">{preview}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  {/* Memory Panel */}
                  <div className="fidus-memory-panel">
                    <span className="fidus-history-title">Memories</span>
                    <p className="device-caption" style={{ margin: '4px 0 8px' }}>Facts Fidus always remembers.</p>
                    <div className="fidus-memory-input-row">
                      <input
                        type="text"
                        placeholder="Add a memory…"
                        value={newMemoryInput}
                        maxLength={500}
                        onChange={(e) => setNewMemoryInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddMemory() } }}
                      />
                      <button className="mini-button" type="button" onClick={handleAddMemory}>+</button>
                    </div>
                    {fidusMemories.length === 0 ? (
                      <p className="device-caption" style={{ marginTop: '6px' }}>No memories yet.</p>
                    ) : (
                      <ul className="fidus-memory-list">
                        {fidusMemories.map((m) => (
                          <li key={m.id} className="fidus-memory-item">
                            <span className="fidus-memory-text">{m.content}</span>
                            <button
                              className="notif-dismiss"
                              type="button"
                              aria-label="Delete memory"
                              onClick={() => handleDeleteMemory(m.id)}
                            >✕</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </aside>

                {/* Chat Area */}
                <div className="fidus-chat-area">
                  {/* Local model status banner — Electron only */}
                  {window.electronAPI && fidusLocalModel !== 'unknown' && (
                    <div
                      className={`fidus-model-banner ${fidusLocalModel === 'ready' ? 'fidus-model-banner--ready' : fidusLocalModel === 'missing' ? 'fidus-model-banner--missing' : ''}`}
                    >
                      {fidusLocalModel === 'ready' ? (
                        <span className="fidus-model-badge">⚡ Local AI</span>
                      ) : fidusLocalModel === 'missing' ? (
                        <span>Using cloud AI — run <code>npm run download-model</code> to enable local inference</span>
                      ) : (
                        <>
                          <span>{fidusModelMsg || 'Preparing local AI model…'}</span>
                          <div className="fidus-model-progress-bar">
                            <div
                              className="fidus-model-progress-fill"
                              style={{ width: `${fidusModelPct}%` }}
                            />
                          </div>
                          <span className="fidus-model-pct">{fidusModelPct}%</span>
                        </>
                      )}
                    </div>
                  )}
                  <section className="fidus-thread" aria-label="Fidus conversation" ref={fidusThreadRef}>
                    {fidusMessages.map((message) => (
                      <article
                        key={message.id}
                        className={message.role === 'user' ? 'fidus-bubble user' : 'fidus-bubble'}
                      >
                        <p className="fidus-role">{message.role === 'user' ? 'You' : 'Fidus'}</p>
                        {message.text
                          ? <div className="fidus-bubble-content">{renderMarkdown(message.text)}</div>
                          : <p className="fidus-typing"><span /><span /><span /></p>
                        }
                      </article>
                    ))}
                  </section>

                  <form className="fidus-compose" onSubmit={handleSendFidusMessage}>
                    <div className="fidus-row">
                      <input
                        id="fidus-input"
                        name="fidus-input"
                        type="text"
                        placeholder="Ask Fidus anything..."
                        value={fidusInput}
                        onChange={(event) => setFidusInput(event.target.value)}
                        disabled={fidusStreaming}
                      />
                      <button className="primary-button" type="submit" disabled={fidusStreaming}>
                        {fidusStreaming ? '...' : 'Send'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'photo-album') {
    const albumPhotos = driveNodes.filter((n) => n.kind === 'file' && n.isImage)
    const selectedPhoto = albumPhotos.find((p) => p.id === selectedMockPhotoId) ?? null
    const photoUrl = (id: string) => `${API_BASE}/api/drive/${id}/content${authToken ? `?token=${encodeURIComponent(authToken)}` : ''}`

    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Photo Album</p>
                  <h1>Photos</h1>
                  <p className="lead">
                    {albumPhotos.length > 0
                      ? `${albumPhotos.length} image${albumPhotos.length !== 1 ? 's' : ''} from Drive`
                      : 'No images yet — upload image files to Drive to see them here.'}
                  </p>
                </div>
              </header>

              {albumPhotos.length === 0 ? (
                <p className="device-caption" style={{ padding: '1.5rem 0' }}>
                  Upload .jpg, .png, .gif, or .webp files to your Drive and they will appear here automatically.
                </p>
              ) : (
                <section className="album-photo-grid" aria-label="Photo library">
                  {albumPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      type="button"
                      className={
                        photo.id === selectedMockPhotoId ? 'album-photo-card active' : 'album-photo-card'
                      }
                      onClick={() =>
                        setSelectedMockPhotoId(photo.id === selectedMockPhotoId ? null : photo.id)
                      }
                    >
                      <div className="album-photo-thumb">
                        <img
                          src={photoUrl(photo.id)}
                          alt={photo.name}
                          className="album-thumb-img"
                          loading="lazy"
                        />
                      </div>
                      <div className="album-photo-meta">
                        <span className="album-photo-name">{photo.name}</span>
                        {photo.sizeBytes != null && (
                          <span className="album-photo-date">{(photo.sizeBytes / 1024).toFixed(0)} KB</span>
                        )}
                      </div>
                    </button>
                  ))}
                </section>
              )}

              {selectedPhoto && (
                <section className="album-full-preview">
                  <img
                    src={photoUrl(selectedPhoto.id)}
                    alt={selectedPhoto.name}
                    className="album-full-img"
                  />
                  <div className="album-full-info">
                    <p className="album-full-name">{selectedPhoto.name}</p>
                    {selectedPhoto.sizeBytes != null && (
                      <p className="album-full-date">{(selectedPhoto.sizeBytes / 1024 / 1024).toFixed(2)} MB</p>
                    )}
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => setDrivePreviewNode(selectedPhoto)}
                    >
                      Open full preview
                    </button>
                  </div>
                </section>
              )}
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'hivemind') {
    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">HiveMind</p>
                  <h1>Distributed AI Network</h1>
                  <p className="lead">
                    Worker devices contribute compute to the HiveMind. Each device earns tokens per
                    task completed. Configure contributions below and lock settings before enabling.
                  </p>
                </div>
              </header>

              <section className="dispatcher-panel" aria-label="HiveMind dispatcher">
                {(() => {
                  const workerDevices = devices.filter(
                    (d) => d.role === 'Worker' && d.appInstalled,
                  )
                  return (
                    <>
                      <h3>Worker Resource Contributions</h3>
                      <p className="device-caption">
                        Sliders are capped by your Engine resource limit ({engineResourcePercent}%).
                        Lock settings before enabling HiveMind tasks.
                      </p>

                      {workerDevices.length === 0 ? (
                        <p className="device-caption">
                          No Worker devices with the Zenith app installed. Add a Worker device from
                          the Devices app.
                        </p>
                      ) : (
                        <section className="hivemind-device-grid" aria-label="HiveMind resource overview">
                          {workerDevices.map((device) => (
                            <article key={device.id} className="hivemind-device-card">
                              <div className="device-card-head">
                                <h3>{device.name}</h3>
                                <span
                                  className={
                                    device.status === 'Online' ? 'device-badge online' : 'device-badge'
                                  }
                                >
                                  {device.status}
                                </span>
                              </div>
                              <p className="device-meta">
                                {device.type} · {device.computeProfile}
                              </p>
                              <label htmlFor={`hive-${device.id}`}>
                                Contribution:{' '}
                                {Math.min(hiveContribution[device.id] ?? 0, engineResourcePercent)}%
                                {engineResourcePercent < 100 && (
                                  <span className="device-caption"> (cap: {engineResourcePercent}%)</span>
                                )}
                              </label>
                              <input
                                id={`hive-${device.id}`}
                                type="range"
                                min={0}
                                max={engineResourcePercent}
                                step={5}
                                value={Math.min(
                                  hiveContribution[device.id] ?? 0,
                                  engineResourcePercent,
                                )}
                                disabled={device.status !== 'Online' || hiveSettingsLocked}
                                onChange={(event) =>
                                  handleHiveContributionChange(
                                    device.id,
                                    Number(event.target.value),
                                  )
                                }
                                style={{ accentColor: 'var(--accent)' }}
                              />
                            </article>
                          ))}
                        </section>
                      )}

                      <p className="device-caption">
                        Total configured contribution: {hiveTotalContribution}%
                      </p>

                      <div className="hivemind-lock-row">
                        <button
                          className={hiveSettingsLocked ? 'primary-button' : 'secondary-button'}
                          type="button"
                          onClick={() => {
                            const locking = !hiveSettingsLocked
                            setHiveSettingsLocked(locking)
                            setStatusKind('success')
                            setStatus(
                              locking
                                ? 'HiveMind settings locked. These contributions will be used for task distribution.'
                                : 'HiveMind settings unlocked. Adjust contributions freely.',
                            )
                          }}
                        >
                          {hiveSettingsLocked
                            ? '🔒 Settings Locked — Click to Unlock'
                            : 'Lock In Settings'}
                        </button>
                      </div>

                      <label htmlFor="hive-query" style={{ marginTop: '1rem', display: 'block' }}>
                        Offload Query to HiveMind
                      </label>
                      <p className="device-caption">
                        Offloading spends tokens based on task complexity. Workers earn tokens for
                        completed tasks.
                      </p>
                      <input
                        id="hive-query"
                        name="hive-query"
                        type="text"
                        value={hiveQuery}
                        onChange={(event) => setHiveQuery(event.target.value)}
                      />
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={handleRunHiveMind}
                      >
                        Offload to HiveMind
                      </button>

                      {hiveAssignments.length > 0 && (
                        <>
                          <h3>Assignment Result</h3>
                          <ul className="dispatch-list">
                            {hiveAssignments.map((assignment) => (
                              <li key={assignment.deviceId} className="dispatch-item">
                                <span>{assignment.deviceName}</span>
                                <span>{assignment.sharePercent}% workload</span>
                                <span>+{assignment.tokenReward.toFixed(2)} tokens</span>
                              </li>
                            ))}
                          </ul>
                          {hiveAnswer && (
                            <div className="hive-answer-block">
                              <h4>AI Response</h4>
                              <p className="hive-answer-text">{hiveAnswer}</p>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )
                })()}
              </section>

              {status && (
                <p
                  className={statusKind === 'success' ? 'status-message success' : 'status-message'}
                >
                  {status}
                </p>
              )}
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'storage') {
    const offlineDeviceCount = devices.length - onlineDeviceCount

    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Storage</p>
                  <h1>Storage Pool</h1>
                  <p className="lead">
                    {totalStorageGb.toFixed(1)} GB pooled across {devices.length} device
                    {devices.length !== 1 ? 's' : ''}.
                  </p>
                </div>
              </header>

              <div className="allocation-summary">
                <div className="summary-card">
                  <p className="summary-label">Total Pooled</p>
                  <p className="summary-value">{totalStorageGb.toFixed(1)} GB</p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Online &amp; Accessible</p>
                  <p className="summary-value">{onlineDeviceCount} device{onlineDeviceCount !== 1 ? 's' : ''}</p>
                </div>
                <div className="summary-card">
                  <p className="summary-label">Offline / Unavailable</p>
                  <p className="summary-value">{offlineDeviceCount} device{offlineDeviceCount !== 1 ? 's' : ''}</p>
                </div>
              </div>

              <div className="storage-device-list" aria-label="Storage contributions by device">
                {[...devices]
                  .sort((a, b) => b.storageContributionGb - a.storageContributionGb)
                  .map((device) => {
                    const pct = totalStorageGb > 0
                      ? (device.storageContributionGb / totalStorageGb) * 100
                      : 0
                    const isOffline = device.status === 'Offline'

                    return (
                      <div
                        key={device.id}
                        className={isOffline ? 'storage-device-row offline' : 'storage-device-row'}
                      >
                        <div className="storage-device-info">
                          <div className="storage-device-name-row">
                            <span className="storage-device-name">{device.name}</span>
                            <span className="storage-device-type">{device.type}</span>
                            <span className={isOffline ? 'device-badge' : 'device-badge online'}>
                              {device.status}
                            </span>
                          </div>
                          <div className="storage-bar-wrap">
                            <div className="storage-bar-label">
                              <span>{device.role}</span>
                              <span>{pct.toFixed(1)}% of pool</span>
                            </div>
                            <div className="storage-bar-track">
                              <div
                                className={isOffline ? 'storage-bar-fill offline-fill' : 'storage-bar-fill'}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <span className="storage-gb-label">{device.storageContributionGb} GB</span>
                      </div>
                    )
                  })}
              </div>
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'engine') {
    const engineModels = [
      {
        id: 'compact',
        name: 'Compact',
        description: 'Lightweight responses. Ideal for quick answers, summaries, and simple tasks.',
        vram: '4 GB VRAM',
        cpu: '2–4 Cores',
        load: 'Low',
      },
      {
        id: 'standard',
        name: 'Standard',
        description: 'Balanced performance for general-purpose AI, multi-step reasoning, and drafting.',
        vram: '8 GB VRAM',
        cpu: '4–8 Cores',
        load: 'Medium',
      },
      {
        id: 'power',
        name: 'Power',
        description: 'Full capacity for complex AI workflows, code generation, and heavy analysis.',
        vram: '16+ GB VRAM',
        cpu: '8+ Cores',
        load: 'High',
      },
    ]
    const selectedModel = engineModels.find((m) => m.id === selectedEngineModel) ?? engineModels[1]!

    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Engine</p>
                  <h1>Model &amp; Resources</h1>
                  <p className="lead">
                    Choose an AI model and set the resource cap. Fidus and HiveMind will respect
                    these limits when running tasks.
                  </p>
                </div>
              </header>

              <section className="engine-model-grid" aria-label="Select AI model">
                {engineModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className={
                      selectedEngineModel === model.id
                        ? 'engine-model-card selected'
                        : 'engine-model-card'
                    }
                    onClick={() => {
                      setSelectedEngineModel(model.id)
                      setStatusKind('success')
                      setStatus(`${model.name} model selected.`)
                    }}
                  >
                    <div className="engine-model-head">
                      <span className="engine-model-name">{model.name}</span>
                      <span className={`engine-load-badge load-${model.id}`}>{model.load}</span>
                    </div>
                    <p className="engine-model-desc">{model.description}</p>
                    <div className="engine-model-specs">
                      <span>{model.vram}</span>
                      <span>{model.cpu}</span>
                    </div>
                  </button>
                ))}
              </section>

              <section className="engine-resource-section">
                <h3>Resource Cap</h3>
                <p className="device-caption">
                  Limits the maximum system resources Zenith may allocate. HiveMind inherits this as
                  the per-device slider ceiling.
                </p>
                <div className="engine-slider-row">
                  <label htmlFor="engine-resource">Performance: {engineResourcePercent}%</label>
                  <input
                    id="engine-resource"
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={engineResourcePercent}
                    onChange={(event) => setEngineResourcePercent(Number(event.target.value))}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                </div>
                <div className="allocation-summary">
                  <div className="summary-card">
                    <p className="summary-label">Active Model</p>
                    <p className="summary-value">{selectedModel.name}</p>
                  </div>
                  <div className="summary-card">
                    <p className="summary-label">Resource Cap</p>
                    <p className="summary-value">{engineResourcePercent}%</p>
                  </div>
                  <div className="summary-card">
                    <p className="summary-label">Est. VRAM Required</p>
                    <p className="summary-value">{selectedModel.vram}</p>
                  </div>
                </div>
              </section>

              {status && (
                <p
                  className={statusKind === 'success' ? 'status-message success' : 'status-message'}
                >
                  {status}
                </p>
              )}
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'desktop') {
    const platforms = [
      {
        id: 'windows',
        name: 'Windows',
        sub: 'Windows 10 / 11 — 64-bit',
        ext: '.exe',
        icon: (
          <svg className="desktop-platform-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 5.6 10.3 4.6v6.9H3V5.6Zm8.1-1.1L21 3v8.5h-9.9V4.5ZM3 12.5h7.3v6.9L3 18.4v-5.9Zm8.1 0H21V21l-9.9-1.4v-7.1Z" />
          </svg>
        ),
      },
      {
        id: 'macos',
        name: 'macOS',
        sub: 'macOS 12 Monterey or later',
        ext: '.dmg',
        icon: (
          <svg className="desktop-platform-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16.7 4c.2 1-.3 2.1-1 2.8-.7.7-1.7 1.2-2.8 1.1-.2-1 .3-2 1-2.8.7-.7 1.8-1.2 2.8-1.1ZM12.4 9c1.1 0 2.2.6 2.9.6.7 0 1.9-.7 3.2-.6.5 0 2 .2 2.9 1.6l-.1.1c-.9.5-1.6 1.5-1.5 2.8 0 1.5.9 2.8 2.2 3.4-.3 1-.7 2-1.3 2.8-.8 1.1-1.6 2.2-2.9 2.3-1.2 0-1.6-.8-3-.8-1.5 0-1.9.8-3.1.8-1.2 0-2.1-1.1-2.9-2.3-1-1.5-1.8-3.7-1.8-5.8 0-3.4 2.1-5.2 4.2-5.2 1.2 0 2.2.7 3.2.7Z" />
          </svg>
        ),
      },
      {
        id: 'linux',
        name: 'Linux',
        sub: 'Ubuntu, Fedora, Debian — x64',
        ext: '.AppImage',
        icon: (
          <svg className="desktop-platform-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2Zm-1 14.5v-2h2v2h-2Zm1.3-4.2c-.9.3-1.3 1-1.3 1.7h-2c0-1.6 1-2.9 2.5-3.4 1-.3 1.5-1.1 1.5-2.1 0-1.1-.9-2-2-2s-2 .9-2 2H7c0-2.2 1.8-4 4-4s4 1.8 4 4c0 1.5-.8 2.9-2.7 3.8Z" />
          </svg>
        ),
      },
    ]

    const latestVersion = desktopVersion ?? '0.1.0'
    const releasesUrl = desktopReleasesUrl

    const platformAssetUrl = (platformId: string): string => {
      if (!desktopAssetBaseUrl) return releasesUrl
      if (platformId === 'windows') return `${desktopAssetBaseUrl}/Zenith%20Setup%20${latestVersion}.exe`
      if (platformId === 'macos') return `${desktopAssetBaseUrl}/Zenith-${latestVersion}.dmg`
      if (platformId === 'linux') return `${desktopAssetBaseUrl}/Zenith-${latestVersion}.AppImage`
      return releasesUrl
    }

    const platformFileName = (platformId: string): string => {
      if (platformId === 'windows') return `Zenith Setup ${latestVersion}.exe`
      if (platformId === 'macos') return `Zenith-${latestVersion}.dmg`
      if (platformId === 'linux') return `Zenith-${latestVersion}.AppImage`
      return `Zenith-${latestVersion}`
    }

    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <button
                  type="button"
                  className="back-btn"
                  onClick={() => setView('launcher')}
                  aria-label="Back to launcher"
                >
                  ←
                </button>
                <div>
                  <p className="kicker">Download</p>
                  <h1>Desktop App</h1>
                  <p className="lead">
                    Run Zenith natively on your machine — background sync, system tray, native notifications.
                    {desktopVersion && (
                      <> &mdash; Latest release: <strong>v{desktopVersion}</strong></>
                    )}
                  </p>
                </div>
              </header>

              {!isWebRuntime && (
                <div className="desktop-already-banner">
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="desktop-banner-icon">
                    <path d="M9 12.4 6.6 10 5.2 11.4l3.8 3.8 8-8L15.6 5.8 9 12.4Z" />
                  </svg>
                  <span>You are already running the Zenith desktop app.</span>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => {
                      if (window.electronAPI) window.electronAPI.openExternal(releasesUrl)
                      else window.open(releasesUrl, '_blank')
                    }}
                  >
                    View release notes
                  </button>
                </div>
              )}

              <section className="desktop-platform-grid" aria-label="Platform downloads">
                {platforms.map((p) => (
                  <div className="desktop-platform-card" key={p.id}>
                    <div className="desktop-platform-header">
                      {p.icon}
                      <div>
                        <p className="desktop-platform-name">{p.name}</p>
                        <p className="desktop-platform-sub">{p.sub}</p>
                      </div>
                    </div>
                    <p className="desktop-platform-file">
                      {platformFileName(p.id)}
                    </p>
                    <button
                      type="button"
                      className="primary-button"
                      style={{ width: '100%' }}
                      onClick={() => {
                        const url = platformAssetUrl(p.id)
                        if (window.electronAPI) window.electronAPI.openExternal(url)
                        else window.open(url, '_blank')
                      }}
                    >
                      Download {p.ext}
                    </button>
                  </div>
                ))}
              </section>

              <section className="desktop-features">
                <p className="section-title">Why use the desktop app?</p>
                <ul className="desktop-feature-list">
                  {[
                    { icon: '⚡', title: 'Faster sync', desc: 'Direct Drive and Fidus sync without browser restrictions.' },
                    { icon: '🔔', title: 'Native notifications', desc: 'Get notified when HiveMind jobs complete or tokens are received.' },
                    { icon: '🖥', title: 'System tray', desc: 'Runs quietly in the background while you work.' },
                    { icon: '🔒', title: 'Local-first privacy', desc: 'Encrypted local SQLite cache — your data stays on your machine.' },
                    { icon: '♻️', title: 'Automatic updates', desc: 'Stays current silently — auto-update checks on launch.' },
                  ].map((f) => (
                    <li className="desktop-feature-item" key={f.title}>
                      <span className="desktop-feature-icon">{f.icon}</span>
                      <div>
                        <p className="desktop-feature-title">{f.title}</p>
                        <p className="desktop-feature-desc">{f.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <div className="desktop-footer-row">
                <p className="device-caption">
                  Zenith Desktop is built with Electron and open-sourced on GitHub.
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    if (window.electronAPI) window.electronAPI.openExternal(releasesUrl)
                    else window.open(releasesUrl, '_blank')
                  }}
                >
                  View all releases →
                </button>
              </div>
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'wallet') {
    const handleSendTokens = async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const amount = parseFloat(walletAmount)
      if (!walletRecipientUsername.trim() || !Number.isFinite(amount) || amount <= 0) {
        setStatusKind('error')
        setStatus('Please enter a valid recipient username and amount.')
        return
      }
      setWalletSending(true)
      try {
        const res = await apiFetch('/api/wallet/send', {
          method: 'POST',
          body: JSON.stringify({
            recipientUsername: walletRecipientUsername.trim(),
            amount,
            note: walletNote.trim() || undefined,
          }),
        })
        const data = (await res.json()) as { ok?: boolean; message?: string; newBalance?: number; error?: string }
        if (!res.ok) {
          setStatusKind('error')
          setStatus(data.message ?? data.error ?? 'Transfer failed.')
        } else {
          setTokenBalance(data.newBalance ?? tokenBalance)
          setWalletAmount('')
          setWalletRecipientUsername('')
          setWalletNote('')
          setStatusKind('success')
          setStatus(data.message ?? 'Tokens sent!')
          // Reload transaction history
          loadWallet().catch(() => {})
        }
      } finally {
        setWalletSending(false)
      }
    }

    const formatDate = (ts: number) =>
      new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}
            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Token Wallet</p>
                  <h1>⬡ {tokenBalance.toFixed(2)} Tokens</h1>
                  <p className="lead">Send tokens to other Zenith users and track your transaction history.</p>
                </div>
              </header>

              <div className="wallet-layout">
                <section className="wallet-send-panel">
                  <h2 className="section-title">Send Tokens</h2>
                  <form onSubmit={handleSendTokens} className="wallet-send-form">
                    <div className="wallet-field">
                      <label htmlFor="wallet-recipient">Recipient Username</label>
                      <input
                        id="wallet-recipient"
                        type="text"
                        placeholder="zenith_user"
                        value={walletRecipientUsername}
                        onChange={(e) => setWalletRecipientUsername(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="wallet-field">
                      <label htmlFor="wallet-amount">Amount</label>
                      <input
                        id="wallet-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        value={walletAmount}
                        onChange={(e) => setWalletAmount(e.target.value)}
                      />
                    </div>
                    <div className="wallet-field">
                      <label htmlFor="wallet-note">Note <span className="wallet-optional">(optional)</span></label>
                      <input
                        id="wallet-note"
                        type="text"
                        placeholder="What's this for?"
                        maxLength={200}
                        value={walletNote}
                        onChange={(e) => setWalletNote(e.target.value)}
                      />
                    </div>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={walletSending}
                    >
                      {walletSending ? 'Sending…' : 'Send Tokens'}
                    </button>
                  </form>

                  {status && (
                    <p className={statusKind === 'success' ? 'status-message success' : 'status-message'}>
                      {status}
                    </p>
                  )}
                </section>

                <section className="wallet-history-panel">
                  <h2 className="section-title">Transaction History</h2>
                  {walletTransactions.length === 0 ? (
                    <p className="wallet-empty">No transactions yet. Send tokens to get started.</p>
                  ) : (
                    <ul className="wallet-tx-list">
                      {walletTransactions.map((tx) => (
                        <li key={tx.id} className={`wallet-tx-item ${tx.direction}`}>
                          <div className="wallet-tx-left">
                            <span className="wallet-tx-dir">
                              {tx.direction === 'sent' ? '↑ Sent to' : '↓ Received from'}
                            </span>
                            <span className="wallet-tx-name">{tx.counterpartName}</span>
                            {tx.note && <span className="wallet-tx-note">"{tx.note}"</span>}
                          </div>
                          <div className="wallet-tx-right">
                            <span className={`wallet-tx-amount ${tx.direction}`}>
                              {tx.direction === 'sent' ? '−' : '+'}{tx.amount.toFixed(2)} ⬡
                            </span>
                            <span className="wallet-tx-date">{formatDate(tx.createdAt)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'settings') {
    const handleSaveSettings = async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setSettingsSaving(true)
      setSettingsMsg('')

      const body: Record<string, string> = {}
      if (settingsName.trim() && settingsName.trim() !== accountName) body.username = settingsName.trim()
      if (settingsEmail.trim() && settingsEmail.trim() !== accountEmail) body.email = settingsEmail.trim()
      if (settingsNewPw.trim()) {
        body.newPassword = settingsNewPw
        body.currentPassword = settingsCurrentPw
      }

      if (Object.keys(body).length === 0) {
        setSettingsMsgKind('error')
        setSettingsMsg('No changes detected.')
        setSettingsSaving(false)
        return
      }

      try {
        const res = await apiFetch('/api/account', {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
        const data = (await res.json()) as { ok?: boolean; name?: string; username?: string; email?: string; error?: string; message?: string }
        if (!res.ok) {
          setSettingsMsgKind('error')
          if (data.error === 'email_taken') setSettingsMsg('That email is already in use.')
          else if (data.error === 'username_taken') setSettingsMsg('That username is already taken.')
          else if (data.error === 'wrong_password') setSettingsMsg('Current password is incorrect.')
          else setSettingsMsg(data.message ?? 'Update failed.')
        } else {
          if (data.name) { setAccountName((data as { username?: string; name?: string }).username || data.name); setSettingsName((data as { username?: string; name?: string }).username || data.name) }
          if (data.email) { setAccountEmail(data.email); setSettingsEmail(data.email) }
          setSettingsCurrentPw('')
          setSettingsNewPw('')
          setSettingsMsgKind('success')
          setSettingsMsg('Settings saved.')
        }
      } catch {
        setSettingsMsgKind('error')
        setSettingsMsg('Could not reach server.')
      } finally {
        setSettingsSaving(false)
      }
    }

    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}
            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Account</p>
                  <h1>Account Settings</h1>
                  <p className="lead">Update your profile details and change your password.</p>
                </div>
              </header>

              <form className="settings-form" onSubmit={handleSaveSettings}>
                <section className="settings-section">
                  <h2 className="settings-section-title">Profile</h2>
                  <div className="settings-field">
                    <label htmlFor="settings-name">Username</label>
                    <input
                      id="settings-name"
                      type="text"
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      placeholder="zenith_user"
                    />
                  </div>
                  <div className="settings-field">
                    <label htmlFor="settings-email">Email Address</label>
                    <input
                      id="settings-email"
                      type="email"
                      value={settingsEmail}
                      onChange={(e) => setSettingsEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                </section>

                <section className="settings-section">
                  <h2 className="settings-section-title">Change Password</h2>
                  <p className="device-caption">Leave blank to keep your current password.</p>
                  <div className="settings-field">
                    <label htmlFor="settings-current-pw">Current Password</label>
                    <input
                      id="settings-current-pw"
                      type="password"
                      autoComplete="current-password"
                      value={settingsCurrentPw}
                      onChange={(e) => setSettingsCurrentPw(e.target.value)}
                      placeholder="Required to set a new password"
                    />
                  </div>
                  <div className="settings-field">
                    <label htmlFor="settings-new-pw">New Password</label>
                    <input
                      id="settings-new-pw"
                      type="password"
                      autoComplete="new-password"
                      value={settingsNewPw}
                      onChange={(e) => setSettingsNewPw(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </div>
                </section>

                <div className="settings-actions">
                  <button className="primary-button" type="submit" disabled={settingsSaving}>
                    {settingsSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>

                {settingsMsg && (
                  <p className={settingsMsgKind === 'success' ? 'status-message success' : 'status-message'}>
                    {settingsMsg}
                  </p>
                )}
              </form>
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'admin') {
    if (userRole !== 'admin') {
      setView('launcher')
      return null
    }
    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}
            <section className="launcher-main">
              <header className="launcher-header">
                <button type="button" className="back-btn" onClick={() => setView('launcher')} aria-label="Back to launcher">←</button>
                <div>
                  <p className="kicker">Administration</p>
                  <h1>Admin Panel</h1>
                  <p className="lead">Platform-wide statistics and user management.</p>
                </div>
                <button className="secondary-button" type="button" onClick={loadAdminStats}>↻ Refresh</button>
              </header>

              {!adminStats ? (
                <p className="device-caption">Loading platform data…</p>
              ) : (
                <>
                  <section className="allocation-summary">
                    <article className="summary-card">
                      <p className="summary-label">Total Users</p>
                      <p className="summary-value">{adminStats.totalUsers}</p>
                    </article>
                    <article className="summary-card">
                      <p className="summary-label">Total Devices</p>
                      <p className="summary-value">{adminStats.totalDevices}</p>
                    </article>
                    <article className="summary-card">
                      <p className="summary-label">Online Devices</p>
                      <p className="summary-value">{adminStats.onlineDevices}</p>
                    </article>
                    <article className="summary-card">
                      <p className="summary-label">Drive Files</p>
                      <p className="summary-value">{adminStats.totalFiles}</p>
                    </article>
                    <article className="summary-card">
                      <p className="summary-label">Drive Folders</p>
                      <p className="summary-value">{adminStats.totalFolders}</p>
                    </article>
                    <article className="summary-card">
                      <p className="summary-label">Storage Pooled</p>
                      <p className="summary-value">{adminStats.totalStorageGb.toFixed(0)} <span style={{ fontSize: '0.75em', opacity: 0.7 }}>GB</span></p>
                    </article>
                    <article className="summary-card">
                      <p className="summary-label">Fidus Convos</p>
                      <p className="summary-value">{adminStats.totalConversations}</p>
                    </article>
                    <article className="summary-card">
                      <p className="summary-label">Fidus Messages</p>
                      <p className="summary-value">{adminStats.totalMessages}</p>
                    </article>
                  </section>

                  <section className="admin-users-section">
                    <p className="section-title">Users</p>
                    <div className="admin-user-list">
                      {adminStats.users.map((u) => (
                        <div key={u.id} className="admin-user-row">
                          <div className="admin-user-info">
                            <span className="admin-user-name">{u.name}</span>
                            <span className="admin-user-email">{u.email}</span>
                          </div>
                          <div className="admin-user-actions">
                            <span className={u.role === 'admin' ? 'admin-role-badge admin-role-badge--admin' : 'admin-role-badge'}>{u.role}</span>
                            {u.id !== userId && (
                              <button
                                className="mini-button"
                                type="button"
                                onClick={async () => {
                                  const newRole = u.role === 'admin' ? 'user' : 'admin'
                                  const res = await apiFetch(`/api/admin/users/${u.id}/role`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ role: newRole }),
                                  })
                                  if (res.ok) loadAdminStats()
                                }}
                              >
                                {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'theme') {
    const accentOptions = [
      { id: 'pink', label: 'Pink', color: '#d946ef' },
      { id: 'violet', label: 'Violet', color: '#8b5cf6' },
      { id: 'blue', label: 'Blue', color: '#3b82f6' },
      { id: 'cyan', label: 'Cyan', color: '#06b6d4' },
      { id: 'green', label: 'Green', color: '#10b981' },
      { id: 'orange', label: 'Orange', color: '#f59e0b' },
    ]

    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}
            <section className="launcher-main">
              <header className="launcher-header">
                <button type="button" className="back-btn" onClick={() => setView('launcher')} aria-label="Back to launcher">←</button>
                <div>
                  <p className="kicker">Customization</p>
                  <h1>Theme</h1>
                  <p className="lead">Personalize the Zenith UI to match your taste. Changes are saved automatically.</p>
                </div>
              </header>

              <section className="theme-section">
                <p className="section-title">Mode</p>
                <div className="theme-mode-row">
                  {(['dark', 'light'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={themeMode === m ? 'theme-mode-card selected' : 'theme-mode-card'}
                      onClick={() => setThemeMode(m)}
                    >
                      <span className="theme-mode-icon">{m === 'dark' ? '🌙' : '☀️'}</span>
                      <span className="theme-mode-label">{m === 'dark' ? 'Dark' : 'Light'}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="theme-section">
                <p className="section-title">Accent Color</p>
                <div className="theme-accent-row">
                  {accentOptions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={themeAccent === a.id ? 'theme-accent-swatch selected' : 'theme-accent-swatch'}
                      style={{ '--swatch-color': a.color } as React.CSSProperties}
                      onClick={() => setThemeAccent(a.id)}
                      aria-label={a.label}
                      title={a.label}
                    />
                  ))}
                </div>
              </section>
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'launcher') {
    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Zenith App Launcher</p>
                  <h1>Your Apps, One Home</h1>
                  <p className="lead">Choose an app below to open it when ready.</p>
                </div>
              </header>

              {dashboardStats && (
                <section className="dashboard-stats" aria-label="Dashboard overview">
                  <div className="dash-stat-card" role="button" tabIndex={0} onClick={() => setView('wallet')} onKeyDown={(e) => e.key === 'Enter' && setView('wallet')} style={{ cursor: 'pointer' }}>
                    <p className="dash-stat-label">Token Balance</p>
                    <p className="dash-stat-value">⬡ {dashboardStats.tokenBalance.toFixed(2)}</p>
                  </div>
                  <div className="dash-stat-card" role="button" tabIndex={0} onClick={() => setView('devices')} onKeyDown={(e) => e.key === 'Enter' && setView('devices')} style={{ cursor: 'pointer' }}>
                    <p className="dash-stat-label">Devices Online</p>
                    <p className="dash-stat-value">{dashboardStats.onlineDevices} <span className="dash-stat-sub">/ {dashboardStats.totalDevices}</span></p>
                  </div>
                  <div className="dash-stat-card" role="button" tabIndex={0} onClick={() => setView('storage')} onKeyDown={(e) => e.key === 'Enter' && setView('storage')} style={{ cursor: 'pointer' }}>
                    <p className="dash-stat-label">Storage Pooled</p>
                    <p className="dash-stat-value">{dashboardStats.totalStorageGb.toFixed(0)} <span className="dash-stat-sub">GB</span></p>
                  </div>
                  <div className="dash-stat-card" role="button" tabIndex={0} onClick={() => setView('drive')} onKeyDown={(e) => e.key === 'Enter' && setView('drive')} style={{ cursor: 'pointer' }}>
                    <p className="dash-stat-label">Drive Files</p>
                    <p className="dash-stat-value">{dashboardStats.fileCount}</p>
                  </div>
                  {dashboardStats.unreadNotifications > 0 && (
                    <div className="dash-stat-card dash-stat-alert" role="button" tabIndex={0} onClick={() => setNotifPanelOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setNotifPanelOpen(true)} style={{ cursor: 'pointer' }}>
                      <p className="dash-stat-label">Notifications</p>
                      <p className="dash-stat-value">{dashboardStats.unreadNotifications} <span className="dash-stat-sub">unread</span></p>
                    </div>
                  )}
                </section>
              )}

              <section className="app-grid" aria-label="Available Zenith apps">
                {appTiles.filter((app) => !app.adminOnly || userRole === 'admin').map((app) => (
                  <button
                    key={app.id}
                    className="app-tile"
                    type="button"
                    onClick={() => {
                      if (app.id === 'devices') {
                        setStatus('')
                        setView('devices')
                        return
                      }

                      if (app.id === 'drive') {
                        setStatus('')
                        setView('drive')
                        return
                      }

                      if (app.id === 'fidus') {
                        setStatus('')
                        setView('fidus')
                        return
                      }

                      if (app.id === 'photo-album') {
                        setStatus('')
                        setView('photo-album')
                        return
                      }

                      if (app.id === 'hivemind') {
                        setStatus('')
                        setView('hivemind')
                        return
                      }

                      if (app.id === 'storage') {
                        setStatus('')
                        setView('storage')
                        return
                      }

                      if (app.id === 'engine-layout') {
                        setStatus('')
                        setView('engine')
                        return
                      }

                      if (app.id === 'wallet') {
                        setStatus('')
                        setView('wallet')
                        return
                      }

                      if (app.id === 'desktop') {
                        handleOpenDesktopView()
                        return
                      }

                      if (app.id === 'settings') {
                        setSettingsName(accountName)
                        setSettingsEmail(accountEmail)
                        setSettingsCurrentPw('')
                        setSettingsNewPw('')
                        setSettingsMsg('')
                        setStatus('')
                        setView('settings')
                        return
                      }

                      if (app.id === 'theme') {
                        setStatus('')
                        setView('theme')
                        return
                      }

                      if (app.id === 'admin') {
                        setStatus('')
                        setView('admin')
                        loadAdminStats()
                        return
                      }

                      setStatusKind('success')
                      setStatus(`${app.name} is set up as a placeholder and ready for implementation.`)
                    }}
                  >
                    <span className="tile-icon">{app.icon}</span>
                    <span className="tile-name">{app.name}</span>
                    <span className="tile-copy">{app.description}</span>
                  </button>
                ))}
              </section>

              {status && (
                <p className={statusKind === 'success' ? 'status-message success' : 'status-message'}>
                  {status}
                </p>
              )}
            </section>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="layout auth-layout">
      <section className="auth-shell">
        <aside className="auth-copy">
          <p className="kicker">Zenith-app.net</p>
          <h1>Zenith Alpha</h1>
          <p className="lead">{helperText}</p>
        </aside>

        <section className="auth-card">
          <div className="mode-switch" role="tablist" aria-label="Authentication mode switcher">
            <button
              className={mode === 'login' ? 'tab active' : 'tab'}
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login')
                setStatus('')
              }}
            >
              Login
            </button>
            <button
              className={mode === 'signup' ? 'tab active' : 'tab'}
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => {
                setMode('signup')
                setStatus('')
              }}
            >
              Sign Up
            </button>
          </div>

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                name="login-username"
                type="text"
                autoComplete="username"
                placeholder="zenith_user"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
              />

              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                name="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
              />

              <button className="primary-button" type="submit">
                Log In
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleSignup}>
              <label htmlFor="signup-username">Username</label>
              <input
                id="signup-username"
                name="signup-username"
                type="text"
                autoComplete="username"
                placeholder="zenith_user"
                value={signupUsername}
                onChange={(event) => setSignupUsername(event.target.value)}
              />

              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                name="signup-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={signupEmail}
                onChange={(event) => setSignupEmail(event.target.value)}
              />

              <label htmlFor="signup-password">Password</label>
              <input
                id="signup-password"
                name="signup-password"
                type="password"
                autoComplete="new-password"
                placeholder="Create a strong password"
                value={signupPassword}
                onChange={(event) => setSignupPassword(event.target.value)}
              />

              <label htmlFor="signup-confirm-password">Confirm Password</label>
              <input
                id="signup-confirm-password"
                name="signup-confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm your password"
                value={signupConfirmPassword}
                onChange={(event) => setSignupConfirmPassword(event.target.value)}
              />

              <button className="primary-button" type="submit">
                Create Account
              </button>
            </form>
          )}

          {status && (
            <p className={statusKind === 'success' ? 'status-message success' : 'status-message'}>
              {status}
            </p>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
