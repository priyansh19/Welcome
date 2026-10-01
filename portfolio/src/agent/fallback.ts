// Offline brain: used when the self-hosted LLM is not reachable (e.g. the
// site is deployed as static files). Answers from profile.json with keyword
// matching and emits the same action tags as the real model.
import { profile } from '../content'

const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w))

export function fallbackReply(input: string): string {
  const q = input.toLowerCase()

  const project = profile.projects.find((p) => q.includes(p.id) || q.includes(p.title.toLowerCase()) || p.tags.some((t) => q.includes(t.toLowerCase())))
  if (project && has(q, 'project', 'open', 'show', 'tell', 'about', 'what')) {
    return `${project.title} (${project.year}): ${project.summary} [[open:${project.id}]]`
  }
  if (has(q, 'light mode', 'light theme', 'lights on', 'bright')) return 'Lights on. [[theme:light]]'
  if (has(q, 'dark mode', 'dark theme', 'lights off', 'dark')) return 'Back to the dark side. [[theme:dark]]'
  if (has(q, 'warp', 'hyperspace', 'crazy', 'wow', 'impress', 'cool')) return 'Hold on tight. Engaging hyperdrive. [[effect:warp]]'
  if (has(q, 'party', 'celebrate', 'confetti', 'hire')) return `Great choice. Reach ${profile.name} at ${profile.email}. [[effect:confetti]] [[goto:contact]]`
  if (has(q, 'project', 'work', 'built', 'portfolio', 'build')) {
    return `${profile.name} has shipped ${profile.projects.map((p) => p.title).join(', ')}. Ask me to open any of them. [[goto:projects]]`
  }
  if (has(q, 'skill', 'stack', 'tech', 'language', 'tool', 'know')) {
    return `The toolbox spans ${profile.skills.map((s) => s.group).join(', ')}, with favourites like ${profile.skills[0].items.slice(0, 3).join(', ')}. [[goto:skills]]`
  }
  if (has(q, 'experience', 'job', 'career', 'company', 'worked', 'resume', 'cv')) {
    const now = profile.experience[0]
    return `Right now: ${now.title} at ${now.org}. ${now.detail} [[goto:experience]]`
  }
  if (has(q, 'contact', 'email', 'reach', 'talk', 'linkedin', 'github')) {
    return `You can reach ${profile.name} at ${profile.email}, or find the links below. [[goto:contact]]`
  }
  if (has(q, 'who', 'about', 'yourself', 'priyansh', 'introduce')) return `${profile.about} [[goto:about]]`
  if (has(q, 'top', 'home', 'start', 'beginning')) return 'Back to the top. [[goto:home]]'
  if (has(q, 'tour', 'show me around', 'guide', 'everything')) {
    return `Let's take the tour: first who ${profile.name} is, then projects and skills. [[goto:about]]`
  }
  if (has(q, 'hi', 'hello', 'hey', 'yo')) return `Hey! I'm ${profile.name}'s AI guide. Ask about projects, skills, or say "warp" for something fun.`
  return `I'm running in offline mode right now, so I know the basics: projects, skills, experience and contact. Try "show me the projects" or "switch to light mode".`
}

/** Stream the fallback reply word by word so it feels like the real model. */
export async function* streamFallback(input: string) {
  const reply = fallbackReply(input)
  for (const part of reply.split(/(\s+)/)) {
    yield part
    await new Promise((r) => setTimeout(r, 18))
  }
}
