// Voice I/O. Prefers the self-hosted speech server (Whisper STT + Kokoro TTS via
// /api/stt and /api/tts); falls back to the browser's Web Speech API.
import { audio } from './bus'

type SR = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }
const BrowserSR = w.SpeechRecognition || w.webkitSpeechRecognition

export const voiceSupport = {
  mic: !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined',
  browserSTT: !!BrowserSR,
  browserTTS: 'speechSynthesis' in window,
}

let ctx: AudioContext | null = null
function audioCtx() {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function meter(analyser: AnalyserNode, onLevel?: (l: number) => void) {
  const data = new Uint8Array(analyser.fftSize)
  let raf = 0
  const tick = () => {
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    const level = Math.min(1, Math.sqrt(sum / data.length) * 4)
    audio.level = audio.level * 0.6 + level * 0.4
    onLevel?.(level)
    raf = requestAnimationFrame(tick)
  }
  tick()
  return () => {
    cancelAnimationFrame(raf)
    audio.level = 0
  }
}

export type Listening = { result: Promise<string>; stop: () => void; cancel: () => void }

/** Record one utterance. Ends on ~1.2s of silence after speech, on stop(), or after 20s. */
export function listen(useServer: boolean, onPartial?: (t: string) => void): Listening {
  if (useServer && voiceSupport.mic) return listenServer()
  if (BrowserSR) return listenBrowser(onPartial)
  return { result: Promise.reject(new Error('No speech recognition available')), stop() {}, cancel() {} }
}

function listenServer(): Listening {
  let stopFn = () => {}
  let cancelled = false
  const result = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    const ac = audioCtx()
    const src = ac.createMediaStreamSource(stream)
    const analyser = ac.createAnalyser()
    analyser.fftSize = 1024
    src.connect(analyser)

    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.start(250)
    audio.listening = true

    let heard = false
    let quietSince = performance.now()
    const started = performance.now()
    const finish = () => rec.state === 'recording' && rec.stop()
    stopFn = finish
    const stopMeter = meter(analyser, (l) => {
      const now = performance.now()
      if (l > 0.08) {
        heard = true
        quietSince = now
      }
      if ((heard && now - quietSince > 1200) || now - started > 20000) finish()
    })

    await done
    stopMeter()
    audio.listening = false
    stream.getTracks().forEach((t) => t.stop())
    src.disconnect()
    if (cancelled || !heard) return ''

    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
    const r = await fetch('/api/stt', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })
    if (!r.ok) throw new Error(`stt ${r.status}`)
    return ((await r.json()).text as string) || ''
  })()
  return {
    result,
    stop: () => stopFn(),
    cancel: () => {
      cancelled = true
      stopFn()
    },
  }
}

function listenBrowser(onPartial?: (t: string) => void): Listening {
  const sr = new BrowserSR!()
  sr.lang = navigator.language || 'en-US'
  sr.interimResults = true
  sr.continuous = false
  let text = ''
  let cancelled = false
  audio.listening = true
  // No raw audio from Web Speech, so animate a gentle pulse instead.
  const pulse = setInterval(() => (audio.level = 0.15 + Math.random() * 0.25), 90)
  const result = new Promise<string>((resolve, reject) => {
    sr.onresult = (e) => {
      text = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      onPartial?.(text)
    }
    sr.onerror = (e) => {
      const err = (e as { error?: string }).error
      if (err === 'no-speech' || err === 'aborted') return
      reject(new Error(err || 'speech error'))
    }
    sr.onend = () => {
      clearInterval(pulse)
      audio.level = 0
      audio.listening = false
      resolve(cancelled ? '' : text)
    }
  })
  sr.start()
  return { result, stop: () => sr.stop(), cancel: () => ((cancelled = true), sr.abort()) }
}

let current: { cancel: () => void } | null = null

/** Speak text aloud. Resolves when playback ends or is cancelled. */
export async function speak(text: string, useServer: boolean): Promise<void> {
  stopSpeaking()
  const clean = text.replace(/[*_`#>]/g, '').trim()
  if (!clean) return
  if (useServer) {
    try {
      return await speakServer(clean)
    } catch {
      /* fall through to browser voice */
    }
  }
  if (voiceSupport.browserTTS) return speakBrowser(clean)
}

async function speakServer(text: string) {
  const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
  if (!r.ok) throw new Error(`tts ${r.status}`)
  const url = URL.createObjectURL(await r.blob())
  const el = new Audio(url)
  const ac = audioCtx()
  const src = ac.createMediaElementSource(el)
  const analyser = ac.createAnalyser()
  analyser.fftSize = 1024
  src.connect(analyser)
  analyser.connect(ac.destination)
  const stopMeter = meter(analyser)
  audio.speaking = true
  await new Promise<void>((resolve) => {
    const end = () => {
      stopMeter()
      audio.speaking = false
      el.pause()
      src.disconnect()
      URL.revokeObjectURL(url)
      current = null
      resolve()
    }
    current = { cancel: end }
    el.onended = end
    el.onerror = end
    el.play().catch(end)
  })
}

function speakBrowser(text: string) {
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    const voices = speechSynthesis.getVoices()
    u.voice = voices.find((v) => /natural|neural|google/i.test(v.name) && v.lang.startsWith('en')) || voices.find((v) => v.lang.startsWith('en')) || null
    u.rate = 1.04
    const pulse = setInterval(() => (audio.level = 0.25 + Math.random() * 0.5), 80)
    audio.speaking = true
    const end = () => {
      clearInterval(pulse)
      audio.level = 0
      audio.speaking = false
      current = null
      resolve()
    }
    u.onend = end
    u.onerror = end
    current = { cancel: () => (speechSynthesis.cancel(), end()) }
    speechSynthesis.speak(u)
  })
}

export function stopSpeaking() {
  current?.cancel()
  current = null
}
