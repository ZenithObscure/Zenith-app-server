#!/usr/bin/env node
/**
 * Download and gzip-compress the Fidus local AI model for bundling
 * inside the Electron app package.
 *
 * Usage:
 *   npm run download-model
 *   MODEL_URL=https://... npm run download-model   # override model
 *
 * Output:
 *   electron/resources/model/fidus.gguf.gz
 *
 * Default model: Qwen2.5-0.5B-Instruct Q4_K_M (~320 MB GGUF)
 *   A small but surprisingly capable 0.5B parameter instruction model.
 *   Runs on CPU in under 2 seconds per response on modern hardware.
 *
 * Alternative models (set MODEL_URL):
 *   - TinyLlama 1.1B Q4_K_M (~638 MB):
 *       https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
 *   - Qwen2.5-1.5B Q4_K_M (~940 MB, better quality):
 *       https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf
 */

import { createWriteStream, mkdirSync, existsSync, statSync, unlinkSync } from 'fs'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const MODEL_URL =
  process.env.MODEL_URL ??
  'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf'

const OUT_DIR = path.join(ROOT, 'electron', 'resources', 'model')
const OUT_PATH = path.join(OUT_DIR, 'fidus.gguf.gz')

// ─── Already downloaded? ───────────────────────────────────────────────────────
if (existsSync(OUT_PATH)) {
  const sizeMb = (statSync(OUT_PATH).size / 1024 / 1024).toFixed(1)
  console.log(`✓ Model already exists (${sizeMb} MB):`)
  console.log('  ', OUT_PATH)
  console.log()
  console.log('Delete the file and re-run to re-download.')
  process.exit(0)
}

// ─── Download ─────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true })

console.log('Fidus AI model download')
console.log('─────────────────────────────────────────────────────────────────')
console.log('Source :', MODEL_URL)
console.log('Output :', OUT_PATH)
console.log()

const response = await fetch(MODEL_URL, {
  headers: { 'User-Agent': 'zenith-app-build/1.0' },
  redirect: 'follow',
})

if (!response.ok || !response.body) {
  console.error(`Download failed: HTTP ${response.status} ${response.statusText}`)
  process.exit(1)
}

const totalBytes = Number(response.headers.get('content-length') ?? '0')
const totalMb = totalBytes > 0 ? (totalBytes / 1024 / 1024).toFixed(0) : '?'
let downloaded = 0
let lastLogPct = -1

// Track download progress
const progressTransform = new TransformStream({
  transform(chunk, controller) {
    downloaded += chunk.byteLength
    if (totalBytes > 0) {
      const pct = Math.round((downloaded / totalBytes) * 100)
      if (pct >= lastLogPct + 5) {
        const mb = (downloaded / 1024 / 1024).toFixed(0)
        process.stdout.write(`\r  ${pct.toString().padStart(3)}%  ${mb} / ${totalMb} MB `)
        lastLogPct = pct
      }
    } else {
      const mb = (downloaded / 1024 / 1024).toFixed(0)
      process.stdout.write(`\r  ${mb} MB downloaded`)
    }
    controller.enqueue(chunk)
  },
})

// Convert Web ReadableStream → Node.js Readable
const nodeStream = Readable.fromWeb(response.body.pipeThrough(progressTransform))

console.log('Downloading and compressing (gzip level 6)…\n')

const gzip = createGzip({ level: 6 })
const outFile = createWriteStream(OUT_PATH)

try {
  await pipeline(nodeStream, gzip, outFile)
} catch (err) {
  // Clean up partial file
  try { unlinkSync(OUT_PATH) } catch { /* ignore */ }
  console.error('\n\nDownload failed:', err)
  process.exit(1)
}

const outMb = (statSync(OUT_PATH).size / 1024 / 1024).toFixed(1)
const inMb = totalBytes > 0 ? (totalBytes / 1024 / 1024).toFixed(0) : '?'

console.log(`\n\n✓ Done!  ${inMb} MB raw → ${outMb} MB compressed`)
console.log()
console.log('Next steps:')
console.log('  npm run build              # rebuild frontend')
console.log('  npm run build:electron-main # rebuild Electron main process')
console.log('  npx electron-builder       # package the app with model bundled')
