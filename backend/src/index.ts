import bcrypt from 'bcryptjs'
import cors from 'cors'
import Database from 'better-sqlite3'
import express, { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'

type DeviceStatus = 'Online' | 'Offline'
type DeviceType = 'Laptop' | 'Stationary' | 'Phone' | 'Other'
type DeviceRole = 'Main System' | 'Worker'
type ComputeProfile = 'Light Assist' | 'Balanced Worker' | 'Heavy AI Node'

type DeviceInfo = {
  id: string
  name: string
  type: DeviceType
  status: DeviceStatus
  role: DeviceRole
  computeProfile: ComputeProfile
  storageContributionGb: number
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
  mimeType: string | null
  sizeBytes: number | null
}

type UserAccount = {
  id: string
  name: string
  username: string
  email: string
  password: string
  role: string
}

type AuthTokenPayload = {
  sub: string
  name: string
  username: string
  email: string
  role: string
}

type AuthRequest = Request & {
  userId?: string
  userRole?: string
}

const app = express()
const port = Number(process.env.PORT ?? 8787)
const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'backend/data/zenith.db')
const uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'backend/uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const multerStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const userId = (req as AuthRequest).userId ?? 'unknown'
    const userDir = path.join(uploadDir, userId)
    fs.mkdirSync(userDir, { recursive: true })
    cb(null, userDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})

const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
})
const jwtSecret = process.env.JWT_SECRET ?? 'dev-only-change-me'
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:5173').split(',')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json({ limit: '10mb' }))

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: { error: 'rate_limited', message: 'Too many attempts. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const signupSchema = z.object({
  username: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  email: z.email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

const addDeviceSchema = z.object({
  name: z.string().min(2),
  type: z.enum(['Laptop', 'Stationary', 'Phone', 'Other']),
  status: z.enum(['Online', 'Offline']).default('Online'),
  role: z.enum(['Main System', 'Worker']).default('Worker'),
  computeProfile: z.enum(['Light Assist', 'Balanced Worker', 'Heavy AI Node']).default('Balanced Worker'),
  storageContributionGb: z.number().int().nonnegative(),
})

const addDriveNodeSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['folder', 'file']),
  parentId: z.string().nullable(),
  isImage: z.boolean().default(false),
})

const updateDriveNodeSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  isImage: z.boolean().optional(),
})

const hiveSchema = z.object({
  query: z.string().min(1),
  contribution: z.record(z.string(), z.number().min(0).max(100)),
})

const serial = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

const createAuthToken = (payload: AuthTokenPayload) =>
  jwt.sign(payload, jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '7d',
  })

const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization token' })
    return
  }

  const token = authHeader.slice('Bearer '.length)
  try {
    const decoded = jwt.verify(token, jwtSecret) as AuthTokenPayload
    req.userId = decoded.sub
    req.userRole = decoded.role ?? 'user'
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'Forbidden', message: 'Admin access required' })
    return
  }
  next()
}

const initSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      role TEXT NOT NULL,
      compute_profile TEXT NOT NULL,
      storage_contribution_gb INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS drive_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      parent_id TEXT,
      is_image INTEGER NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      storage_path TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(parent_id) REFERENCES drive_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hive_contribution (
      device_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      contribution REAL NOT NULL,
      FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      token_balance REAL NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fidus_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fidus_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES fidus_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS token_transactions (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fidus_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS device_pings (
      device_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      last_ping INTEGER NOT NULL,
      FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  // Add role column to users if it doesn't exist yet
  try { db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'") } catch { /* already exists */ }

  // Add new columns to drive_nodes if they don't exist
  for (const col of [
    'ADD COLUMN mime_type TEXT',
    'ADD COLUMN size_bytes INTEGER',
    'ADD COLUMN storage_path TEXT',
  ]) {
    try { db.exec(`ALTER TABLE drive_nodes ${col}`) } catch { /* already exists */ }
  }

  // Add system stats columns to devices for Electron heartbeat
  for (const col of [
    'ADD COLUMN electron_device_id TEXT',
    'ADD COLUMN hostname TEXT',
    'ADD COLUMN platform TEXT',
    'ADD COLUMN cpu_model TEXT',
    'ADD COLUMN cpu_cores INTEGER',
    'ADD COLUMN cpu_percent REAL',
    'ADD COLUMN ram_used_gb REAL',
    'ADD COLUMN ram_total_gb REAL',
    'ADD COLUMN disk_used_gb REAL',
    'ADD COLUMN disk_total_gb REAL',
    'ADD COLUMN last_stats_at INTEGER',
  ]) {
    try { db.exec(`ALTER TABLE devices ${col}`) } catch { /* already exists */ }
  }

  // Add user_id columns to existing tables if they don't have them
  try {
    db.prepare('SELECT user_id FROM devices LIMIT 1').get()
  } catch {
    db.exec('ALTER TABLE devices ADD COLUMN user_id TEXT')
    db.exec('UPDATE devices SET user_id = (SELECT id FROM users LIMIT 1)')
    db.exec('ALTER TABLE devices ADD CONSTRAINT fk_user_id FOREIGN KEY(user_id) REFERENCES users(id)')
  }

  try {
    db.prepare('SELECT user_id FROM drive_nodes LIMIT 1').get()
  } catch {
    db.exec('ALTER TABLE drive_nodes ADD COLUMN user_id TEXT')
    db.exec('UPDATE drive_nodes SET user_id = (SELECT id FROM users LIMIT 1)')
    db.exec('ALTER TABLE drive_nodes ADD CONSTRAINT fk_user_id FOREIGN KEY(user_id) REFERENCES users(id)')
  }

  try {
    db.prepare('SELECT user_id FROM hive_contribution LIMIT 1').get()
  } catch {
    db.exec('ALTER TABLE hive_contribution ADD COLUMN user_id TEXT')
    db.exec('UPDATE hive_contribution SET user_id = (SELECT user_id FROM devices WHERE devices.id = hive_contribution.device_id LIMIT 1)')
  }

  try {
    db.prepare('SELECT user_id FROM app_state LIMIT 1').get()
  } catch {
    db.exec('ALTER TABLE app_state ADD COLUMN user_id TEXT')
    db.exec('UPDATE app_state SET user_id = (SELECT id FROM users LIMIT 1)')
  }

  // Add username column to users table and backfill from name
  try { db.exec(`ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
  db.exec(`UPDATE users SET username = LOWER(REPLACE(REPLACE(name, ' ', '_'), '.', '_')) WHERE username = '' OR username IS NULL`)
  try { db.exec(`CREATE UNIQUE INDEX idx_users_username ON users(username)`) } catch { /* already exists */ }
}

const seedUserDefaults = (userId: string) => {
  const deviceCount = db.prepare('SELECT COUNT(*) as count FROM devices WHERE user_id = ?').get(userId) as {
    count: number
  }
  if (deviceCount.count === 0) {
    const insertDevice = db.prepare(
      `INSERT INTO devices (id, user_id, name, type, status, role, compute_profile, storage_contribution_gb)
       VALUES (@id, @userId, @name, @type, @status, @role, @computeProfile, @storageContributionGb)`,
    )

    insertDevice.run({
      id: `device-${serial()}`,
      userId,
      name: 'Computer 1',
      type: 'Stationary',
      status: 'Online',
      role: 'Main System',
      computeProfile: 'Heavy AI Node',
      storageContributionGb: 500,
    })

    insertDevice.run({
      id: `device-${serial()}`,
      userId,
      name: 'Laptop',
      type: 'Laptop',
      status: 'Online',
      role: 'Worker',
      computeProfile: 'Balanced Worker',
      storageContributionGb: 160,
    })

    insertDevice.run({
      id: `device-${serial()}`,
      userId,
      name: 'Phone',
      type: 'Phone',
      status: 'Offline',
      role: 'Worker',
      computeProfile: 'Light Assist',
      storageContributionGb: 32,
    })
  }

  const driveCount = db.prepare('SELECT COUNT(*) as count FROM drive_nodes WHERE user_id = ?').get(userId) as {
    count: number
  }
  if (driveCount.count === 0) {
    db.prepare(
      `INSERT INTO drive_nodes (id, user_id, name, kind, parent_id, is_image) VALUES
       (?, ?, ?, ?, ?, ?),
       (?, ?, ?, ?, ?, ?),
       (?, ?, ?, ?, ?, ?)`,
    ).run(
      `folder-${serial()}`,
      userId,
      'Fidus Conversations',
      'folder',
      null,
      0,
      `folder-${serial()}`,
      userId,
      'Photo Album',
      'folder',
      null,
      0,
      `folder-${serial()}`,
      userId,
      'Shared Workspace',
      'folder',
      null,
      0,
    )
  }

  const stateCount = db.prepare('SELECT COUNT(*) as count FROM app_state WHERE user_id = ?').get(userId) as {
    count: number
  }
  if (stateCount.count === 0) {
    db.prepare('INSERT INTO app_state (id, user_id, token_balance) VALUES (?, ?, ?)').run(`state-${userId}`, userId, 0)
  }
}

const seedDefaults = () => {
  // Keep global seed for backward compat with existing test data
}

initSchema()
seedDefaults()

// Promote the first-ever user to admin if no admins exist yet
;(() => {
  const adminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }).c
  if (adminCount === 0) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY rowid LIMIT 1)").run()
  }
})()

const readDevices = (userId: string): DeviceInfo[] => {
  const rows = db.prepare(`
    SELECT id, name, type, status, role, compute_profile, storage_contribution_gb,
           electron_device_id, hostname, platform, cpu_model, cpu_cores,
           cpu_percent, ram_used_gb, ram_total_gb, disk_used_gb, disk_total_gb, last_stats_at
    FROM devices
    WHERE user_id = ?
    ORDER BY name ASC
  `).all(userId) as Array<{
    id: string
    name: string
    type: DeviceType
    status: DeviceStatus
    role: DeviceRole
    compute_profile: ComputeProfile
    storage_contribution_gb: number
    electron_device_id: string | null
    hostname: string | null
    platform: string | null
    cpu_model: string | null
    cpu_cores: number | null
    cpu_percent: number | null
    ram_used_gb: number | null
    ram_total_gb: number | null
    disk_used_gb: number | null
    disk_total_gb: number | null
    last_stats_at: number | null
  }>

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    role: row.role,
    computeProfile: row.compute_profile,
    storageContributionGb: row.storage_contribution_gb,
    electronDeviceId: row.electron_device_id ?? undefined,
    hostname: row.hostname ?? undefined,
    platform: row.platform ?? undefined,
    cpuModel: row.cpu_model ?? undefined,
    cpuCores: row.cpu_cores ?? undefined,
    cpuPercent: row.cpu_percent ?? undefined,
    ramUsedGb: row.ram_used_gb ?? undefined,
    ramTotalGb: row.ram_total_gb ?? undefined,
    diskUsedGb: row.disk_used_gb ?? undefined,
    diskTotalGb: row.disk_total_gb ?? undefined,
    lastStatsAt: row.last_stats_at ?? undefined,
  }))
}

const readDriveNodes = (userId: string): DriveNode[] => {
  const rows = db.prepare(`
    SELECT id, name, kind, parent_id, is_image, mime_type, size_bytes
    FROM drive_nodes
    WHERE user_id = ?
  `).all(userId) as Array<{
    id: string
    name: string
    kind: 'folder' | 'file'
    parent_id: string | null
    is_image: number
    mime_type: string | null
    size_bytes: number | null
  }>

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parent_id,
    isImage: row.is_image === 1,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? null,
  }))
}

const readHiveContribution = (userId: string): Record<string, number> => {
  const rows = db.prepare('SELECT device_id, contribution FROM hive_contribution WHERE user_id = ?').all(userId) as Array<{
    device_id: string
    contribution: number
  }>

  return Object.fromEntries(rows.map((row) => [row.device_id, row.contribution]))
}

const readTokenBalance = (userId: string) => {
  const row = db.prepare('SELECT token_balance FROM app_state WHERE user_id = ?').get(userId) as
    | { token_balance: number }
    | undefined
  return row?.token_balance ?? 0
}

const updateTokenBalance = (userId: string, nextValue: number) => {
  db.prepare('UPDATE app_state SET token_balance = ? WHERE user_id = ?').run(nextValue, userId)
}

const pushNotification = (userId: string, kind: string, title: string, body?: string) => {
  db.prepare(
    'INSERT INTO notifications (id, user_id, kind, title, body, read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
  ).run(`notif-${serial()}`, userId, kind, title, body ?? null, Date.now())
}

type ConvRow = { id: string; title: string }
type MsgRow = { id: string; role: string; content: string }

const readConversations = (userId: string) => {
  const convs = db.prepare(
    'SELECT id, title FROM fidus_conversations WHERE user_id = ? ORDER BY created_at DESC',
  ).all(userId) as ConvRow[]
  return convs.map((conv) => {
    const msgs = db.prepare(
      'SELECT id, role, content FROM fidus_messages WHERE conversation_id = ? ORDER BY created_at ASC',
    ).all(conv.id) as MsgRow[]
    return {
      id: conv.id,
      title: conv.title,
      messages: msgs.map((m) => ({ id: m.id, role: m.role, text: m.content })),
    }
  })
}

const createDefaultConversation = (userId: string) => {
  const convId = `conv-${serial()}`
  const msgId = `msg-${serial()}`
  const now = Date.now()
  db.prepare('INSERT INTO fidus_conversations (id, user_id, title, created_at) VALUES (?, ?, ?, ?)').run(convId, userId, 'New Chat', now)
  db.prepare('INSERT INTO fidus_messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    msgId, convId, userId, 'fidus', "Hello! I'm Fidus 🐱 What can I help you with today?", now,
  )
  return {
    id: convId,
    title: 'New Chat',
    messages: [{ id: msgId, role: 'fidus', text: "Hello! I'm Fidus 🐱 What can I help you with today?" }],
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'zenith-backend', timestamp: new Date().toISOString() })
})

app.post('/api/auth/signup', authLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid signup payload', details: parsed.error.flatten() })
    return
  }

  const email = parsed.data.email.toLowerCase()
  const username = parsed.data.username.toLowerCase()

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    res.status(409).json({ error: 'email_taken', message: 'An account with this email already exists. Try logging in instead.' })
    return
  }

  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existingUsername) {
    res.status(409).json({ error: 'username_taken', message: 'That username is already taken. Please choose another.' })
    return
  }

  const id = `user-${serial()}`
  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  // First user to sign up becomes admin; subsequent users are 'user'
  const existingAdminCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }).c
  const role = existingAdminCount === 0 ? 'admin' : 'user'
  db.prepare('INSERT INTO users (id, name, username, email, password, role) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    username,
    username,
    email,
    passwordHash,
    role,
  )

  // Seed user-specific defaults
  seedUserDefaults(id);

  const token = createAuthToken({ sub: id, name: username, username, email, role })

  res.status(201).json({ id, name: username, username, email, role, token })
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login payload', details: parsed.error.flatten() })
    return
  }

  const email = parsed.data.email.toLowerCase()
  const user = db
    .prepare('SELECT id, name, username, email, password, role FROM users WHERE email = ?')
    .get(email) as UserAccount | undefined

  if (!user) {
    res.status(401).json({ error: 'no_account', message: 'No account found with this email. Check for typos or sign up for a new account.' })
    return
  }

  const usesHash = user.password.startsWith('$2')
  const validCredentials = usesHash
    ? await bcrypt.compare(parsed.data.password, user.password)
    : user.password === parsed.data.password

  if (!validCredentials) {
    res.status(401).json({ error: 'wrong_password', message: 'Incorrect password. Please try again.' })
    return
  }

  // Migrate legacy plaintext records on successful login.
  if (!usesHash) {
    const upgradedHash = await bcrypt.hash(parsed.data.password, 12)
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(upgradedHash, user.id)
  }

  const role = user.role ?? 'user'
  const displayName = user.username || user.name
  const token = createAuthToken({ sub: user.id, name: displayName, username: displayName, email: user.email, role })
  res.json({ id: user.id, name: displayName, username: displayName, email: user.email, role, token })
})

app.post('/api/auth/logout', requireAuth, (_req: AuthRequest, res) => {
  // Token invalidation would require a blocklist (DB/Redis).
  // For now, logout is client-side only (clear localStorage).
  // Server validates token on each request; expired tokens are rejected.
  res.json({ message: 'Logout successful. Clear your token client-side.' })
});

app.get('/api/state', requireAuth, (_req: AuthRequest, res) => {
  const userId = _req.userId!
  res.json({
    devices: readDevices(userId),
    driveNodes: readDriveNodes(userId),
    hiveContribution: readHiveContribution(userId),
    tokenBalance: readTokenBalance(userId),
  })
})

app.get('/api/devices', requireAuth, (_req: AuthRequest, res) => {
  const userId = _req.userId!
  res.json({ devices: readDevices(userId) })
})

app.post('/api/devices', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const parsed = addDeviceSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid device payload', details: parsed.error.flatten() })
    return
  }

  const newDeviceId = `device-${serial()}`

  const tx = db.transaction(() => {
    if (parsed.data.role === 'Main System') {
      db.prepare(`UPDATE devices SET role = 'Worker' WHERE role = 'Main System' AND user_id = ?`).run(userId)
    }

    db.prepare(
      `INSERT INTO devices (id, user_id, name, type, status, role, compute_profile, storage_contribution_gb)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newDeviceId,
      userId,
      parsed.data.name,
      parsed.data.type,
      parsed.data.status,
      parsed.data.role,
      parsed.data.computeProfile,
      parsed.data.storageContributionGb,
    )

    db.prepare('INSERT INTO hive_contribution (device_id, user_id, contribution) VALUES (?, ?, 0)').run(newDeviceId, userId)
  })

  tx()

  const device = readDevices(userId).find((item) => item.id === newDeviceId)
  res.status(201).json({ device })
})

app.patch('/api/devices/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const existing = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!existing) {
    res.status(404).json({ error: 'Device not found' })
    return
  }

  const patchSchema = addDeviceSchema.partial()
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid device patch payload', details: parsed.error.flatten() })
    return
  }

  const tx = db.transaction(() => {
    if (parsed.data.role === 'Main System') {
      db.prepare(`UPDATE devices SET role = 'Worker' WHERE role = 'Main System' AND user_id = ?`).run(userId)
    }

    const updates: string[] = []
    const values: Array<string | number> = []

    if (parsed.data.name !== undefined) {
      updates.push('name = ?')
      values.push(parsed.data.name)
    }
    if (parsed.data.type !== undefined) {
      updates.push('type = ?')
      values.push(parsed.data.type)
    }
    if (parsed.data.status !== undefined) {
      updates.push('status = ?')
      values.push(parsed.data.status)
    }
    if (parsed.data.role !== undefined) {
      updates.push('role = ?')
      values.push(parsed.data.role)
    }
    if (parsed.data.computeProfile !== undefined) {
      updates.push('compute_profile = ?')
      values.push(parsed.data.computeProfile)
    }
    if (parsed.data.storageContributionGb !== undefined) {
      updates.push('storage_contribution_gb = ?')
      values.push(parsed.data.storageContributionGb)
    }

    if (updates.length > 0) {
      values.push(req.params.id as string)
      db.prepare(`UPDATE devices SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }
  })

  tx()

  const device = readDevices(userId).find((item) => item.id === req.params.id)
  res.json({ device })
})

app.delete('/api/devices/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const target = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!target) {
    res.status(404).json({ error: 'Device not found' })
    return
  }

  db.prepare('DELETE FROM devices WHERE id = ?').run(req.params.id)
  res.status(204).send()
})

app.get('/api/drive', requireAuth, (_req: AuthRequest, res) => {
  const userId = _req.userId!
  res.json({ driveNodes: readDriveNodes(userId) })
})

app.post('/api/drive', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const parsed = addDriveNodeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid drive payload', details: parsed.error.flatten() })
    return
  }

  const id = `${parsed.data.kind}-${serial()}`
  db.prepare(
    `INSERT INTO drive_nodes (id, user_id, name, kind, parent_id, is_image) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, parsed.data.name, parsed.data.kind, parsed.data.parentId, parsed.data.isImage ? 1 : 0)

  const node = readDriveNodes(userId).find((item) => item.id === id)
  res.status(201).json({ node })
})

app.patch('/api/drive/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const nodeExists = db.prepare('SELECT id FROM drive_nodes WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!nodeExists) {
    res.status(404).json({ error: 'Drive node not found' })
    return
  }

  const parsed = updateDriveNodeSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid drive patch payload', details: parsed.error.flatten() })
    return
  }

  const updates: string[] = []
  const values: Array<string | number | null> = []

  if (parsed.data.name !== undefined) {
    updates.push('name = ?')
    values.push(parsed.data.name)
  }
  if (parsed.data.parentId !== undefined) {
    updates.push('parent_id = ?')
    values.push(parsed.data.parentId)
  }
  if (parsed.data.isImage !== undefined) {
    updates.push('is_image = ?')
    values.push(parsed.data.isImage ? 1 : 0)
  }

  if (updates.length > 0) {
    values.push(req.params.id as string)
    db.prepare(`UPDATE drive_nodes SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }

  const node = readDriveNodes(userId).find((item) => item.id === req.params.id)
  res.json({ node })
})

app.post('/api/drive/upload', requireAuth, upload.array('files', 20), (req: AuthRequest, res) => {
  const userId = req.userId!
  const files = req.files as Express.Multer.File[] | undefined

  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files provided' })
    return
  }

  const parentId = (req.body?.parentId === 'null' || !req.body?.parentId) ? null : req.body.parentId as string
  const imagePattern = /\.(png|jpe?g|gif|webp|bmp)$/i
  const insertStmt = db.prepare(
    `INSERT INTO drive_nodes (id, user_id, name, kind, parent_id, is_image, mime_type, size_bytes, storage_path)
     VALUES (?, ?, ?, 'file', ?, ?, ?, ?, ?)`,
  )

  const nodes: DriveNode[] = []
  const tx = db.transaction(() => {
    for (const file of files) {
      const nodeId = `file-${serial()}`
      insertStmt.run(
        nodeId,
        userId,
        file.originalname,
        parentId,
        imagePattern.test(file.originalname) ? 1 : 0,
        file.mimetype,
        file.size,
        file.path,
      )
      nodes.push({
        id: nodeId,
        name: file.originalname,
        kind: 'file',
        parentId,
        isImage: imagePattern.test(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
      })
    }
  })
  tx()

  res.status(201).json({ nodes })
})

app.get('/api/drive/:id/content', (req: AuthRequest, res, next) => {
  // Accept token from Authorization header OR ?token= query param (for <img src> use)
  const qToken = typeof req.query.token === 'string' ? req.query.token : null
  if (qToken) {
    try {
      const decoded = jwt.verify(qToken, jwtSecret) as AuthTokenPayload
      req.userId = decoded.sub
      req.userRole = decoded.role ?? 'user'
      return next()
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' }); return
    }
  }
  return requireAuth(req, res, next)
}, (req: AuthRequest, res) => {
  const userId = req.userId!
  const row = db.prepare(
    'SELECT name, mime_type, storage_path FROM drive_nodes WHERE id = ? AND user_id = ? AND kind = \'file\'',
  ).get(req.params.id, userId) as { name: string; mime_type: string | null; storage_path: string | null } | undefined

  if (!row) {
    res.status(404).json({ error: 'File not found' })
    return
  }

  if (!row.storage_path) {
    res.status(410).json({ error: 'File content not available (metadata-only record)' })
    return
  }

  if (!fs.existsSync(row.storage_path)) {
    res.status(404).json({ error: 'File content missing from storage' })
    return
  }

  res.setHeader('Content-Disposition', `attachment; filename="${row.name}"`)
  if (row.mime_type) res.setHeader('Content-Type', row.mime_type)
  res.sendFile(row.storage_path)
})

app.delete('/api/drive/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const target = db.prepare('SELECT id FROM drive_nodes WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!target) {
    res.status(404).json({ error: 'Drive node not found' })
    return
  }

  const collect = (nodeId: string): Array<{ id: string; storage_path: string | null }> => {
    const children = db
      .prepare('SELECT id FROM drive_nodes WHERE parent_id = ? AND user_id = ?')
      .all(nodeId, userId) as Array<{ id: string }>
    const self = db.prepare('SELECT id, storage_path FROM drive_nodes WHERE id = ?').get(nodeId) as { id: string; storage_path: string | null }
    return [self, ...children.flatMap((child) => collect(child.id))]
  }

  const nodes = collect(req.params.id as string)
  const delStmt = db.prepare('DELETE FROM drive_nodes WHERE id = ?')
  const tx = db.transaction(() => {
    nodes.forEach((node) => delStmt.run(node.id))
  })
  tx()

  // Delete files from disk after DB transaction succeeds
  nodes.forEach((node) => {
    if (node.storage_path) {
      try { fs.unlinkSync(node.storage_path) } catch { /* already gone */ }
    }
  })

  res.status(204).send()
})

app.post('/api/hivemind/dispatch', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!
  const parsed = hiveSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid HiveMind payload', details: parsed.error.flatten() })
    return
  }

  const devices = readDevices(userId).filter((device) => device.status === 'Online')
  const withContribution = devices
    .map((device) => ({
      device,
      contribution: parsed.data.contribution[device.id] ?? 0,
    }))
    .filter((item) => item.contribution > 0)

  if (!withContribution.length) {
    res.status(400).json({ error: 'No online devices with contribution > 0' })
    return
  }

  const total = withContribution.reduce((sum, item) => sum + item.contribution, 0)
  const assignments = withContribution.map((item) => {
    const sharePercent = Number(((item.contribution / total) * 100).toFixed(1))
    const tokenReward = Number((sharePercent * 0.05).toFixed(2))

    return {
      deviceId: item.device.id,
      deviceName: item.device.name,
      sharePercent,
      tokenReward,
    }
  })

  const totalReward = assignments.reduce((sum, item) => sum + item.tokenReward, 0)
  const nextTokenBalance = Number((readTokenBalance(userId) + totalReward).toFixed(2))

  const tx = db.transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO hive_contribution (device_id, user_id, contribution) VALUES (?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET contribution = excluded.contribution`,
    )

    Object.entries(parsed.data.contribution).forEach(([deviceId, contribution]) => {
      upsert.run(deviceId, userId, contribution)
    })

    updateTokenBalance(userId, nextTokenBalance)
    pushNotification(
      userId,
      'hivemind_complete',
      `HiveMind job complete — +${totalReward.toFixed(2)} tokens earned`,
      `Distributed across ${assignments.length} device${assignments.length === 1 ? '' : 's'}.`,
    )
  })

  tx()

  // Call AI with the query and return the generated answer
  let answer = ''
  const apiKey = process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const { default: OpenAI } = await import('openai')
      const openai = new OpenAI({ apiKey })
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are Fidus, the Zenith AI. You are answering a query distributed across the HiveMind compute network. ' +
              'Be concise and technically precise.',
          },
          { role: 'user', content: parsed.data.query },
        ],
        max_tokens: 800,
        temperature: 0.7,
      })
      answer = completion.choices[0]?.message?.content ?? ''
    } catch {
      answer = ''
    }
  }
  if (!answer) {
    answer = buildFallbackResponse(parsed.data.query)
  }

  res.json({ assignments, totalReward, tokenBalance: nextTokenBalance, answer })
})

app.get('/api/conversations', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  let convs = readConversations(userId)
  if (convs.length === 0) {
    convs = [createDefaultConversation(userId)]
  }
  res.json({ conversations: convs })
})

app.post('/api/conversations', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const conv = createDefaultConversation(userId)
  res.status(201).json({ conversation: conv })
})

app.delete('/api/conversations/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const row = db.prepare('SELECT id FROM fidus_conversations WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  db.prepare('DELETE FROM fidus_conversations WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

app.patch('/api/conversations/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const { title } = req.body as { title?: string }
  if (typeof title !== 'string' || !title.trim()) { res.status(400).json({ error: 'title required' }); return }
  const row = db.prepare('SELECT id FROM fidus_conversations WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  db.prepare('UPDATE fidus_conversations SET title = ? WHERE id = ?').run(title.trim(), req.params.id)
  res.json({ ok: true })
})

app.post('/api/conversations/:id/messages', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const convId = req.params.id
  const conv = db.prepare('SELECT id, title FROM fidus_conversations WHERE id = ? AND user_id = ?').get(convId, userId) as { id: string; title: string } | undefined
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return }

  const { messages } = req.body as { messages?: Array<{ id: string; role: string; text: string }> }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array required' }); return
  }

  const now = Date.now()
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO fidus_messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  db.transaction(() => {
    for (const m of messages) {
      stmt.run(m.id, convId, userId, m.role, m.text, now)
    }
  })()

  // Auto-title: if still "New Chat", use first user message as title
  const userMsg = messages.find((m) => m.role === 'user')
  if (userMsg && conv.title === 'New Chat') {
    const autoTitle = userMsg.text.slice(0, 30).trim()
    db.prepare('UPDATE fidus_conversations SET title = ? WHERE id = ?').run(autoTitle, convId)
  }

  res.json({ ok: true })
})

app.get('/api/wallet', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const balance = readTokenBalance(userId)

  const txRows = db.prepare(`
    SELECT
      t.id, t.from_user_id, t.to_user_id, t.amount, t.note, t.created_at,
      COALESCE(NULLIF(uf.username, ''), uf.name) AS from_name,
      COALESCE(NULLIF(ut.username, ''), ut.name) AS to_name
    FROM token_transactions t
    JOIN users uf ON t.from_user_id = uf.id
    JOIN users ut ON t.to_user_id = ut.id
    WHERE t.from_user_id = ? OR t.to_user_id = ?
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(userId, userId) as Array<{
    id: string; from_user_id: string; to_user_id: string
    amount: number; note: string | null; created_at: number
    from_name: string; to_name: string
  }>

  const transactions = txRows.map((t) => ({
    id: t.id,
    direction: t.from_user_id === userId ? 'sent' : 'received',
    amount: t.amount,
    note: t.note ?? null,
    createdAt: t.created_at,
    counterpartName: t.from_user_id === userId ? t.to_name : t.from_name,
  }))

  res.json({ balance, transactions })
})

app.post('/api/wallet/send', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const { recipientUsername, amount, note } = req.body as {
    recipientUsername?: unknown; amount?: unknown; note?: unknown
  }

  if (typeof recipientUsername !== 'string' || !recipientUsername.trim()) {
    res.status(400).json({ error: 'recipientUsername is required' }); return
  }
  const parsedAmount = Number(amount)
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: 'amount must be a positive number' }); return
  }
  if (parsedAmount > 100000) {
    res.status(400).json({ error: 'amount exceeds maximum single transfer limit' }); return
  }

  const senderRow = db.prepare(`SELECT COALESCE(NULLIF(username, ''), name) as displayName FROM users WHERE id = ?`).get(userId) as { displayName: string } | undefined
  const recipientRow = db.prepare(`SELECT id, COALESCE(NULLIF(username, ''), name) as displayName FROM users WHERE LOWER(username) = ?`).get(recipientUsername.trim().toLowerCase()) as
    | { id: string; displayName: string } | undefined

  if (!recipientRow) {
    res.status(404).json({ error: 'no_account', message: 'No Zenith account found with that username.' }); return
  }
  if (recipientRow.id === userId) {
    res.status(400).json({ error: 'self_transfer', message: 'You cannot send tokens to yourself.' }); return
  }

  const senderBalance = readTokenBalance(userId)
  const rounded = Number(parsedAmount.toFixed(2))
  if (senderBalance < rounded) {
    res.status(400).json({ error: 'insufficient_balance', message: `Insufficient balance. You have ${senderBalance.toFixed(2)} tokens.` }); return
  }

  const tx = db.transaction(() => {
    updateTokenBalance(userId, Number((senderBalance - rounded).toFixed(2)))
    updateTokenBalance(recipientRow.id, Number((readTokenBalance(recipientRow.id) + rounded).toFixed(2)))
    db.prepare(
      'INSERT INTO token_transactions (id, from_user_id, to_user_id, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(`tx-${serial()}`, userId, recipientRow.id, rounded, typeof note === 'string' ? note.slice(0, 200) : null, Date.now())
    pushNotification(
      recipientRow.id,
      'token_received',
      `You received ${rounded.toFixed(2)} tokens`,
      `From @${senderRow?.displayName ?? 'someone'}${typeof note === 'string' && note.trim() ? ` — "${note.trim()}"` : ''}`,
    )
  })
  tx()

  res.json({
    ok: true,
    newBalance: Number((senderBalance - rounded).toFixed(2)),
    message: `Sent ${rounded.toFixed(2)} tokens to @${recipientRow.displayName}.`,
  })
})

// ── Account Settings ──────────────────────────────────────────────────────────
app.get('/api/account', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const row = db.prepare('SELECT id, name, username, email, role FROM users WHERE id = ?').get(userId) as
    | { id: string; name: string; username: string; email: string; role: string } | undefined
  if (!row) { res.status(404).json({ error: 'User not found' }); return }
  const displayName = row.username || row.name
  res.json({ id: row.id, name: displayName, username: displayName, email: row.email, role: row.role ?? 'user' })
})

app.patch('/api/account', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!
  const { name, username, email, currentPassword, newPassword } = req.body as {
    name?: unknown; username?: unknown; email?: unknown; currentPassword?: unknown; newPassword?: unknown
  }

  const user = db.prepare('SELECT id, name, email, password FROM users WHERE id = ?').get(userId) as UserAccount | undefined
  if (!user) { res.status(404).json({ error: 'User not found' }); return }

  // Password change requires verifying current password
  if (newPassword !== undefined) {
    if (typeof currentPassword !== 'string') {
      res.status(400).json({ error: 'currentPassword is required to set a new password' }); return
    }
    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) { res.status(401).json({ error: 'wrong_password', message: 'Current password is incorrect.' }); return }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' }); return
    }
  }

  const updates: string[] = []
  const values: Array<string> = []

  if (typeof name === 'string' && name.trim().length >= 2) {
    updates.push('name = ?')
    values.push(name.trim())
  }
  // Support username update (preferred over name)
  const newUsername = typeof username === 'string' ? username.trim().toLowerCase() : undefined
  if (newUsername && newUsername.length >= 2 && /^[a-zA-Z0-9_-]+$/.test(newUsername)) {
    const taken = db.prepare('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?').get(newUsername, userId)
    if (taken) { res.status(409).json({ error: 'username_taken', message: 'That username is already taken.' }); return }
    updates.push('username = ?', 'name = ?')
    values.push(newUsername, newUsername)
  }
  if (typeof email === 'string' && /\S+@\S+\.\S+/.test(email)) {
    const emailLower = email.toLowerCase()
    const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(emailLower, userId)
    if (taken) { res.status(409).json({ error: 'email_taken', message: 'That email is already in use.' }); return }
    updates.push('email = ?')
    values.push(emailLower)
  }
  if (typeof newPassword === 'string' && newPassword.length >= 8) {
    const hashed = await bcrypt.hash(newPassword, 12)
    updates.push('password = ?')
    values.push(hashed)
  }

  if (updates.length === 0) { res.status(400).json({ error: 'No valid fields to update' }); return }

  values.push(userId)
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  const updated = db.prepare('SELECT id, name, username, email FROM users WHERE id = ?').get(userId) as { id: string; name: string; username: string; email: string }
  const updatedDisplay = updated.username || updated.name
  res.json({ ok: true, name: updatedDisplay, username: updatedDisplay, email: updated.email })
})

// ── Notifications ─────────────────────────────────────────────────────────────
app.get('/api/notifications', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const rows = db.prepare(
    'SELECT id, kind, title, body, read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60',
  ).all(userId) as Array<{ id: string; kind: string; title: string; body: string | null; read: number; created_at: number }>
  res.json({
    notifications: rows.map((r) => ({ ...r, read: r.read === 1 })),
    unreadCount: rows.filter((r) => r.read === 0).length,
  })
})

app.patch('/api/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId)
  res.json({ ok: true })
})

app.delete('/api/notifications/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(req.params.id, userId)
  res.json({ ok: true })
})

// ── Dashboard stats ───────────────────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const devs = readDevices(userId)
  const nodes = readDriveNodes(userId)
  const balance = readTokenBalance(userId)
  const totalStorageGb = devs.reduce((s, d) => s + d.storageContributionGb, 0)
  const usedBytes = (nodes.filter((n) => n.sizeBytes != null) as Array<DriveNode & { sizeBytes: number }>)
    .reduce((s, n) => s + n.sizeBytes, 0)
  const fileCount = nodes.filter((n) => n.kind === 'file').length
  const onlineDevices = devs.filter((d) => d.status === 'Online').length
  const unread = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0').get(userId) as { c: number }).c
  const recentConvs = db.prepare(
    'SELECT title, created_at FROM fidus_conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 3',
  ).all(userId) as Array<{ title: string; created_at: number }>

  res.json({
    tokenBalance: balance,
    totalStorageGb,
    usedStorageBytes: usedBytes,
    fileCount,
    onlineDevices,
    totalDevices: devs.length,
    unreadNotifications: unread,
    recentConversations: recentConvs,
  })
})

// ── Device heartbeat ──────────────────────────────────────────────────────────
app.post('/api/devices/:id/ping', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const deviceRow = db.prepare('SELECT id FROM devices WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!deviceRow) { res.status(404).json({ error: 'Device not found' }); return }

  const now = Date.now()
  db.prepare(
    `INSERT INTO device_pings (device_id, user_id, last_ping) VALUES (?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET last_ping = excluded.last_ping`,
  ).run(req.params.id, userId, now)

  // Mark online
  db.prepare("UPDATE devices SET status = 'Online' WHERE id = ? AND user_id = ?").run(req.params.id, userId)

  // Store system stats if provided by Electron heartbeat
  const {
    hostname, platform, cpuModel, cpuCores,
    cpuPercent, ramUsedGb, ramTotalGb, diskUsedGb, diskTotalGb,
    electronDeviceId,
  } = req.body as {
    hostname?: unknown; platform?: unknown; cpuModel?: unknown; cpuCores?: unknown
    cpuPercent?: unknown; ramUsedGb?: unknown; ramTotalGb?: unknown
    diskUsedGb?: unknown; diskTotalGb?: unknown; electronDeviceId?: unknown
  }

  const hasStats = typeof cpuPercent === 'number' && typeof ramUsedGb === 'number'
  if (hasStats) {
    db.prepare(`
      UPDATE devices SET
        hostname = ?, platform = ?, cpu_model = ?, cpu_cores = ?,
        cpu_percent = ?, ram_used_gb = ?, ram_total_gb = ?,
        disk_used_gb = ?, disk_total_gb = ?, last_stats_at = ?,
        electron_device_id = COALESCE(?, electron_device_id)
      WHERE id = ? AND user_id = ?
    `).run(
      typeof hostname === 'string' ? hostname : null,
      typeof platform === 'string' ? platform : null,
      typeof cpuModel === 'string' ? cpuModel : null,
      typeof cpuCores === 'number' ? cpuCores : null,
      cpuPercent,
      ramUsedGb,
      typeof ramTotalGb === 'number' ? ramTotalGb : null,
      typeof diskUsedGb === 'number' ? diskUsedGb : null,
      typeof diskTotalGb === 'number' ? diskTotalGb : null,
      now,
      typeof electronDeviceId === 'string' ? electronDeviceId : null,
      req.params.id, userId,
    )
  }

  res.json({ ok: true, lastPing: now })
})

// Register or find the Electron device for this machine
app.post('/api/devices/register-electron', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const {
    electronDeviceId, hostname, platform, cpuModel, cpuCores, storageContributionGb,
  } = req.body as {
    electronDeviceId?: unknown; hostname?: unknown; platform?: unknown
    cpuModel?: unknown; cpuCores?: unknown; storageContributionGb?: unknown
  }

  if (typeof electronDeviceId !== 'string' || !electronDeviceId.trim()) {
    res.status(400).json({ error: 'electronDeviceId required' }); return
  }

  // Check if a device with this electronDeviceId already exists
  const existing = db.prepare(
    'SELECT id FROM devices WHERE electron_device_id = ? AND user_id = ?',
  ).get(electronDeviceId, userId) as { id: string } | undefined

  if (existing) {
    res.json({ deviceId: existing.id, created: false })
    return
  }

  // Create a new device for this machine
  const deviceName = typeof hostname === 'string' && hostname.trim()
    ? hostname.trim()
    : `Desktop ${Math.floor(Math.random() * 900) + 100}`

  const deviceId = `device-${serial()}`
  const storageGb = typeof storageContributionGb === 'number' && storageContributionGb > 0
    ? Math.min(Math.round(storageContributionGb), 10000)
    : 100

  db.prepare(`
    INSERT INTO devices
      (id, user_id, name, type, status, role, compute_profile, storage_contribution_gb,
       electron_device_id, hostname, platform, cpu_model, cpu_cores)
    VALUES (?, ?, ?, 'Stationary', 'Online', 'Worker', 'Balanced Worker', ?, ?, ?, ?, ?, ?)
  `).run(
    deviceId, userId,
    deviceName.slice(0, 60),
    storageGb,
    electronDeviceId,
    typeof hostname === 'string' ? hostname.slice(0, 120) : null,
    typeof platform === 'string' ? platform : null,
    typeof cpuModel === 'string' ? cpuModel.slice(0, 120) : null,
    typeof cpuCores === 'number' ? cpuCores : null,
  )

  res.status(201).json({ deviceId, created: true })
})

// Sweep stale devices (>5 min since last ping → Offline)
app.post('/api/devices/sweep', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const staleThreshold = Date.now() - 5 * 60 * 1000
  const stale = db.prepare(
    `SELECT d.id FROM devices d
     LEFT JOIN device_pings dp ON d.id = dp.device_id
     WHERE d.user_id = ? AND d.status = 'Online'
     AND (dp.last_ping IS NULL OR dp.last_ping < ?)`,
  ).all(userId, staleThreshold) as Array<{ id: string }>

  if (stale.length > 0) {
    const ids = stale.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(', ')
    db.prepare(`UPDATE devices SET status = 'Offline' WHERE id IN (${placeholders})`).run(...ids)
  }

  res.json({ swept: stale.length })
})

// ── Fidus Memory ──────────────────────────────────────────────────────────────
app.get('/api/fidus/memories', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const rows = db.prepare(
    'SELECT id, content, created_at FROM fidus_memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
  ).all(userId) as Array<{ id: string; content: string; created_at: number }>
  res.json({ memories: rows })
})

app.post('/api/fidus/memories', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const { content } = req.body as { content?: unknown }
  if (typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content is required' }); return
  }
  const id = `mem-${serial()}`
  db.prepare('INSERT INTO fidus_memories (id, user_id, content, created_at) VALUES (?, ?, ?, ?)').run(
    id, userId, content.trim().slice(0, 500), Date.now(),
  )
  res.status(201).json({ memory: { id, content: content.trim().slice(0, 500), createdAt: Date.now() } })
})

app.delete('/api/fidus/memories/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  db.prepare('DELETE FROM fidus_memories WHERE id = ? AND user_id = ?').run(req.params.id, userId)
  res.json({ ok: true })
})

// ── Fidus AI Chat (SSE streaming) ─────────────────────────────────────────────
app.post('/api/fidus/chat', requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!
  const { conversationId, messages } = req.body as {
    conversationId?: unknown
    messages?: Array<{ role: string; text: string }>
  }

  if (typeof conversationId !== 'string' || !conversationId.trim()) {
    res.status(400).json({ error: 'conversationId required' }); return
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array required' }); return
  }

  // Verify the conversation belongs to this user
  const conv = db.prepare(
    'SELECT id FROM fidus_conversations WHERE id = ? AND user_id = ?',
  ).get(conversationId, userId)
  if (!conv) { res.status(404).json({ error: 'Conversation not found' }); return }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no') // nginx: disable buffering
  res.flushHeaders()

  const sendChunk = (chunk: string) => {
    res.write(`data: ${JSON.stringify({ chunk, done: false })}\n\n`)
  }
  const sendDone = (fullText: string) => {
    res.write(`data: ${JSON.stringify({ chunk: '', done: true, fullText })}\n\n`)
    res.end()
  }

  // Load user memories to inject into the system prompt
  const memories = db.prepare(
    'SELECT content FROM fidus_memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
  ).all(userId) as Array<{ content: string }>
  const memoryBlock = memories.length > 0
    ? '\n\nThings to always remember about this user:\n' + memories.map((m) => `- ${m.content}`).join('\n')
    : ''

  const systemPrompt =
    'You are Fidus, a helpful AI assistant built into the Zenith desktop platform. ' +
    'You are concise, technically sharp, and friendly. ' +
    'Help the user with their Zenith workspace, code, planning, and any other questions.' +
    memoryBlock

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Fallback: smart canned response (no API key configured)
    const userText = messages.at(-1)?.text ?? ''
    const fallback = buildFallbackResponse(userText)
    // Stream it word by word for a nice effect
    const words = fallback.split(' ')
    for (let i = 0; i < words.length; i++) {
      sendChunk((i === 0 ? '' : ' ') + words[i])
      await new Promise<void>((r) => setTimeout(r, 30))
    }
    sendDone(fallback)
    return
  }

  // Call OpenAI
  try {
    const { default: OpenAI } = await import('openai')
    const openai = new OpenAI({ apiKey })

    // Convert our message format to OpenAI format
    const oaiMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]
    for (const m of messages) {
      if (m.role === 'user') oaiMessages.push({ role: 'user', content: m.text })
      else if (m.role === 'fidus' || m.role === 'assistant') oaiMessages.push({ role: 'assistant', content: m.text })
    }

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    const stream = await openai.chat.completions.create({
      model,
      messages: oaiMessages,
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    })

    let fullText = ''
    for await (const part of stream) {
      const chunk = part.choices[0]?.delta?.content ?? ''
      if (chunk) {
        fullText += chunk
        sendChunk(chunk)
      }
    }
    sendDone(fullText)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OpenAI error'
    res.write(`data: ${JSON.stringify({ chunk: '', done: true, fullText: `Sorry, I ran into an error: ${msg}` })}\n\n`)
    res.end()
  }
})

function buildFallbackResponse(userText: string): string {
  const t = userText.toLowerCase()
  if (t.includes('hello') || t.includes('hi') || t.includes('hey')) {
    return "Hello! I'm Fidus, your Zenith AI assistant. I'm running in offline mode right now — connect an OpenAI API key in your backend `.env` to enable full AI responses. How can I help you today?"
  }
  if (t.includes('drive') || t.includes('file') || t.includes('upload')) {
    return 'Zenith Drive supports folders, file uploads (up to 50 MB each), and image previews. You can create folders, upload files, rename, and download directly from the Drive view.'
  }
  if (t.includes('device') || t.includes('computer') || t.includes('laptop')) {
    return 'The Devices view shows all machines registered to your Zenith account. When running the Zenith desktop app, your machine reports live CPU, RAM, and disk stats every 30 seconds.'
  }
  if (t.includes('token') || t.includes('wallet')) {
    return 'Zenith Tokens power the HiveMind compute network. You can send tokens to other users from the Wallet view, and earn them by contributing compute through HiveMind.'
  }
  if (t.includes('openai') || t.includes('api key') || t.includes('model') || t.includes('gpt')) {
    return 'To enable full AI responses, set `OPENAI_API_KEY` in your backend `.env` file and restart the server. I support any OpenAI-compatible model — set `OPENAI_MODEL` to override the default (`gpt-4o-mini`).'
  }
  if (t.includes('hive') || t.includes('compute') || t.includes('ai task')) {
    return 'HiveMind distributes AI tasks across your registered devices, weighted by their compute profile. You can toggle HiveMind on/off and adjust contribution percentages per device in the HiveMind view.'
  }
  return `You asked: "${userText.slice(0, 80)}". I'm running in offline mode — add an OpenAI API key to your backend to get real AI responses. I can still help you navigate Zenith!`
}

// ── Admin endpoints ──────────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAuth, requireAdmin, (_req: AuthRequest, res) => {
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c
  const totalDevices = (db.prepare('SELECT COUNT(*) as c FROM devices').get() as { c: number }).c
  const onlineDevices = (db.prepare("SELECT COUNT(*) as c FROM devices WHERE status = 'Online'").get() as { c: number }).c
  const totalFiles = (db.prepare("SELECT COUNT(*) as c FROM drive_nodes WHERE kind = 'file'").get() as { c: number }).c
  const totalFolders = (db.prepare("SELECT COUNT(*) as c FROM drive_nodes WHERE kind = 'folder'").get() as { c: number }).c
  const totalConversations = (db.prepare('SELECT COUNT(*) as c FROM fidus_conversations').get() as { c: number }).c
  const totalMessages = (db.prepare('SELECT COUNT(*) as c FROM fidus_messages').get() as { c: number }).c
  const totalStorageGb = (db.prepare('SELECT COALESCE(SUM(storage_contribution_gb), 0) as s FROM devices').get() as { s: number }).s
  const users = db.prepare(`SELECT id, COALESCE(NULLIF(username, ''), name) as name, email, role FROM users ORDER BY rowid ASC LIMIT 100`).all() as Array<{ id: string; name: string; email: string; role: string }>
  res.json({ totalUsers, totalDevices, onlineDevices, totalFiles, totalFolders, totalConversations, totalMessages, totalStorageGb, users })
})

app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  const { role } = req.body as { role?: unknown }
  if (role !== 'admin' && role !== 'user') {
    res.status(400).json({ error: 'role must be "admin" or "user"' }); return
  }
  if (req.params.id === req.userId) {
    res.status(400).json({ error: 'Cannot change your own role' }); return
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
  if (!user) { res.status(404).json({ error: 'User not found' }); return }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id)
  res.json({ ok: true })
})

app.get('/api/updates/latest', (_req, res) => {
  const version = process.env.APP_LATEST_VERSION ?? '0.1.0'
  const repoBase = 'https://github.com/ZenithObscure/Zenith-app-server'
  res.json({
    channel: 'stable',
    latestVersion: version,
    releasesUrl: `${repoBase}/releases`,
    assetBaseUrl: `${repoBase}/releases/download/v${version}`,
    notes: 'Use this endpoint in Electron updater checks and compare with app version.',
  })
})

// Serve frontend static files in production
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../../dist')
app.use(express.static(distPath))

// Client-side routing fallback: serve index.html for non-API routes
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// Global error handler
app.use((err: Error & {status?: number}, _req: Request, res: Response) => {
  const isDev = process.env.NODE_ENV !== 'production'
  const statusCode = err.status ?? 500
  const message = isDev ? err.message : 'Internal server error'

  console.error(`[${statusCode}]`, err.message)
  res.status(statusCode).json({ error: message })
})

app.listen(port, () => {
  console.log(`Zenith backend running on http://localhost:${port}`)
  console.log(`SQLite path: ${dbPath}`)
})
