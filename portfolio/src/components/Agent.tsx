// The chat dock and the full-screen voice mode. Both share one conversation.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { audio } from '../agent/bus'
import type { useAgent } from '../agent/useAgent'
import { listen, speak, stopSpeaking, voiceSupport, type Listening } from '../agent/voice'

type Agent = ReturnType<typeof useAgent>

const SUGGESTIONS = ['Give me the tour', 'What has Priyansh built?', 'Open the voice agent project', 'Switch to light mode', 'Do something crazy']

function StatusBadge({ agent }: { agent: Agent }) {
  const h = agent.health
  if (!h) return <span className="badge">connecting…</span>
  return (
    <span className={`badge ${h.llm ? 'ok' : 'warn'}`} title={h.llm ? 'Answers come from the self-hosted model' : 'Self-hosted model not reachable, using the built-in offline brain'}>
      <i /> {h.llm ? `local · ${h.model}` : 'offline brain'}
    </span>
  )
}

export function ChatDock({ agent, open, setOpen, onVoice }: { agent: Agent; open: boolean; setOpen: (v: boolean) => void; onVoice: () => void }) {
  const [input, setInput] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [agent.messages])
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  const submit = (text: string) => {
    if (!text.trim()) return
    setInput('')
    void agent.send(text)
  }

  return (
    <>
      <motion.button
        className="dock-orb"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close chat' : 'Open chat with my AI'}
        data-cursor={open ? 'close' : 'chat'}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        animate={{ rotate: open ? 135 : 0 }}
      >
        <span className="orb-core" />
        <span className="orb-ring" />
        <span className="orb-plus">{open ? '+' : ''}</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.aside
            className="chat glass"
            role="dialog"
            aria-label="Chat with Priyansh's AI"
            data-lenis-prevent
            initial={{ opacity: 0, y: 40, scale: 0.9, clipPath: 'circle(0% at 100% 100%)' }}
            animate={{ opacity: 1, y: 0, scale: 1, clipPath: 'circle(150% at 100% 100%)' }}
            exit={{ opacity: 0, y: 40, scale: 0.9, clipPath: 'circle(0% at 100% 100%)' }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          >
            <header>
              <div>
                <strong>Ask my AI</strong>
                <StatusBadge agent={agent} />
              </div>
              <div className="chat-head-actions">
                {agent.messages.length > 0 && (
                  <button className="icon-btn" onClick={agent.reset} title="New conversation" aria-label="New conversation">
                    ↺
                  </button>
                )}
                <button className="icon-btn" onClick={onVoice} title="Voice mode" aria-label="Open voice mode">
                  <span className="mic-icon" />
                </button>
              </div>
            </header>
            <div className="chat-list" ref={list}>
              {agent.messages.length === 0 && (
                <div className="chat-empty">
                  <p>I know everything on this site and I can drive it. Try:</p>
                  <div className="chips">
                    {SUGGESTIONS.map((s, i) => (
                      <motion.button key={s} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }} onClick={() => submit(s)}>
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              <AnimatePresence initial={false}>
                {agent.messages.map((m, i) => (
                  <motion.div
                    key={i}
                    className={`bubble ${m.role}`}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  >
                    {m.content || (agent.busy && i === agent.messages.length - 1 ? <span className="typing"><i /><i /><i /></span> : '')}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <form
              className="chat-input"
              onSubmit={(e) => {
                e.preventDefault()
                submit(input)
              }}
            >
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything, or tell me where to go…" maxLength={500} />
              {agent.busy ? (
                <button type="button" onClick={agent.stop} aria-label="Stop">
                  ■
                </button>
              ) : (
                <button type="submit" aria-label="Send" disabled={!input.trim()}>
                  ↑
                </button>
              )}
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export function VoiceMode({ agent, open, onClose }: { agent: Agent; open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [said, setSaid] = useState('')
  const [err, setErr] = useState('')
  const [handsFree, setHandsFree] = useState(true)
  const listening = useRef<Listening | null>(null)
  const alive = useRef(false)
  const handsFreeRef = useRef(handsFree)
  handsFreeRef.current = handsFree
  const serverSpeech = !!agent.health?.speech

  const turn = async () => {
    if (!alive.current) return
    stopSpeaking()
    setErr('')
    setHeard('')
    setPhase('listening')
    try {
      const l = listen(serverSpeech, setHeard)
      listening.current = l
      const text = (await l.result).trim()
      listening.current = null
      if (!alive.current) return
      if (!text) return setPhase('idle')
      setHeard(text)
      setSaid('')
      setPhase('thinking')
      const reply = await agent.send(text, 'voice')
      if (!alive.current) return
      setSaid(reply)
      setPhase('speaking')
      await speak(reply, serverSpeech)
      if (alive.current && handsFreeRef.current) void turn()
      else if (alive.current) setPhase('idle')
    } catch (e) {
      listening.current = null
      if (!alive.current) return
      setErr(e instanceof Error && e.name === 'NotAllowedError' ? 'Microphone permission was blocked.' : 'Voice is unavailable in this browser. Try Chrome, or use the chat.')
      setPhase('error')
    }
  }

  useEffect(() => {
    if (!open) return
    alive.current = true
    setSaid('')
    setHeard('')
    void turn()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => {
      alive.current = false
      listening.current?.cancel()
      stopSpeaking()
      agent.stop()
      removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Mirror the agent's streaming text while thinking.
  const last = agent.messages[agent.messages.length - 1]
  const live = phase === 'thinking' && last?.role === 'assistant' ? last.content : said

  const tapOrb = () => {
    if (phase === 'listening') listening.current?.stop()
    else if (phase === 'speaking') {
      stopSpeaking()
    } else if (phase === 'idle' || phase === 'error') void turn()
  }

  const label = { idle: 'Tap the orb to talk', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking · tap to interrupt', error: err }[phase]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="voice"
          role="dialog"
          aria-label="Voice conversation"
          initial={{ clipPath: 'circle(0% at 50% 50%)' }}
          animate={{ clipPath: 'circle(150% at 50% 50%)' }}
          exit={{ clipPath: 'circle(0% at 50% 50%)' }}
          transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
        >
          <div className="voice-top">
            <span className="badge ok">
              <i /> {serverSpeech ? 'self-hosted whisper + kokoro' : voiceSupport.browserSTT ? 'browser speech' : 'no speech support'}
            </span>
            <label className="toggle">
              <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> hands-free
            </label>
            <button className="icon-btn" onClick={onClose} aria-label="Close voice mode" data-cursor="close">
              ✕
            </button>
          </div>
          <button className={`voice-orb-btn ${phase}`} onClick={tapOrb} aria-label={label} data-cursor={phase === 'listening' ? 'done' : 'talk'}>
            <VoiceOrb phase={phase} />
          </button>
          <motion.div className="voice-status" key={phase} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {label}
          </motion.div>
          <div className="voice-transcript">
            {heard && <p className="you">“{heard}”</p>}
            {live && <p className="ai">{live}</p>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Audio-reactive blob orb drawn on canvas. */
function VoiceOrb({ phase }: { phase: Phase }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  useEffect(() => {
    const c = ref.current!
    const g = c.getContext('2d')!
    const size = Math.min(420, innerWidth * 0.8)
    c.width = c.height = size * devicePixelRatio
    c.style.width = c.style.height = `${size}px`
    g.scale(devicePixelRatio, devicePixelRatio)
    let raf = 0
    let lvl = 0
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw)
      const p = phaseRef.current
      const target = p === 'thinking' ? 0.25 + Math.sin(t / 120) * 0.1 : audio.level
      lvl += (target - lvl) * 0.15
      g.clearRect(0, 0, size, size)
      const cx = size / 2
      const base = size * 0.28
      const hue = p === 'listening' ? 190 : p === 'speaking' ? 265 : p === 'thinking' ? 320 : 230
      for (let layer = 3; layer >= 0; layer--) {
        g.beginPath()
        const pts = 96
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2
          const n =
            Math.sin(a * 3 + t / (700 - layer * 90)) * 0.5 +
            Math.sin(a * 5 - t / (500 + layer * 60)) * 0.3 +
            Math.sin(a * 7 + t / 300) * 0.2
          const r = base * (1 + layer * 0.12) + n * (6 + lvl * 60) * (1 + layer * 0.3) + lvl * 30
          const x = cx + Math.cos(a) * r
          const y = cx + Math.sin(a) * r
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.closePath()
        if (layer === 0) {
          const grad = g.createRadialGradient(cx - base * 0.3, cx - base * 0.3, 10, cx, cx, base * 1.4)
          grad.addColorStop(0, `hsla(${hue + 40}, 100%, 75%, 1)`)
          grad.addColorStop(0.5, `hsla(${hue}, 95%, 60%, 1)`)
          grad.addColorStop(1, `hsla(${hue - 40}, 90%, 35%, 1)`)
          g.fillStyle = grad
          g.shadowColor = `hsla(${hue}, 100%, 60%, 0.8)`
          g.shadowBlur = 40 + lvl * 80
          g.fill()
          g.shadowBlur = 0
        } else {
          g.strokeStyle = `hsla(${hue + layer * 25}, 100%, 70%, ${0.35 - layer * 0.07})`
          g.lineWidth = 1.5
          g.stroke()
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} />
}
