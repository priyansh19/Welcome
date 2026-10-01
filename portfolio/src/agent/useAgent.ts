import { useCallback, useEffect, useRef, useState } from 'react'
import { dispatch, extractActions } from './bus'
import { streamFallback } from './fallback'

export type Msg = { role: 'user' | 'assistant'; content: string; raw?: string }
export type Health = { llm: boolean; speech: boolean; model?: string }

let healthPromise: Promise<Health> | null = null
export function getHealth(): Promise<Health> {
  healthPromise ??= fetch('/api/health')
    .then((r) => (r.ok ? r.json() : { llm: false, speech: false }))
    .catch(() => ({ llm: false, speech: false }))
  return healthPromise
}

async function* streamServer(messages: Msg[], mode: 'chat' | 'voice', signal: AbortSignal) {
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, messages: messages.map((m) => ({ role: m.role, content: m.raw ?? m.content })) }),
    signal,
  })
  if (!r.ok || !r.body) throw new Error(`chat ${r.status}`)
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const evt = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const data = evt.replace(/^data:\s*/, '')
      if (data === '[DONE]') return
      try {
        yield JSON.parse(data).delta as string
      } catch {
        /* ignore keep-alives */
      }
    }
  }
}

export function useAgent() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [health, setHealth] = useState<Health | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const msgsRef = useRef<Msg[]>([])
  msgsRef.current = messages

  useEffect(() => {
    getHealth().then(setHealth)
  }, [])

  /** Send a message; resolves with the final visible reply text. */
  const send = useCallback(async (text: string, mode: 'chat' | 'voice' = 'chat') => {
    const content = text.trim()
    if (!content) return ''
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const history: Msg[] = [...msgsRef.current, { role: 'user', content }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setBusy(true)

    let raw = ''
    let fired = 0
    const update = () => {
      const { text: visible, actions } = extractActions(raw)
      // Fire each action exactly once, as soon as its tag is complete.
      actions.slice(fired).forEach(dispatch)
      fired = actions.length
      setMessages([...history, { role: 'assistant', content: visible, raw }])
      return visible
    }

    let visible = ''
    try {
      const h = await getHealth()
      const stream = h.llm ? streamServer(history, mode, ac.signal) : streamFallback(content)
      try {
        for await (const d of stream) {
          if (ac.signal.aborted) break
          raw += d
          visible = update()
        }
      } catch (err) {
        if (ac.signal.aborted) throw err
        // Server died mid-flight: answer locally rather than show an error.
        raw = ''
        for await (const d of streamFallback(content)) {
          raw += d
          visible = update()
        }
      }
    } catch {
      /* aborted */
    } finally {
      if (abortRef.current === ac) setBusy(false)
    }
    return visible
  }, [])

  const stop = useCallback(() => abortRef.current?.abort(), [])
  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
  }, [])

  return { messages, busy, health, send, stop, reset }
}
