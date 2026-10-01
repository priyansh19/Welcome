import Lenis from 'lenis'
import { motion, useScroll, useSpring } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { onAction } from './agent/bus'
import { useAgent } from './agent/useAgent'
import { ChatDock, VoiceMode } from './components/Agent'
import { Confetti, Cursor, Curtain, Preloader, type CurtainHandle } from './components/Overlays'
import { ParticleField } from './components/ParticleField'
import { ProjectModal } from './components/ProjectModal'
import { About, Contact, Experience, Hero, Projects, Skills } from './components/Sections'
import { profile, SECTIONS, type Project, type Section } from './content'

type Theme = 'dark' | 'light'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* storage blocked */
  }
  return 'dark'
}

/** Section links with a pill that slides to the active one. */
function NavLinks({ active, onGo }: { active: Section; onGo: (s: Section) => void }) {
  const refs = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({})
  const [pill, setPill] = useState({ left: 0, width: 0, visible: false })
  useEffect(() => {
    const measure = () => {
      const el = refs.current[active]
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth, visible: true })
      else setPill((p) => ({ ...p, visible: false }))
    }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [active])
  return (
    <ul>
      <motion.li
        className="nav-pill"
        aria-hidden
        initial={false}
        animate={{ left: pill.left, width: pill.width, opacity: pill.visible ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      />
      {SECTIONS.slice(1).map((s) => (
        <li key={s}>
          <button ref={(el) => void (refs.current[s] = el)} onClick={() => onGo(s)} className={active === s ? 'active' : ''}>
            {s}
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [section, setSection] = useState<Section>('home')
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [project, setProject] = useState<Project | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const agent = useAgent()
  const lenis = useRef<Lenis | null>(null)
  const curtain = useRef<CurtainHandle>(null)
  const voiceOpenRef = useRef(voiceOpen)
  voiceOpenRef.current = voiceOpen

  // Smooth scrolling
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const l = new Lenis({ lerp: 0.09, wheelMultiplier: 1 })
    lenis.current = l
    let raf = 0
    const loop = (t: number) => {
      l.raf(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      l.destroy()
    }
  }, [])

  // Lock scroll during the preloader
  useEffect(() => {
    if (ready) lenis.current?.start()
    else lenis.current?.stop()
  }, [ready])

  // Track which section is in the middle of the viewport
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setSection(e.target.id as Section)),
      { rootMargin: '-50% 0px -50% 0px' },
    )
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage blocked */
    }
  }, [theme])

  const jump = useCallback((s: Section) => {
    const el = document.getElementById(s)
    if (!el) return Promise.resolve()
    const go = () => (lenis.current ? lenis.current.scrollTo(el, { immediate: true, force: true }) : el.scrollIntoView())
    // In voice mode the page is behind the overlay, so skip the curtain.
    if (voiceOpenRef.current || !curtain.current) {
      if (lenis.current) lenis.current.scrollTo(el, { duration: 1.4, force: true })
      else el.scrollIntoView({ behavior: 'smooth' })
      return Promise.resolve()
    }
    return curtain.current.wipe(go, s)
  }, [])

  const switchTheme = useCallback((next: Theme, origin?: { x: number; y: number }) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
    if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return setTheme(next)
    const x = origin?.x ?? innerWidth - 60
    const y = origin?.y ?? innerHeight - 60
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    const vt = doc.startViewTransition(() => flushSync(() => setTheme(next)))
    vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 900, easing: 'cubic-bezier(.76,0,.24,1)', pseudoElement: '::view-transition-new(root)' },
      )
    })
  }, [])

  // Everything the agent can do to the page
  useEffect(
    () =>
      onAction(async (a) => {
        if (a.type === 'goto') {
          setProject(null)
          await jump(a.section)
        } else if (a.type === 'open') {
          const p = profile.projects.find((x) => x.id === a.id)
          if (!p) return
          await jump('projects')
          setTimeout(() => setProject(p), 200)
        } else if (a.type === 'theme') {
          switchTheme(a.value)
        }
      }),
    [jump, switchTheme],
  )

  // Keyboard shortcuts: "/" chat, "." voice
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea')) return
      if (e.key === '/') {
        e.preventDefault()
        setChatOpen(true)
      } else if (e.key === '.') setVoiceOpen(true)
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [])

  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 25 })

  return (
    <>
      <Preloader onDone={() => setReady(true)} />
      <ParticleField section={section} theme={theme} />
      <div className="grain" aria-hidden />
      <motion.div className="scroll-progress" style={{ scaleX: progress }} />

      <motion.nav className="nav" initial={{ y: -80 }} animate={{ y: ready ? 0 : -80 }} transition={{ type: 'spring', stiffness: 80, delay: 0.3 }}>
        <button className="logo" onClick={() => jump('home')} aria-label="Back to top">
          {profile.name.slice(0, 1)}
          <span>.ai</span>
        </button>
        <NavLinks active={section} onGo={jump} />
        <button
          className="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={(e) => switchTheme(theme === 'dark' ? 'light' : 'dark', { x: e.clientX, y: e.clientY })}
        >
          <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}>
            {theme === 'dark' ? '☾' : '☀'}
          </motion.span>
        </button>
      </motion.nav>

      <main>
        <Hero ready={ready} onTalk={() => setVoiceOpen(true)} />
        <About />
        <Skills />
        <Projects onOpen={setProject} />
        <Experience />
        <Contact onTalk={() => setVoiceOpen(true)} />
      </main>

      <ProjectModal project={project} onClose={() => setProject(null)} />
      <ChatDock agent={agent} open={chatOpen} setOpen={setChatOpen} onVoice={() => setVoiceOpen(true)} />
      <VoiceMode agent={agent} open={voiceOpen} onClose={() => setVoiceOpen(false)} />
      <Curtain ref={curtain} />
      <Confetti />
      <Cursor />
    </>
  )
}
