// Tiny zero-dependency API server for the portfolio.
// - /api/chat   streams replies from any OpenAI-compatible LLM (Ollama by default)
// - /api/stt    speech-to-text via an OpenAI-compatible /audio/transcriptions (Speaches)
// - /api/tts    text-to-speech via an OpenAI-compatible /audio/speech (Speaches/Kokoro)
// - /api/health tells the client which self-hosted pieces are reachable
// It also serves the built site from ../dist in production.
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSystemPrompt } from './prompt.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadDotEnv(path.join(root, '.env'))

const PORT = Number(process.env.PORT || 8787)
const LLM_BASE_URL = trimSlash(process.env.LLM_BASE_URL || 'http://localhost:11434/v1')
const LLM_MODEL = process.env.LLM_MODEL || 'llama3.2:3b'
const LLM_API_KEY = process.env.LLM_API_KEY || 'ollama'
const SPEECH_BASE_URL = trimSlash(process.env.SPEECH_BASE_URL || '')
const STT_MODEL = process.env.STT_MODEL || 'Systran/faster-whisper-small'
const TTS_MODEL = process.env.TTS_MODEL || 'speaches-ai/Kokoro-82M-v1.0-ONNX'
const TTS_VOICE = process.env.TTS_VOICE || 'af_heart'

const profile = JSON.parse(readFileSync(path.join(root, 'content/profile.json'), 'utf8'))
const systemPrompt = buildSystemPrompt(profile)
const distDir = path.join(root, 'dist')

const MAX_BODY = 10 * 1024 * 1024
const MAX_TURNS = 16
const MAX_CHARS = 2000

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname === '/api/health' && req.method === 'GET') return health(res)
    if (url.pathname === '/api/chat' && req.method === 'POST') return chat(req, res)
    if (url.pathname === '/api/stt' && req.method === 'POST') return stt(req, res)
    if (url.pathname === '/api/tts' && req.method === 'POST') return tts(req, res)
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' })
    return serveStatic(url.pathname, res)
  } catch (err) {
    console.error(err)
    if (!res.headersSent) json(res, 500, { error: 'internal error' })
    else res.end()
  }
})

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`)
  console.log(`[api] llm    ${LLM_BASE_URL} (${LLM_MODEL})`)
  console.log(`[api] speech ${SPEECH_BASE_URL || 'browser fallback'}`)
})

async function health(res) {
  const [llm, speech] = await Promise.all([
    ping(`${LLM_BASE_URL}/models`, { Authorization: `Bearer ${LLM_API_KEY}` }),
    SPEECH_BASE_URL ? ping(`${SPEECH_BASE_URL}/models`) : Promise.resolve(false),
  ])
  json(res, 200, { llm, speech, model: LLM_MODEL, sttModel: STT_MODEL, ttsModel: TTS_MODEL })
}

async function chat(req, res) {
  const body = JSON.parse((await readBody(req)).toString('utf8') || '{}')
  const history = Array.isArray(body.messages) ? body.messages : []
  const messages = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
  if (!messages.length) return json(res, 400, { error: 'messages required' })

  const mode = body.mode === 'voice' ? 'voice' : 'chat'
  const system = mode === 'voice'
    ? systemPrompt + '\n\nYou are speaking out loud. Reply in one to three short sentences, no markdown, no lists.'
    : systemPrompt

  const ac = new AbortController()
  res.on('close', () => ac.abort())

  let upstream
  try {
    upstream = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        stream: true,
        temperature: 0.6,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    })
  } catch {
    return json(res, 503, { error: 'llm unreachable' })
  }
  if (!upstream.ok || !upstream.body) {
    return json(res, 502, { error: `llm error ${upstream.status}` })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })

  // Re-emit only the text deltas so the client stays provider-agnostic.
  // Some local models wrap reasoning in <think>…</think>; drop it.
  const decoder = new TextDecoder()
  const strip = thinkStripper()
  let buf = ''
  for await (const chunk of upstream.body) {
    buf += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      let delta = ''
      try {
        delta = JSON.parse(data).choices?.[0]?.delta?.content || ''
      } catch {
        continue
      }
      const out = strip(delta)
      if (out) res.write(`data: ${JSON.stringify({ delta: out })}\n\n`)
    }
  }
  const rest = strip(null)
  if (rest) res.write(`data: ${JSON.stringify({ delta: rest })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

async function stt(req, res) {
  if (!SPEECH_BASE_URL) return json(res, 501, { error: 'speech server not configured' })
  const audio = await readBody(req)
  const type = req.headers['content-type'] || 'audio/webm'
  const ext = type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : type.includes('mp4') ? 'mp4' : 'webm'
  const form = new FormData()
  form.append('file', new Blob([audio], { type }), `speech.${ext}`)
  form.append('model', STT_MODEL)
  form.append('response_format', 'json')
  try {
    const r = await fetch(`${SPEECH_BASE_URL}/audio/transcriptions`, { method: 'POST', body: form })
    if (!r.ok) return json(res, 502, { error: `stt error ${r.status}` })
    const out = await r.json()
    json(res, 200, { text: (out.text || '').trim() })
  } catch {
    json(res, 503, { error: 'speech server unreachable' })
  }
}

async function tts(req, res) {
  if (!SPEECH_BASE_URL) return json(res, 501, { error: 'speech server not configured' })
  const { text } = JSON.parse((await readBody(req)).toString('utf8') || '{}')
  if (!text || typeof text !== 'string') return json(res, 400, { error: 'text required' })
  try {
    const r = await fetch(`${SPEECH_BASE_URL}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text.slice(0, 1200), response_format: 'mp3' }),
    })
    if (!r.ok || !r.body) return json(res, 502, { error: `tts error ${r.status}` })
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' })
    for await (const chunk of r.body) res.write(chunk)
    res.end()
  } catch {
    if (!res.headersSent) json(res, 503, { error: 'speech server unreachable' })
    else res.end()
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

async function serveStatic(pathname, res) {
  if (!existsSync(distDir)) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    return res.end('API is running. Use `npm run dev` for the site, or `npm run build` to serve it from here.')
  }
  const safe = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = path.join(distDir, safe)
  if (!file.startsWith(distDir)) file = path.join(distDir, 'index.html')
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
  } catch {
    file = path.join(distDir, 'index.html')
  }
  const data = await readFile(file)
  const ext = path.extname(file)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function ping(url, headers = {}) {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}

/** Streaming filter that removes <think>…</think> spans even when tags are split across chunks. */
function thinkStripper() {
  const OPEN = '<think>'
  const CLOSE = '</think>'
  let pending = ''
  let thinking = false
  return (delta) => {
    if (delta === null) return thinking ? '' : pending
    pending += delta
    let out = ''
    for (;;) {
      if (thinking) {
        const i = pending.indexOf(CLOSE)
        if (i === -1) {
          pending = pending.slice(-CLOSE.length)
          return out
        }
        pending = pending.slice(i + CLOSE.length).replace(/^\s+/, '')
        thinking = false
      } else {
        const i = pending.indexOf(OPEN)
        if (i !== -1) {
          out += pending.slice(0, i)
          pending = pending.slice(i + OPEN.length)
          thinking = true
          continue
        }
        // Hold back a possible partial "<think" at the end.
        let keep = 0
        for (let k = Math.min(OPEN.length - 1, pending.length); k > 0; k--) {
          if (OPEN.startsWith(pending.slice(-k))) {
            keep = k
            break
          }
        }
        out += pending.slice(0, pending.length - keep)
        pending = pending.slice(pending.length - keep)
        return out
      }
    }
  }
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function trimSlash(s) {
  return s.replace(/\/+$/, '')
}

function loadDotEnv(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
