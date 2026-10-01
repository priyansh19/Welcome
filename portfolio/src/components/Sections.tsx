import { motion, useScroll, useTransform, useSpring, useVelocity, type MotionValue } from 'motion/react'
import { useRef } from 'react'
import { profile, type Project } from '../content'
import { dispatch } from '../agent/bus'
import { CountUp, Magnetic, Scramble, SplitReveal, Tilt } from './fx'

export function Hero({ ready, onTalk }: { ready: boolean; onTalk: () => void }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '40%'])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.85])
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const blur = useTransform(scrollYProgress, [0, 0.8], ['blur(0px)', 'blur(12px)'])
  return (
    <section id="home" ref={ref} className="hero">
      <motion.div className="hero-inner" style={{ y, scale, opacity, filter: blur }}>
        <motion.div className="eyebrow" initial={{ opacity: 0, y: 20 }} animate={ready ? { opacity: 1, y: 0 } : undefined} transition={{ delay: 0.3 }}>
          <span className="pulse-dot" /> {ready && <Scramble text={`${profile.role} · ${profile.location}`} delay={0.3} />}
        </motion.div>
        <h1 className="hero-title">
          <SplitReveal text={`Hi, I'm ${profile.name}.`} delay={0.2} play={ready} />
          <br />
          <span className="gradient-text">
            <SplitReveal text={profile.tagline} delay={0.5} play={ready} />
          </span>
        </h1>
        <motion.p className="hero-sub" initial={{ opacity: 0 }} animate={ready ? { opacity: 1 } : undefined} transition={{ delay: 1.2, duration: 1 }}>
          This site runs its own AI. Talk to it, type to it, or ask it to show you around. It can drive the page.
        </motion.p>
        <motion.div className="hero-cta" initial={{ opacity: 0, y: 30 }} animate={ready ? { opacity: 1, y: 0 } : undefined} transition={{ delay: 1.4, type: 'spring' }}>
          <Magnetic>
            <button className="btn btn-primary" onClick={onTalk} data-cursor="talk">
              <span className="mic-icon" /> Talk to my AI
            </button>
          </Magnetic>
          <Magnetic>
            <button className="btn btn-ghost" onClick={() => dispatch({ type: 'goto', section: 'projects' })}>
              See the work ↘
            </button>
          </Magnetic>
        </motion.div>
      </motion.div>
      <motion.div className="scroll-hint" style={{ opacity }}>
        <span>scroll</span>
        <i />
      </motion.div>
    </section>
  )
}

export function About() {
  return (
    <section id="about" className="section about">
      <div className="section-label">
        <Scramble text="01 / about" />
      </div>
      <SplitReveal as="h2" className="big-statement" text={profile.about} />
      <div className="stats">
        {profile.stats.map((s, i) => (
          <motion.div
            className="stat glass"
            key={s.label}
            initial={{ opacity: 0, y: 60, rotateX: -40 }}
            whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12, type: 'spring', stiffness: 80 }}
          >
            <div className="stat-value gradient-text">
              <CountUp to={s.value} suffix={s.suffix} />
            </div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

export function Skills() {
  const all = profile.skills.flatMap((s) => s.items)
  return (
    <section id="skills" className="section skills">
      <div className="section-label">
        <Scramble text="02 / skills" />
      </div>
      <div className="marquee" aria-hidden>
        <div className="marquee-track">
          {[...all, ...all].map((s, i) => (
            <span key={i}>
              {s} <em>✦</em>
            </span>
          ))}
        </div>
      </div>
      <div className="marquee reverse" aria-hidden>
        <div className="marquee-track outline">
          {[...all, ...all].reverse().map((s, i) => (
            <span key={i}>
              {s} <em>✦</em>
            </span>
          ))}
        </div>
      </div>
      <div className="skill-grid">
        {profile.skills.map((g, gi) => (
          <Tilt className="skill-card glass" key={g.group}>
            <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: gi * 0.1, type: 'spring' }}>
              <h3>{g.group}</h3>
              <ul>
                {g.items.map((it, i) => (
                  <motion.li
                    key={it}
                    initial={{ opacity: 0, x: -20, filter: 'blur(6px)' }}
                    whileInView={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    viewport={{ once: true }}
                    transition={{ delay: gi * 0.1 + i * 0.05 }}
                  >
                    {it}
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </Tilt>
        ))}
      </div>
    </section>
  )
}

/** Vertical scroll drives a horizontal, pinned project rail. */
export function Projects({ onOpen }: { onOpen: (p: Project) => void }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })
  const n = profile.projects.length
  const x = useTransform(smooth, [0, 1], ['0%', `-${((n - 1) / (n + 0.6)) * 100}%`])
  // Cards lean into the direction of travel, harder the faster you scroll.
  const skew = useSpring(useTransform(useVelocity(scrollYProgress), [-2, 0, 2], [10, 0, -10], { clamp: true }), { stiffness: 200, damping: 30 })
  return (
    <section id="projects" ref={ref} className="projects" style={{ height: `${n * 80 + 60}vh` }}>
      <div className="projects-sticky">
        <div className="section-label pad">
          <Scramble text="03 / selected work" />
        </div>
        <motion.div className="rail" style={{ x, skewX: skew }}>
          {profile.projects.map((p, i) => (
            <Tilt key={p.id} className="project-card" style={{ ['--accent' as string]: p.color }}>
              <motion.button layoutId={`card-${p.id}`} className="project-inner" onClick={() => onOpen(p)} data-cursor="open">
                <span className="project-index">{String(i + 1).padStart(2, '0')}</span>
                <span className="project-year">{p.year}</span>
                <motion.h3 layoutId={`title-${p.id}`}>{p.title}</motion.h3>
                <p>{p.summary}</p>
                <span className="tags">
                  {p.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </span>
                <span className="project-glow" />
              </motion.button>
            </Tilt>
          ))}
        </motion.div>
        <ProgressBar progress={smooth} />
      </div>
    </section>
  )
}

function ProgressBar({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="rail-progress">
      <motion.div style={{ scaleX: progress }} />
    </div>
  )
}

export function Experience() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'end 60%'] })
  const draw = useSpring(scrollYProgress, { stiffness: 80, damping: 20 })
  return (
    <section id="experience" className="section experience">
      <div className="section-label">
        <Scramble text="04 / experience" />
      </div>
      <div className="timeline" ref={ref}>
        <svg className="timeline-line" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden>
          <path d="M10 0 C 18 15, 2 30, 10 45 S 18 75, 10 100" className="track" />
          <motion.path d="M10 0 C 18 15, 2 30, 10 45 S 18 75, 10 100" className="draw" style={{ pathLength: draw }} />
        </svg>
        {profile.experience.map((e, i) => (
          <motion.div
            key={e.period}
            className={`tl-item ${i % 2 ? 'right' : 'left'}`}
            initial={{ opacity: 0, x: i % 2 ? 120 : -120, rotate: i % 2 ? 4 : -4 }}
            whileInView={{ opacity: 1, x: 0, rotate: 0 }}
            viewport={{ once: true, margin: '-15% 0px' }}
            transition={{ type: 'spring', stiffness: 60, damping: 14 }}
          >
            <div className="glass tl-card">
              <span className="tl-period">{e.period}</span>
              <h3>{e.title}</h3>
              <span className="tl-org">{e.org}</span>
              <p>{e.detail}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

export function Contact({ onTalk }: { onTalk: () => void }) {
  return (
    <section id="contact" className="section contact">
      <div className="section-label">
        <Scramble text="05 / contact" />
      </div>
      <h2 className="contact-title">
        <SplitReveal text="Let's build something" />
        <br />
        <span className="gradient-text">
          <SplitReveal text="that feels alive." delay={0.2} />
        </span>
      </h2>
      <div className="contact-actions">
        <Magnetic strength={0.5}>
          <a className="btn btn-primary big" href={`mailto:${profile.email}`} data-cursor="say hi">
            {profile.email}
          </a>
        </Magnetic>
        <Magnetic strength={0.5}>
          <button className="btn btn-ghost big" onClick={onTalk}>
            or just talk to my AI
          </button>
        </Magnetic>
      </div>
      <div className="socials">
        {profile.socials.map((s, i) => (
          <motion.a
            key={s.label}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
          >
            <Scramble text={s.label} delay={i * 0.1} /> ↗
          </motion.a>
        ))}
      </div>
      <footer>
        © {new Date().getFullYear()} {profile.name}. Rendered live with WebGL, answered by a self-hosted model.
      </footer>
    </section>
  )
}
