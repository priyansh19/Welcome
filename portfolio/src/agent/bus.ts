// A tiny event bus so the agent (or anything else) can drive the page.
import { SECTIONS, type Section } from '../content'

export type SiteAction =
  | { type: 'goto'; section: Section }
  | { type: 'open'; id: string }
  | { type: 'theme'; value: 'dark' | 'light' }
  | { type: 'effect'; value: 'warp' | 'confetti' }

type Listener = (a: SiteAction) => void
const listeners = new Set<Listener>()

export function onAction(fn: Listener) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function dispatch(a: SiteAction) {
  listeners.forEach((fn) => fn(a))
}

const TAG = /\[\[\s*(goto|open|theme|effect)\s*:\s*([\w-]+)\s*\]\]/gi

export function toAction(kind: string, arg: string): SiteAction | null {
  const k = kind.toLowerCase()
  const v = arg.toLowerCase()
  if (k === 'goto' && (SECTIONS as readonly string[]).includes(v)) return { type: 'goto', section: v as Section }
  if (k === 'open') return { type: 'open', id: v }
  if (k === 'theme' && (v === 'dark' || v === 'light')) return { type: 'theme', value: v }
  if (k === 'effect' && (v === 'warp' || v === 'confetti')) return { type: 'effect', value: v }
  return null
}

/** Split streamed text into visible text and complete action tags. A trailing,
 * still-incomplete tag is held back so it never flashes on screen. */
export function extractActions(raw: string) {
  const actions: SiteAction[] = []
  let text = raw.replace(TAG, (_, k: string, a: string) => {
    const act = toAction(k, a)
    if (act) actions.push(act)
    return ''
  })
  const open = text.lastIndexOf('[[')
  if (open !== -1 && !text.slice(open).includes(']]')) text = text.slice(0, open)
  return { text: text.replace(/[ \t]+\n/g, '\n').replace(/ {2,}/g, ' ').trim(), actions }
}

/** Shared, mutable audio level (0..1) for visuals that react to the voice. */
export const audio = { level: 0, speaking: false, listening: false }
