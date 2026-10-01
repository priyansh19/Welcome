import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import type { Project } from '../content'

export function ProjectModal({ project, onClose }: { project: Project | null; onClose: () => void }) {
  useEffect(() => {
    if (!project) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [project, onClose])

  return (
    <AnimatePresence>
      {project && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            layoutId={`card-${project.id}`}
            className="modal glass"
            style={{ ['--accent' as string]: project.color }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={project.title}
            data-lenis-prevent
          >
            <motion.h3 layoutId={`title-${project.id}`}>{project.title}</motion.h3>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <span className="project-year">{project.year}</span>
              <p className="modal-summary">{project.summary}</p>
              <div className="tags">
                {project.tags.map((t, i) => (
                  <motion.span key={t} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 + i * 0.06, type: 'spring' }}>
                    {t}
                  </motion.span>
                ))}
              </div>
              <div className="modal-actions">
                <a className="btn btn-primary" href={project.url} target="_blank" rel="noreferrer">
                  View project ↗
                </a>
                <button className="btn btn-ghost" onClick={onClose}>
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
