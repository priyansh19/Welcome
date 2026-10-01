// Small reusable animation primitives.
import { motion, useInView, useMotionValue, useSpring, animate } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

const GLYPHS = '!<>-_\\/[]{}—=+*^?#01ABCDEFXYZ'

/** Text that decodes from random glyphs when it scrolls into view (or when `text` changes). */
export function Scramble({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10% 0px' })
  const [out, setOut] = useState(text.replace(/\S/g, ' '))
  useEffect(() => {
    if (!inView) return
    let frame = 0
    let raf = 0
    const total = 28 + text.length
    const start = performance.now() + delay * 1000
    const tick = (now: number) => {
      if (now < start) return (raf = requestAnimationFrame(tick))
      frame++
      const progress = frame / total
      setOut(
        text
          .split('')
          .map((ch, i) => (ch === ' ' ? ' ' : i / text.length < progress ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join(''),
      )
      if (frame < total) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, text, delay])
  return (
    <span ref={ref} className={className} aria-label={text}>
      {out}
    </span>
  )
}

/** Each word slides up from behind a mask, staggered. */
export function SplitReveal({ text, className, delay = 0, play, as: Tag = 'span' }: { text: string; className?: string; delay?: number; play?: boolean; as?: 'span' | 'h1' | 'h2' | 'p' }) {
  // With `play` the reveal is driven by the caller (e.g. after the preloader); otherwise by scroll.
  const shown = { y: '0%', rotate: 0 }
  const trigger = play === undefined ? { whileInView: shown, viewport: { once: true, margin: '-5% 0px' } } : { animate: play ? shown : undefined }
  const words = text.split(' ')
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="mask" aria-hidden>
          <motion.span
            style={{ display: 'inline-block' }}
            initial={{ y: '110%', rotate: 6 }}
            {...trigger}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: delay + i * 0.06 }}
          >
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </Tag>
  )
}

/** Wrapper that gets pulled toward the cursor. */
export function Magnetic({ children, strength = 0.35 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useSpring(useMotionValue(0), { stiffness: 200, damping: 15 })
  const y = useSpring(useMotionValue(0), { stiffness: 200, damping: 15 })
  return (
    <motion.div
      ref={ref}
      style={{ x, y, display: 'inline-block' }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        x.set((e.clientX - r.left - r.width / 2) * strength)
        y.set((e.clientY - r.top - r.height / 2) * strength)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}

/** Card that tilts in 3D toward the cursor with a moving glare. */
export function Tilt({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const rx = useSpring(0, { stiffness: 150, damping: 18 })
  const ry = useSpring(0, { stiffness: 150, damping: 18 })
  const gx = useMotionValue(50)
  const gy = useMotionValue(50)
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ ...style, rotateX: rx, rotateY: ry, transformPerspective: 900, ['--gx' as string]: gx, ['--gy' as string]: gy }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        const px = (e.clientX - r.left) / r.width
        const py = (e.clientY - r.top) / r.height
        ry.set((px - 0.5) * 16)
        rx.set(-(py - 0.5) * 16)
        gx.set(px * 100)
        gy.set(py * 100)
      }}
      onPointerLeave={() => {
        rx.set(0)
        ry.set(0)
      }}
    >
      {children}
    </motion.div>
  )
}

/** Number that counts up when visible. */
export function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  useEffect(() => {
    if (!inView) return
    const c = animate(0, to, {
      duration: 2,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => ref.current && (ref.current.textContent = Math.round(v) + suffix),
    })
    return () => c.stop()
  }, [inView, to, suffix])
  return <span ref={ref}>0{suffix}</span>
}
