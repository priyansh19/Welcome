# Priyansh · AI Portfolio

An animated portfolio with its own AI. Visitors can **chat** or **talk** to it, and the agent can **drive the site**: scroll to sections, open projects, flip the theme, fire a hyperspace warp or confetti. All models are self-hosted.

## What's in it

**Animation**
- WebGL particle field (14k particles, custom shaders) that morphs into a new shape per section: neural sphere → DNA helix → torus knot → galaxy → wave grid → portal ring. Particles flee the cursor, pulse with the voice agent's audio, and can warp to hyperspace.
- Preloader counter with a staggered curtain lift, diagonal three-layer wipe between sections when the agent navigates.
- Scramble/decode labels, masked word-by-word reveals, magnetic buttons, 3D tilt cards with moving glare, velocity-skewed horizontal project rail pinned to vertical scroll, SVG timeline that draws itself, dual tilted marquees.
- Shared-element morph from project card to detail modal, circular View Transition theme switch, custom blend-mode cursor with contextual labels, Lenis smooth scroll, film grain.
- Respects `prefers-reduced-motion`.

**AI**
- **Chat dock** (bottom-right orb, or press `/`): streams replies from a local LLM.
- **Voice mode** (hero button, or press `.`): full-screen audio-reactive orb, hands-free turn taking with silence detection, tap to interrupt.
- The agent drives the page by emitting tags like `[[goto:projects]]`, `[[open:voice-agent]]`, `[[theme:light]]`, `[[effect:warp]]`. The client hides the tags and runs them as they stream in.
- Everything the agent knows comes from [`content/profile.json`](content/profile.json), the same file the site renders.

## Self-hosted stack (defaults)

| Piece | Default | Why |
|---|---|---|
| Chat LLM | **Ollama** running `llama3.2:3b` | Small, fast on CPU, good at following the action-tag format. Swap via `LLM_MODEL` (e.g. `qwen3:8b`, `gemma3:4b`) or point `LLM_BASE_URL` at any OpenAI-compatible server (llama.cpp, vLLM, LM Studio). |
| Speech-to-text | **Speaches** with `Systran/faster-whisper-small` | faster-whisper behind an OpenAI-compatible `/v1/audio/transcriptions`. |
| Text-to-speech | **Speaches** with Kokoro-82M, voice `af_heart` | Natural voice, runs on CPU, OpenAI-compatible `/v1/audio/speech`. |
| API | `server/index.mjs` | Zero-dependency Node server: proxies chat/STT/TTS and serves the built site. |

**Graceful fallbacks:** if the LLM is unreachable the site answers from an offline keyword brain built from `profile.json` (and still drives the page). If the speech server is not configured, voice mode uses the browser's Web Speech API.

## Run it

Everything in Docker:

```bash
cd portfolio
docker compose up -d --build   # first run downloads the models
open http://localhost:8787
```

Local development (needs Ollama installed, speech optional):

```bash
cd portfolio
cp .env.example .env           # leave SPEECH_BASE_URL empty to use browser speech
ollama pull llama3.2:3b
npm install
npm run dev                    # site on :5173, API on :8787
```

Production without Docker: `npm run build && npm start` serves the site and API on `:8787`.

## Make it yours

1. Edit `content/profile.json`: name, tagline, about, stats, skills, projects (each with an `id` the agent can open), experience, socials, email.
2. Tweak the agent's personality in `server/prompt.mjs`.
3. Colours live at the top of `src/styles/global.css`.

## Layout

```
portfolio/
├── content/profile.json      # single source of truth for the site and the agent
├── server/                   # API (chat, stt, tts, health) + static hosting
├── src/
│   ├── agent/                # action bus, chat hook, offline brain, voice I/O
│   ├── components/           # ParticleField, Sections, Agent (chat + voice), overlays, fx
│   └── styles/global.css
└── docker-compose.yml        # web + ollama + speaches
```
