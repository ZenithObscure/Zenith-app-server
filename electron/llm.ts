/**
 * electron/llm.ts — Local AI engine for Fidus
 *
 * Responsibilities:
 *   1. Locate the bundled compressed model (fidus.gguf.gz in resources)
 *   2. First-run gzip decompression to userData with progress callbacks
 *   3. Lazy model loading via node-llama-cpp (only when first chat is sent)
 *   4. Streaming token-by-token inference
 *
 * The model file lives at:
 *   Dev:  <project>/electron/resources/model/fidus.gguf.gz
 *   Prod: <resourcesPath>/model/fidus.gguf.gz
 *
 * After decompression it lives at:
 *   <userData>/models/fidus.gguf
 */

import path from 'path'
import fs from 'fs'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { app } from 'electron'

// ─── Resolve paths ────────────────────────────────────────────────────────────

const __dirname_llm = path.dirname(new URL(import.meta.url).pathname)

export function getModelUnpackedPath(): string {
  return path.join(app.getPath('userData'), 'models', 'fidus.gguf')
}

export function getModelPackedPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'model', 'fidus.gguf.gz')
  }
  // Dev: compiled output is in electron-out/, go up one level to find source tree
  return path.join(__dirname_llm, '..', 'electron', 'resources', 'model', 'fidus.gguf.gz')
}

export function isModelUnpacked(): boolean {
  return fs.existsSync(getModelUnpackedPath())
}

export function isModelBundled(): boolean {
  return fs.existsSync(getModelPackedPath())
}

// ─── Decompression ────────────────────────────────────────────────────────────

export type ProgressFn = (progress: number, message: string) => void

/**
 * Decompress the bundled model to userData. No-op if already decompressed.
 * Calls `onProgress(0–100, message)` during extraction.
 */
export async function decompressModel(onProgress?: ProgressFn): Promise<void> {
  const dest = getModelUnpackedPath()
  if (fs.existsSync(dest)) return

  const src = getModelPackedPath()
  if (!fs.existsSync(src)) {
    throw new Error(
      'Bundled model not found. Run: npm run download-model, then rebuild.',
    )
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true })

  const compressedBytes = fs.statSync(src).size
  let processed = 0

  onProgress?.(0, 'Extracting AI model…')

  const readable = fs.createReadStream(src)
  readable.on('data', (chunk: Buffer) => {
    processed += chunk.length
    const pct = Math.min(99, Math.round((processed / compressedBytes) * 100))
    onProgress?.(pct, `Extracting AI model… ${pct}%`)
  })

  try {
    await pipeline(readable, createGunzip(), fs.createWriteStream(dest))
    onProgress?.(100, 'Extraction complete')
  } catch (err) {
    // Remove the partial file so the next launch retries
    try { fs.unlinkSync(dest) } catch { /* ignore */ }
    throw err
  }
}

// ─── Session management ───────────────────────────────────────────────────────

export type FidusMessage = { role: 'user' | 'fidus' | 'system'; text: string }

const SYSTEM_PROMPT =
  'You are Fidus, a helpful AI assistant inside Zenith — a distributed computing ' +
  'platform for managing devices, Drive storage, and AI workloads across a HiveMind network. ' +
  'Give concise, practical responses. Avoid unnecessary preamble.'

// Lazy-loaded singletons — shared across all IPC calls
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _llama: any | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _model: any | null = null

type ActiveSession = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any
  convId: string
}

let _activeSession: ActiveSession | null = null
let _initPromise: Promise<void> | null = null

/**
 * Lazy-initialise llama + model. Safe to call multiple times — returns the
 * same promise if already loading.
 */
async function ensureLlamaAndModel(onProgress?: ProgressFn): Promise<void> {
  if (_model) return
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    onProgress?.(0, 'Starting AI engine…')
    const { getLlama } = await import('node-llama-cpp')
    _llama = await getLlama()

    onProgress?.(10, 'Loading AI model into memory…')
    _model = await _llama.loadModel({ modelPath: getModelUnpackedPath() })

    onProgress?.(100, 'AI model ready')
  })()
    .catch((err) => {
      _initPromise = null
      throw err
    })
    .finally(() => {
      _initPromise = null
    })

  return _initPromise
}

/**
 * Return the chat session for the given conversation, creating or resetting
 * it as needed. Each new convId starts a fresh context (clean KV cache).
 */
async function getSession(convId: string, onProgress?: ProgressFn): Promise<ActiveSession['session']> {
  await ensureLlamaAndModel(onProgress)

  if (_activeSession?.convId === convId) {
    return _activeSession.session
  }

  // Dispose old context to free VRAM/RAM
  if (_activeSession) {
    await _activeSession.context.dispose().catch(() => { /* ignore */ })
  }

  const { LlamaChatSession } = await import('node-llama-cpp')
  const context = await _model.createContext({ contextSize: 2048 })
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: SYSTEM_PROMPT,
  })

  _activeSession = { session, context, convId }
  return session
}

/**
 * Run a streaming inference request.
 *
 * @param messages - Full conversation history (last message must be role 'user')
 * @param convId   - Conversation ID; switching convId resets the LLM context
 * @param onToken  - Called with each text chunk as it's generated
 * @param onProgress - Called during model init (decompression / loading)
 * @returns The full response string
 */
export async function streamChat(
  messages: FidusMessage[],
  convId: string,
  onToken: (chunk: string) => void,
  onProgress?: ProgressFn,
): Promise<string> {
  // Ensure the model is decompressed first
  await decompressModel(onProgress)

  // Lazy-load llama + model
  const session = await getSession(convId, onProgress)

  const lastMsg = messages.at(-1)
  if (!lastMsg || lastMsg.role !== 'user') return ''

  const fullText: string = await session.prompt(lastMsg.text, {
    onTextChunk: onToken,
    maxTokens: 512,
  })

  return fullText
}
