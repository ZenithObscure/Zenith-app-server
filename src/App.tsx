import './styles.css'
import { ChangeEvent, FormEvent, ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'

type AuthMode = 'login' | 'signup'
type ViewMode = 'auth' | 'launcher' | 'devices' | 'drive' | 'fidus' | 'photo-album' | 'hivemind' | 'storage' | 'engine'
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
}

type DriveNode = {
  id: string
  name: string
  kind: 'folder' | 'file'
  parentId: string | null
  isImage: boolean
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

type HiveAssignment = {
  deviceId: string
  deviceName: string
  sharePercent: number
  tokenReward: number
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
  email: string
  token: string
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

const starterMessages: ChatMessage[] = [
  {
    id: 'm1',
    role: 'fidus',
    text: 'Hello! I\'m Fidus 🐱 What can I help you with today?',
  },
]

function App() {
  const [authToken, setAuthToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('zenith_auth_token') ?? '' : '',
  )
  const [view, setView] = useState<ViewMode>('auth')
  const [mode, setMode] = useState<AuthMode>('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('')
  const [status, setStatus] = useState('')
  const [statusKind, setStatusKind] = useState<StatusKind>('error')
  const [tokenBalance, setTokenBalance] = useState(0)
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
  const [fidusMessages, setFidusMessages] = useState<ChatMessage[]>(starterMessages)
  const [selectedPhotoFileId, setSelectedPhotoFileId] = useState<string | null>(null)
  const [hiveMindEnabled, setHiveMindEnabled] = useState(false)
  const [hiveContribution, setHiveContribution] = useState<Record<string, number>>(
    Object.fromEntries(starterDevices.map((device) => [device.id, 0])),
  )
  const [hiveQuery, setHiveQuery] = useState('Generate a deployment plan and split subtasks for parallel processing.')
  const [hiveAssignments, setHiveAssignments] = useState<HiveAssignment[]>([])
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedEngineModel, setSelectedEngineModel] = useState<string>('standard')
  const [engineResourcePercent, setEngineResourcePercent] = useState(50)
  const [hiveSettingsLocked, setHiveSettingsLocked] = useState(false)
  const [driveFileMenuId, setDriveFileMenuId] = useState<string | null>(null)

  const isWebRuntime = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : ''
    return !ua.includes('electron')
  }, [])

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

  const albumFiles = useMemo(
    () => driveNodes.filter((node) => node.kind === 'file' && node.isImage),
    [driveNodes],
  )

  const selectedPhotoFile = useMemo(
    () => albumFiles.find((file) => file.id === selectedPhotoFileId) ?? null,
    [albumFiles, selectedPhotoFileId],
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
    setAccountName(payload.name)
    setAccountEmail(payload.email)
    setAuthToken(payload.token)
    localStorage.setItem('zenith_auth_token', payload.token)
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

  useEffect(() => {
    if (!authToken) {
      return
    }

    loadApiState()
      .then(() => {
        setView('launcher')
      })
      .catch(() => {
        setAuthToken('')
        localStorage.removeItem('zenith_auth_token')
        setStatusKind('error')
        setStatus('Session restore failed. Please log in again and ensure backend API is running.')
      })
  }, [authToken, loadApiState])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!isEmailValid(loginEmail)) {
      setStatusKind('error')
      setStatus('Please enter a valid email address for login.')
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
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
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
        setStatus(body.message ?? 'No account found with this email.')
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
      await loadApiState(payload.token)
    } catch {
      // State will load on next render via useEffect
    }
    setStatusKind('success')
    setStatus('Welcome back. Opening your Zenith app launcher...')
    setView('launcher')
  }

  const handleSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (signupName.trim().length < 2) {
      setStatusKind('error')
      setStatus('Please enter your full name.')
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
          name: signupName.trim(),
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
      await loadApiState(payload.token)
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
    }

    setHiveAssignments(payload.assignments)
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
    setAccountName('Zenith User')
    setAccountEmail('not-set@zenith-app.net')
    setView('auth')
    setMode('login')
    setLoginEmail('')
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

  const handleUploadPlaceholder = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files

    if (!files || files.length === 0) {
      return
    }

    const parentId = driveTargetFolderId === 'root' ? null : driveTargetFolderId
    for (const file of Array.from(files)) {
      await apiFetch('/api/drive', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          kind: 'file',
          parentId,
          isImage: file.type.startsWith('image/'),
        }),
      })
    }

    await loadApiState()
    setStatusKind('success')
    setStatus(`${files.length} file(s) added to Drive as placeholders.`)
    event.target.value = ''
  }

  const getFidusReply = (input: string) => {
    const text = input.toLowerCase()

    if (text.includes('drive')) {
      return 'Drive now supports folders/files, uploads, and Photo Album linking. We can add permissions next.'
    }

    if (text.includes('devices')) {
      return 'Devices are ready for distributed scheduling. Next step could be live health checks per device.'
    }

    if (text.includes('theme')) {
      return 'Theme app can evolve into presets, custom palettes, and font packs when you are ready.'
    }

    return 'I can help with product planning, UI drafts, and implementation checklists. What should we build next?'
  }

  const handleSendFidusMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextText = fidusInput.trim()

    if (!nextText) {
      return
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: nextText,
    }

    const fidusReply: ChatMessage = {
      id: `fidus-${Date.now() + 1}`,
      role: 'fidus',
      text: getFidusReply(nextText),
    }

    setFidusMessages((prev) => [...prev, userMessage, fidusReply])
    setFidusInput('')
  }

  const handleDownloadDesktop = () => {
    setStatusKind('success')
    setStatus('Desktop app is on the roadmap. Check back soon — it will appear here when ready.')
  }

  const handleCheckDesktopUpdates = () => {
    const releasesUrl = 'https://github.com/ZenithObscure/Zenith-app/releases'
    window.open(releasesUrl, '_blank')
    setStatusKind('success')
    setStatus('Opened GitHub releases to check desktop updates.')
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
            {node.isImage && <span className="album-tag">Photo Album</span>}
            {nodeDevice && <em className="drive-device-label">on {nodeDevice.name}</em>}
          </span>
          <span className="tree-actions">
            {node.isImage && (
              <button
                className="mini-button"
                type="button"
                onClick={() => {
                  setSelectedPhotoFileId(node.id)
                  setView('photo-album')
                }}
              >
                Open
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
        {view !== 'launcher' && view !== 'auth' && (
          <button className="sidebar-back-btn" type="button" onClick={() => setView('launcher')}>
            ← Launcher
          </button>
        )}
      </div>
      <h2>{accountName}</h2>
      <p className="sidebar-email">{accountEmail}</p>
      <p className="token-balance">⬡ {tokenBalance.toFixed(2)} Tokens</p>
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

      <div className="device-section">
        <h3>Active Connections</h3>
        <p className="device-caption">Devices signed in to your Zenith account.</p>
        <ul className="device-list">
          {devices.map((device) => (
            <li key={device.id} className="device-item">
              <div>
                <span className="device-name">{device.name}</span>
                <span className="device-subtext">{device.type}</span>
                {device.appInstalled && device.status === 'Online' && (
                  <span className="app-session-dot" title="Zenith app active on this device" />
                )}
              </div>
              <div className="device-indicators">
                {device.storageContributionGb > 0 && device.status === 'Online' && (
                  <span className="cloud-check" title="Cloud storage online &mdash; accessible from all devices">☁</span>
                )}
                <span className={device.status === 'Online' ? 'device-badge online' : 'device-badge'}>
                  {device.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-bottom">
        {isWebRuntime ? (
          <button className="secondary-button sidebar-full-btn" type="button" onClick={handleDownloadDesktop}>
            Get Desktop App
          </button>
        ) : (
          <button className="secondary-button sidebar-full-btn" type="button" onClick={handleCheckDesktopUpdates}>
            Check for Updates
          </button>
        )}
        <button className="logout-button" type="button" onClick={handleLogout}>
          Sign Out
        </button>
      </div>
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
                onChange={handleUploadPlaceholder}
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
        </section>
      </main>
    )
  }

  if (view === 'fidus') {
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

              <section className="fidus-thread" aria-label="Fidus conversation">
                {fidusMessages.map((message) => (
                  <article
                    key={message.id}
                    className={message.role === 'user' ? 'fidus-bubble user' : 'fidus-bubble'}
                  >
                    <p className="fidus-role">{message.role === 'user' ? 'You' : 'Fidus'}</p>
                    <p>{message.text}</p>
                  </article>
                ))}
              </section>

              <form className="fidus-compose" onSubmit={handleSendFidusMessage}>
                <label htmlFor="fidus-input">Message</label>
                <div className="fidus-row">
                  <input
                    id="fidus-input"
                    name="fidus-input"
                    type="text"
                    placeholder="Ask Fidus to help with your next step..."
                    value={fidusInput}
                    onChange={(event) => setFidusInput(event.target.value)}
                  />
                  <button className="primary-button" type="submit">
                    Send
                  </button>
                </div>
              </form>
            </section>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'photo-album') {
    return (
      <main className="layout">
        <section className="launcher-shell">
          <div className="launcher-layout">
            {renderSidebar()}

            <section className="launcher-main">
              <header className="launcher-header">
                <div>
                  <p className="kicker">Photo Album</p>
                  <h1>Drive Image Viewer</h1>
                  <p className="lead">Images tagged from Drive are listed here for easy viewing.</p>
                </div>
                <div className="header-actions">
                  <button className="secondary-button" type="button" onClick={() => setView('drive')}>
                    Back to Drive
                  </button>
                </div>
              </header>

              <section className="album-grid">
                {albumFiles.length === 0 && (
                  <p className="device-caption">No image files in Drive yet. Upload images in Drive first.</p>
                )}

                {albumFiles.map((file) => (
                  <button
                    key={file.id}
                    className={file.id === selectedPhotoFileId ? 'album-card active' : 'album-card'}
                    type="button"
                    onClick={() => setSelectedPhotoFileId(file.id)}
                  >
                    <span className="album-icon">IMG</span>
                    <span>{file.name}</span>
                  </button>
                ))}
              </section>

              {selectedPhotoFile && (
                <section className="album-preview">
                  <h3>Selected Asset</h3>
                  <p>{selectedPhotoFile.name}</p>
                  <p className="device-caption">Preview placeholder. Full media viewer can be added next.</p>
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

              <section className="app-grid" aria-label="Available Zenith apps">
                {appTiles.map((app) => (
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
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                name="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
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
              <label htmlFor="signup-name">Full Name</label>
              <input
                id="signup-name"
                name="signup-name"
                type="text"
                autoComplete="name"
                placeholder="Alex Morgan"
                value={signupName}
                onChange={(event) => setSignupName(event.target.value)}
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
