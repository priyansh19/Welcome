// Full-screen WebGL particle field. Particles morph into a different shape for
// each section, swirl away from the cursor, pulse with the voice agent's audio
// level, and can be sent into a hyperspace "warp".
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { audio, onAction } from '../agent/bus'
import type { Section } from '../content'

const isMobile = matchMedia('(max-width: 768px)').matches
const COUNT = isMobile ? 6000 : 14000

type ShapeFn = (i: number, n: number, out: Float32Array, o: number) => void

const rand = () => Math.random() * 2 - 1

const shapes: Record<Section, ShapeFn> = {
  // Noisy brain-like sphere
  home: (i, n, out, o) => {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / n)
    const theta = Math.PI * (1 + Math.sqrt(5)) * i
    const r = 2.2 + 0.25 * Math.sin(phi * 9) * Math.cos(theta * 3) + rand() * 0.04
    out[o] = r * Math.sin(phi) * Math.cos(theta)
    out[o + 1] = r * Math.cos(phi)
    out[o + 2] = r * Math.sin(phi) * Math.sin(theta)
  },
  // Double helix
  about: (i, n, out, o) => {
    const t = (i / n) * Math.PI * 12
    const strand = i % 3
    const y = (i / n) * 8 - 4
    if (strand === 2) {
      const k = Math.random()
      out[o] = Math.cos(t) * 1.3 * (2 * k - 1)
      out[o + 1] = y
      out[o + 2] = Math.sin(t) * 1.3 * (2 * k - 1)
    } else {
      const a = t + strand * Math.PI
      out[o] = Math.cos(a) * 1.3 + rand() * 0.06
      out[o + 1] = y + rand() * 0.06
      out[o + 2] = Math.sin(a) * 1.3 + rand() * 0.06
    }
  },
  // Torus knot
  skills: (i, n, out, o) => {
    const t = (i / n) * Math.PI * 2 * 3
    const p = 2, q = 3
    const r = 1.5 + 0.6 * Math.cos((q * t) / 1)
    const tube = 0.28
    const a = Math.random() * Math.PI * 2
    out[o] = r * Math.cos(p * t) + Math.cos(a) * tube
    out[o + 1] = r * Math.sin(p * t) + Math.sin(a) * tube
    out[o + 2] = 0.6 * Math.sin(q * t) * 1.6 + rand() * tube
  },
  // Spiral galaxy
  projects: (i, _n, out, o) => {
    const arms = 4
    const r = Math.pow(Math.random(), 0.6) * 4
    const arm = (i % arms) / arms * Math.PI * 2
    const a = arm + r * 1.1
    const spread = 0.35 * (1 - r / 5)
    out[o] = Math.cos(a) * r + rand() * spread
    out[o + 1] = rand() * 0.15 * (1.2 - r / 4)
    out[o + 2] = Math.sin(a) * r + rand() * spread
  },
  // Undulating wave grid
  experience: (i, n, out, o) => {
    const side = Math.ceil(Math.sqrt(n))
    const x = ((i % side) / side) * 9 - 4.5
    const z = (Math.floor(i / side) / side) * 9 - 4.5
    out[o] = x
    out[o + 1] = Math.sin(x * 1.2) * Math.cos(z * 1.2) * 0.6 - 0.5
    out[o + 2] = z
  },
  // Portal ring
  contact: (_i, _n, out, o) => {
    const a = Math.random() * Math.PI * 2
    const r = 2.4 + Math.pow(Math.random(), 3) * 1.4 * (Math.random() < 0.5 ? -1 : 1) * 0.5
    out[o] = Math.cos(a) * r
    out[o + 1] = Math.sin(a) * r
    out[o + 2] = rand() * 0.2
  },
}

const vertex = /* glsl */ `
  uniform float uTime, uMix, uLevel, uWarp, uPixel, uSize;
  uniform vec2 uMouse;
  attribute vec3 aFrom, aTo;
  attribute float aRand;
  varying float vRand, vDepth, vGlow;

  vec3 swirl(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.7 + t) * 0.06,
      cos(p.z * 1.9 + t * 1.3) * 0.06,
      sin(p.x * 1.5 + t * 0.7) * 0.06
    );
  }

  void main() {
    float d = aRand * 0.45;
    float m = smoothstep(d, d + 0.55, uMix);
    vec3 p = mix(aFrom, aTo, m);
    // Mid-morph explosion for drama
    p += normalize(p + 0.0001) * sin(m * 3.14159) * (0.6 + aRand);
    p += swirl(p, uTime * 0.6 + aRand * 6.28);
    p *= 1.0 + uLevel * (0.25 + 0.35 * aRand);

    // Warp: stretch everything towards the camera
    p.z += uWarp * (aRand * 10.0 + 2.0) * fract(uTime * 0.7 + aRand);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;

    // Push particles away from the cursor in screen space
    vec2 ndc = clip.xy / clip.w;
    vec2 diff = ndc - uMouse;
    float dist = length(diff);
    float push = smoothstep(0.35, 0.0, dist);
    clip.xy += normalize(diff + 0.0001) * push * 0.18 * clip.w;

    gl_Position = clip;
    vRand = aRand;
    vDepth = clamp(-mv.z / 12.0, 0.0, 1.0);
    vGlow = push + uLevel;
    gl_PointSize = uSize * uPixel * (0.6 + aRand) * (1.0 + uWarp * 2.0) / -mv.z;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uA, uB, uC;
  uniform float uLight;
  varying float vRand, vDepth, vGlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, r);
    vec3 col = mix(uA, uB, vRand);
    col = mix(col, uC, smoothstep(0.85, 1.0, vRand));
    col += vGlow * 0.5;
    float a = alpha * (1.0 - vDepth * 0.6) * mix(0.9, 0.75, uLight);
    gl_FragColor = vec4(col, a);
  }
`

export function ParticleField({ section, theme }: { section: Section; theme: 'dark' | 'light' }) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ morph: (s: Section) => void; setTheme: (t: 'dark' | 'light') => void } | null>(null)

  useEffect(() => {
    const el = host.current!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
    const dpr = Math.min(devicePixelRatio, 2)
    renderer.setPixelRatio(dpr)
    renderer.setSize(innerWidth, innerHeight)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 100)
    camera.position.set(0, 0, 8)

    const from = new Float32Array(COUNT * 3)
    const to = new Float32Array(COUNT * 3)
    const rnd = new Float32Array(COUNT)
    for (let i = 0; i < COUNT; i++) {
      shapes.home(i, COUNT, to, i * 3)
      from[i * 3] = rand() * 12
      from[i * 3 + 1] = rand() * 12
      from[i * 3 + 2] = rand() * 12
      rnd[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(to, 3))
    geo.setAttribute('aFrom', new THREE.BufferAttribute(from, 3))
    geo.setAttribute('aTo', new THREE.BufferAttribute(to, 3))
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1))

    const uniforms = {
      uTime: { value: 0 },
      uMix: { value: 0 },
      uLevel: { value: 0 },
      uWarp: { value: 0 },
      uMouse: { value: new THREE.Vector2(9, 9) },
      uPixel: { value: dpr },
      uSize: { value: isMobile ? 26 : 22 },
      uLight: { value: 0 },
      uA: { value: new THREE.Color('#7c5cff') },
      uB: { value: new THREE.Color('#00e5ff') },
      uC: { value: new THREE.Color('#ff3d81') },
    }
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    scene.add(points)

    let morphStart = performance.now()
    const MORPH_MS = reduce ? 1 : 2200
    let current: Section = 'home'

    const morph = (s: Section) => {
      if (s === current) return
      current = s
      // Freeze the in-between positions as the new start so morphs chain smoothly.
      const k = uniforms.uMix.value
      for (let i = 0; i < COUNT * 3; i++) from[i] = from[i] + (to[i] - from[i]) * k
      for (let i = 0; i < COUNT; i++) shapes[s](i, COUNT, to, i * 3)
      geo.attributes.aFrom.needsUpdate = true
      geo.attributes.aTo.needsUpdate = true
      uniforms.uMix.value = 0
      morphStart = performance.now()
    }
    const setTheme = (t: 'dark' | 'light') => {
      const light = t === 'light'
      uniforms.uLight.value = light ? 1 : 0
      mat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending
      uniforms.uA.value.set(light ? '#5b3df5' : '#7c5cff')
      uniforms.uB.value.set(light ? '#0090b8' : '#00e5ff')
      uniforms.uC.value.set(light ? '#e0186a' : '#ff3d81')
      mat.needsUpdate = true
    }
    api.current = { morph, setTheme }

    let warpUntil = 0
    const off = onAction((a) => {
      if (a.type === 'effect' && a.value === 'warp') warpUntil = performance.now() + 2600
    })

    const mouse = new THREE.Vector2(9, 9)
    const target = new THREE.Vector2(0, 0)
    const onMove = (e: PointerEvent) => {
      mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
      target.copy(mouse)
    }
    const onLeave = () => mouse.set(9, 9)
    const onResize = () => {
      camera.aspect = innerWidth / innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(innerWidth, innerHeight)
      camera.position.z = innerWidth < 768 ? 10.5 : 8
    }
    onResize()
    addEventListener('pointermove', onMove)
    document.addEventListener('pointerleave', onLeave)
    addEventListener('resize', onResize)

    let raf = 0
    let visible = true
    const onVis = () => (visible = document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    const clock = new THREE.Clock()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (!visible) return
      const dt = clock.getDelta()
      const t = clock.elapsedTime
      uniforms.uTime.value = t
      uniforms.uMix.value = Math.min(1, (performance.now() - morphStart) / MORPH_MS)
      uniforms.uLevel.value += (audio.level - uniforms.uLevel.value) * 0.2
      const warping = performance.now() < warpUntil ? 1 : 0
      uniforms.uWarp.value += (warping - uniforms.uWarp.value) * 0.06
      uniforms.uMouse.value.lerp(mouse, 0.15)

      points.rotation.y += dt * (reduce ? 0 : 0.08 + uniforms.uWarp.value * 1.5)
      points.rotation.x = Math.sin(t * 0.2) * 0.15 + window.scrollY * 0.0004
      camera.position.x += (target.x * 0.6 - camera.position.x) * 0.03
      camera.position.y += (target.y * 0.4 - camera.position.y) * 0.03
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      off()
      removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
      geo.dispose()
      mat.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => api.current?.morph(section), [section])
  useEffect(() => api.current?.setTheme(theme), [theme])

  return <div ref={host} className="particles" aria-hidden />
}
