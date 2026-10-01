// Global overlay effects: preloader, custom cursor, section-wipe curtain, confetti.
import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { onAction } from '../agent/bus'

export function Preloader({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1600)
      setN(Math.round((1 - Math.pow(1 - p, 3)) * 100))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setTimeout(() => setGone(true), 250)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <AnimatePresence onExitComplete={onDone}>
      {!gone && (
        <motion.div className="preloader" key="pre" exit={{ opacity: 1 }} transition={{ duration: 1 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="preloader-bar"
              style={{ left: `${i * 20}%` }}
              exit={{ y: '-100%' }}
              transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: i * 0.05 }}
            />
          ))}
          <motion.div className="preloader-count" exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.4 }}>
            {String(n).padStart(3, '0')}
          </motion.div>
          <motion.div className="preloader-label" exit={{ opacity: 0 }}>
            booting neural interface
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Cursor() {
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const rx = useSpring(x, { stiffness: 250, damping: 25, mass: 0.6 })
  const ry = useSpring(y, { stiffness: 250, damping: 25, mass: 0.6 })
  const [hover, setHover] = useState<string | null>(null)
  const [down, setDown] = useState(false)
  const [fine] = useState(() => matchMedia('(pointer: fine)').matches)

  useEffect(() => {
    if (!fine) return
    document.documentElement.classList.add('has-cursor')
    const move = (e: PointerEvent) => {
      x.set(e.clientX)
      y.set(e.clientY)
      const t = (e.target as HTMLElement).closest?.('a,button,[data-cursor],input,textarea') as HTMLElement | null
      setHover(t ? t.dataset.cursor || (t.matches('input,textarea') ? 'text' : 'link') : null)
    }
    const d = () => setDown(true)
    const u = () => setDown(false)
    addEventListener('pointermove', move)
    addEventListener('pointerdown', d)
    addEventListener('pointerup', u)
    return () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerdown', d)
      removeEventListener('pointerup', u)
    }
  }, [fine, x, y])

  if (!fine) return null
  const label = hover && hover !== 'link' && hover !== 'text' ? hover : ''
  return (
    <>
      <motion.div className="cursor-dot" style={{ x, y }} />
      <motion.div
        className="cursor-ring"
        style={{ x: rx, y: ry }}
        animate={{ scale: down ? 0.7 : label ? 3.2 : hover === 'link' ? 1.8 : hover === 'text' ? 0.5 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        {label && <span>{label}</span>}
      </motion.div>
    </>
  )
}

export type CurtainHandle = { wipe: (midpoint: () => void, label?: string) => Promise<void> }

/** Full-screen diagonal wipe used when the agent jumps between sections. */
export const Curtain = forwardRef<CurtainHandle>(function Curtain(_, ref) {
  const [state, setState] = useState<{ phase: 'idle' | 'in' | 'out'; label: string }>({ phase: 'idle', label: '' })
  const resolvers = useRef<{ mid?: () => void; end?: () => void }>({})
  useImperativeHandle(ref, () => ({
    wipe: (mid, label = '') =>
      new Promise<void>((end) => {
        resolvers.current = { mid, end }
        setState({ phase: 'in', label })
      }),
  }))
  return (
    <AnimatePresence>
      {state.phase !== 'idle' && (
        <motion.div className="curtain" key="curtain">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={`curtain-layer l${i}`}
              initial={{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }}
              animate={
                state.phase === 'in'
                  ? { clipPath: 'polygon(0 0, 115% 0, 100% 100%, 0 100%)' }
                  : { clipPath: 'polygon(100% 0, 115% 0, 100% 100%, 100% 100%)' }
              }
              transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1], delay: state.phase === 'in' ? i * 0.07 : (2 - i) * 0.07 }}
              onAnimationComplete={() => {
                if (i !== 2) return
                if (state.phase === 'in') {
                  resolvers.current.mid?.()
                  setTimeout(() => setState((s) => ({ ...s, phase: 'out' })), 120)
                } else {
                  setState({ phase: 'idle', label: '' })
                  resolvers.current.end?.()
                }
              }}
            />
          ))}
          {state.label && (
            <motion.div
              className="curtain-label"
              initial={{ opacity: 0, letterSpacing: '1em' }}
              animate={{ opacity: state.phase === 'in' ? 1 : 0, letterSpacing: '0.3em' }}
              transition={{ duration: 0.5 }}
            >
              {state.label}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
})

/** Canvas confetti burst, triggered by the agent's [[effect:confetti]]. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const g = canvas.getContext('2d')!
    type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; s: number; life: number }
    let ps: P[] = []
    let raf = 0
    const colors = ['#7c5cff', '#00e5ff', '#ff3d81', '#c6ff3d', '#ffffff']
    const loop = () => {
      canvas.width = innerWidth * devicePixelRatio
      canvas.height = innerHeight * devicePixelRatio
      g.scale(devicePixelRatio, devicePixelRatio)
      ps = ps.filter((p) => p.life > 0)
      for (const p of ps) {
        p.vy += 0.25
        p.vx *= 0.99
        p.x += p.vx
        p.y += p.vy
        p.r += p.s
        p.life--
        g.save()
        g.translate(p.x, p.y)
        g.rotate(p.r)
        g.fillStyle = p.c
        g.globalAlpha = Math.min(1, p.life / 40)
        g.fillRect(-5, -3, 10, 6)
        g.restore()
      }
      raf = ps.length ? requestAnimationFrame(loop) : 0
    }
    const off = onAction((a) => {
      if (a.type !== 'effect' || a.value !== 'confetti') return
      for (let i = 0; i < 220; i++) {
        const side = i % 2
        ps.push({
          x: side ? innerWidth + 10 : -10,
          y: innerHeight * 0.7,
          vx: (side ? -1 : 1) * (6 + Math.random() * 12),
          vy: -10 - Math.random() * 14,
          r: Math.random() * 6,
          s: (Math.random() - 0.5) * 0.4,
          c: colors[(Math.random() * colors.length) | 0],
          life: 140 + Math.random() * 60,
        })
      }
      if (!raf) loop()
    })
    return () => {
      off()
      cancelAnimationFrame(raf)
    }
  }, [])
  return <canvas ref={ref} className="confetti" aria-hidden />
}
