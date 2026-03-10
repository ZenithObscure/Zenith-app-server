import bcrypt from 'bcryptjs'
import cors from 'cors'
import Database from 'better-sqlite3'
import express, { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import { fileURLToPath } from 'node:url'
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
}

type DriveNode = {
  id: string
  name: string
  kind: 'folder' | 'file'
  parentId: string | null
  isImage: boolean
}

type UserAccount = {
  id: string
  name: string
  email: string
  password: string
}

type AuthTokenPayload = {
  sub: string
  name: string
  email: string
}

type AuthRequest = Request & {
  userId?: string
}

const app = express()
const port = Number(process.env.PORT ?? 8787)
const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'backend/data/zenith.db')
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
  name: z.string().min(2),
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
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

const initSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
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
  `)

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

const readDevices = (userId: string): DeviceInfo[] => {
  const rows = db.prepare(`
    SELECT id, name, type, status, role, compute_profile, storage_contribution_gb
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
  }>

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    role: row.role,
    computeProfile: row.compute_profile,
    storageContributionGb: row.storage_contribution_gb,
  }))
}

const readDriveNodes = (userId: string): DriveNode[] => {
  const rows = db.prepare(`
    SELECT id, name, kind, parent_id, is_image
    FROM drive_nodes
    WHERE user_id = ?
  `).all(userId) as Array<{
    id: string
    name: string
    kind: 'folder' | 'file'
    parent_id: string | null
    is_image: number
  }>

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parent_id,
    isImage: row.is_image === 1,
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
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existing) {
    res.status(409).json({ error: 'email_taken', message: 'An account with this email already exists. Try logging in instead.' })
    return
  }

  const id = `user-${serial()}`
  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  db.prepare('INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)').run(
    id,
    parsed.data.name,
    email,
    passwordHash,
  )

  // Seed user-specific defaults
  seedUserDefaults(id);

  const token = createAuthToken({ sub: id, name: parsed.data.name, email })

  res.status(201).json({ id, name: parsed.data.name, email, token })
})

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login payload', details: parsed.error.flatten() })
    return
  }

  const email = parsed.data.email.toLowerCase()
  const user = db
    .prepare('SELECT id, name, email, password FROM users WHERE email = ?')
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

  const token = createAuthToken({ sub: user.id, name: user.name, email: user.email })
  res.json({ id: user.id, name: user.name, email: user.email, token })
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

app.delete('/api/drive/:id', requireAuth, (req: AuthRequest, res) => {
  const userId = req.userId!
  const target = db.prepare('SELECT id FROM drive_nodes WHERE id = ? AND user_id = ?').get(req.params.id, userId)
  if (!target) {
    res.status(404).json({ error: 'Drive node not found' })
    return
  }

  const collect = (nodeId: string): string[] => {
    const children = db
      .prepare('SELECT id FROM drive_nodes WHERE parent_id = ? AND user_id = ?')
      .all(nodeId, userId) as Array<{ id: string }>
    return [nodeId, ...children.flatMap((child) => collect(child.id))]
  }

  const ids = collect(req.params.id as string)
  const delStmt = db.prepare('DELETE FROM drive_nodes WHERE id = ?')
  const tx = db.transaction(() => {
    ids.forEach((id) => delStmt.run(id))
  })
  tx()

  res.status(204).send()
})

app.post('/api/hivemind/dispatch', requireAuth, (req: AuthRequest, res) => {
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
  })

  tx()

  res.json({ assignments, totalReward, tokenBalance: nextTokenBalance })
})

app.get('/api/updates/latest', (_req, res) => {
  res.json({
    channel: 'stable',
    latestVersion: process.env.APP_LATEST_VERSION ?? '0.1.0',
    releasesUrl: 'https://github.com/ZenithObscure/Zenith-app/releases',
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
