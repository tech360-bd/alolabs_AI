'use client'

/**
 * AgentOS constellation — the interactive 3D hero scene.
 *
 * A WebGL scene built with React Three Fiber + three.js: an emissive
 * brand-blue core, twelve floating satellite nodes (each maps to a homepage
 * section anchor — hover to highlight, click to scroll), glowing connection
 * lines, a brand-tinted starfield and subtle pointer parallax. Every colour
 * comes from the official brand tokens in src/lib/brand/tokens.ts.
 *
 * Truthfulness and performance rules (all enforced below):
 *  - Mounts only after an IntersectionObserver sees the container.
 *  - The frame loop pauses when the tab is hidden or the scene is off-screen.
 *  - Device pixel ratio is capped at [1, 1.75]; antialias is off on mobile.
 *  - prefers-reduced-motion renders a static single frame (no animation loop).
 *  - No-WebGL or viewport < 640px renders a static SVG/CSS fallback using the
 *    official alo-mark. Nothing critical depends on WebGL — every section is
 *    also reachable through the regular navigation.
 *  - The corner badge honestly reports LIVE SCENE vs STATIC SCENE.
 */

import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Mark } from '@/components/brand/alo-logo'
import { BRAND } from '@/lib/brand/tokens'

// ─── Section anchors ─────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'platform', label: 'The platform' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'use-cases', label: 'For teams' },
  { id: 'selected-work', label: 'Selected work' },
  { id: 'technology', label: 'Technology' },
  { id: 'faq', label: 'FAQ' },
] as const

const NODE_COUNT = 12

type SceneMode = 'live' | 'static'

// ─── Deterministic layout (no hydration surprises, stable across reloads) ────

function seededRandom(seed: number) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

interface NodeSpec {
  position: [number, number, number]
  /** Base scale of the satellite. */
  size: number
  color: string
  /** Section this node scrolls to. */
  sectionId: (typeof SECTIONS)[number]['id']
  label: string
  phase: number
  speed: number
}

const CORE_COLOR = BRAND.blueLight
const NODE_COLORS = [BRAND.blueLight, BRAND.blue, BRAND.orange, BRAND.blueAlt] as const

function buildNodes(): NodeSpec[] {
  const random = seededRandom(20260214)
  const nodes: NodeSpec[] = []
  for (let i = 0; i < NODE_COUNT; i++) {
    // Golden-spiral shell with jitter — evenly spread, deterministic.
    const t = i / NODE_COUNT
    const inclination = Math.acos(1 - 2 * ((t + random() * 0.04) % 1))
    const azimuth = Math.PI * (1 + Math.sqrt(5)) * i + random() * 0.6
    const radius = 2.15 + random() * 1.15
    const section = SECTIONS[i % SECTIONS.length]
    nodes.push({
      position: [
        radius * Math.sin(inclination) * Math.cos(azimuth),
        radius * Math.cos(inclination) * 0.72,
        radius * Math.sin(inclination) * Math.sin(azimuth),
      ],
      size: 0.07 + random() * 0.05,
      color: NODE_COLORS[i % NODE_COLORS.length],
      sectionId: section.id,
      label: section.label,
      phase: random() * Math.PI * 2,
      speed: 0.5 + random() * 0.5,
    })
  }
  return nodes
}

// ─── Scene contents ──────────────────────────────────────────────────────────

function Starfield() {
  const geometry = useMemo(() => {
    const random = seededRandom(9042)
    const count = 520
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const palette = [BRAND.blueLight, BRAND.blue, BRAND.orange, '#ffffff', '#bcd6ff']
    const color = new THREE.Color()
    for (let i = 0; i < count; i++) {
      // Shell between radius 9 and 26 so stars sit behind the constellation.
      const r = 9 + random() * 17
      const theta = random() * Math.PI * 2
      const phi = Math.acos(2 * random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      color.set(palette[Math.floor(random() * palette.length)])
      color.multiplyScalar(0.55 + random() * 0.45)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry
  }, [])

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={0.055}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  )
}

function ConnectionLines({ nodes }: { nodes: NodeSpec[] }) {
  const geometry = useMemo(() => {
    const points: number[] = []
    const push = (a: readonly number[], b: readonly number[]) => {
      points.push(a[0], a[1], a[2], b[0], b[1], b[2])
    }
    // Spokes: core → every satellite.
    for (const node of nodes) push([0, 0, 0], node.position)
    // Ring: satellite → next satellite.
    nodes.forEach((node, i) => {
      const next = nodes[(i + 1) % nodes.length]
      if (i % 2 === 0) push(node.position, next.position)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3))
    return geometry
  }, [nodes])

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        color={BRAND.blueLight}
        transparent
        opacity={0.28}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  )
}

function Core() {
  const meshRef = useRef<THREE.Mesh>(null)
  const shellRef = useRef<THREE.LineSegments>(null)
  const wireGeometry = useMemo(() => new THREE.IcosahedronGeometry(1.32, 1), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (meshRef.current) {
      const pulse = 1 + Math.sin(t * 1.4) * 0.02
      meshRef.current.scale.setScalar(pulse)
    }
    if (shellRef.current) {
      shellRef.current.rotation.y = t * 0.12
      shellRef.current.rotation.x = Math.sin(t * 0.1) * 0.2
    }
  })

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.92, 48, 48]} />
        <meshStandardMaterial
          color={BRAND.blue}
          emissive={CORE_COLOR}
          emissiveIntensity={1.5}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>
      <lineSegments ref={shellRef} geometry={wireGeometry}>
        <lineBasicMaterial color={BRAND.blueLight} transparent opacity={0.22} depthWrite={false} />
      </lineSegments>
      <mesh rotation={[Math.PI / 2.4, 0.3, 0]}>
        <torusGeometry args={[1.7, 0.012, 8, 128]} />
        <meshBasicMaterial color={BRAND.orange} transparent opacity={0.65} />
      </mesh>
      <pointLight color={CORE_COLOR} intensity={18} distance={9} decay={2} />
    </group>
  )
}

function Satellites({
  nodes,
  motionOK,
  onHover,
}: {
  nodes: NodeSpec[]
  motionOK: boolean
  onHover: (label: string | null) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const hoveredIndex = useRef<number | null>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const group = groupRef.current
    if (!group) return
    group.children.forEach((child, i) => {
      const node = nodes[i]
      if (!node) return
      const hovered = hoveredIndex.current === i
      const targetScale = hovered ? node.size * 1.9 : node.size
      // Float + hover response are eased; when motion is off, ease still settles
      // instantly within one demand-frame, so no animation loop is running.
      const ease = motionOK ? 0.14 : 1
      const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
      child.scale.setScalar(THREE.MathUtils.lerp(child.scale.x, targetScale, ease))
      material.emissiveIntensity = THREE.MathUtils.lerp(
        material.emissiveIntensity,
        hovered ? 2.6 : 1.1,
        ease,
      )
      if (motionOK) {
        child.position.y =
          node.position[1] + Math.sin(t * node.speed + node.phase) * 0.09
      }
    })
  })

  return (
    <group ref={groupRef}>
      {nodes.map((node, i) => (
        <mesh
          key={`${node.sectionId}-${i}`}
          position={node.position}
          scale={node.size}
          onPointerOver={(event) => {
            event.stopPropagation()
            hoveredIndex.current = i
            onHover(node.label)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            hoveredIndex.current = null
            onHover(null)
            document.body.style.cursor = ''
          }}
          onClick={(event) => {
            event.stopPropagation()
            document.getElementById(node.sectionId)?.scrollIntoView({
              behavior: motionOK ? 'smooth' : 'auto',
              block: 'start',
            })
          }}
        >
          <sphereGeometry args={[1, 20, 20]} />
          <meshStandardMaterial
            color={node.color}
            emissive={node.color}
            emissiveIntensity={1.1}
            roughness={0.3}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  )
}

function Constellation({
  motionOK,
  onHover,
}: {
  motionOK: boolean
  onHover: (label: string | null) => void
}) {
  const nodes = useMemo(buildNodes, [])
  const rigRef = useRef<THREE.Group>(null)
  const { pointer } = useThree()

  useFrame(() => {
    const rig = rigRef.current
    if (!rig || !motionOK) return
    // Subtle pointer parallax.
    rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, pointer.x * 0.22, 0.045)
    rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, -pointer.y * 0.12, 0.045)
  })

  return (
    <group ref={rigRef}>
      <Core />
      <Satellites nodes={nodes} motionOK={motionOK} onHover={onHover} />
      <ConnectionLines nodes={nodes} />
      <ambientLight intensity={0.35} color={BRAND.blueLight} />
      <directionalLight position={[4, 6, 6]} intensity={0.9} color={'#cfe2ff'} />
    </group>
  )
}

// ─── Capability detection ────────────────────────────────────────────────────

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      canvas.getContext('webgl2') ?? canvas.getContext('webgl'),
    )
  } catch {
    return false
  }
}

// ─── Static fallback (official alo-mark — used for no-WebGL and < 640px) ─────

function StaticFallback({ reason }: { reason: 'no-webgl' | 'small-viewport' }) {
  return (
    <div className="hero3d-fallback" role="img" aria-label="AgentOS constellation, static preview">
      <svg viewBox="0 0 480 480" className="hero3d-fallback-orbits" aria-hidden="true" focusable="false">
        <ellipse cx="240" cy="240" rx="200" ry="82" fill="none" stroke="rgba(125,169,247,0.28)" strokeWidth="1" />
        <ellipse cx="240" cy="240" rx="150" ry="196" fill="none" stroke="rgba(125,169,247,0.2)" strokeWidth="1" />
        {[
          [440, 240], [336, 104], [118, 88], [46, 292], [196, 428], [372, 372],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 2 === 0 ? 6 : 4.5}
            fill={i % 3 === 2 ? BRAND.orange : BRAND.blueLight} opacity={0.9} />
        ))}
        <circle cx="240" cy="240" r="58" fill="rgba(0,119,255,0.14)" />
      </svg>
      <div className="hero3d-fallback-mark"><Mark size={72} /></div>
      <p className="hero3d-fallback-note">
        {reason === 'no-webgl'
          ? 'Interactive scene needs WebGL — showing the ALO mark instead.'
          : 'Interactive scene is available on larger screens.'}
      </p>
    </div>
  )
}

// ─── Truthful status badge ───────────────────────────────────────────────────

function SceneBadge({ mode }: { mode: SceneMode }) {
  return (
    <span className={`hero3d-badge hero3d-badge-${mode}`} aria-live="polite">
      <i aria-hidden="true" />
      {mode === 'live' ? 'LIVE SCENE' : 'STATIC SCENE'}
    </span>
  )
}

// ─── Container ───────────────────────────────────────────────────────────────

export function Hero3D() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [checked, setChecked] = useState(false)
  const [webgl, setWebgl] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [smallViewport, setSmallViewport] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [inView, setInView] = useState(false)
  const [tabHidden, setTabHidden] = useState(false)
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null)

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    setWebgl(supportsWebGL())
    const coarseQuery = window.matchMedia('(pointer: coarse), (max-width: 767px)')
    const smallQuery = window.matchMedia('(max-width: 639px)')
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyMedia = () => {
      setIsMobile(coarseQuery.matches)
      setSmallViewport(smallQuery.matches)
      setReducedMotion(motionQuery.matches)
    }
    applyMedia()
    setChecked(true)

    coarseQuery.addEventListener('change', applyMedia)
    smallQuery.addEventListener('change', applyMedia)
    motionQuery.addEventListener('change', applyMedia)

    // Mount the WebGL scene only once the container is actually seen.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting)
      },
      { rootMargin: '120px' },
    )
    observer.observe(wrapper)

    const onVisibility = () => setTabHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      coarseQuery.removeEventListener('change', applyMedia)
      smallQuery.removeEventListener('change', applyMedia)
      motionQuery.removeEventListener('change', applyMedia)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      document.body.style.cursor = ''
    }
  }, [])

  const useFallback = !checked || !webgl || smallViewport
  const mode: SceneMode = useFallback || reducedMotion ? 'static' : 'live'
  // Frame loop: pause off-screen and on hidden tabs; reduced motion gets a
  // single demand-rendered frame instead of a continuous loop.
  const frameloop: 'always' | 'demand' | 'never' = reducedMotion
    ? 'demand'
    : inView && !tabHidden
      ? 'always'
      : 'never'

  return (
    <div
      ref={wrapperRef}
      className={`hero3d${useFallback ? '' : ' hero3d-live'}`}
      aria-label="Interactive AgentOS constellation. Each node highlights on hover and scrolls to a homepage section. All sections are also reachable from the navigation."
    >
      {useFallback ? (
        <>
          <StaticFallback reason={!webgl && checked ? 'no-webgl' : 'small-viewport'} />
          {checked && <SceneBadge mode="static" />}
        </>
      ) : (
        <>
          {inView && (
            <Canvas
              frameloop={frameloop}
              dpr={[1, 1.75]}
              camera={{ position: [0, 0.6, 6.6], fov: 42 }}
              gl={{
                antialias: !isMobile,
                alpha: false,
                powerPreference: 'high-performance',
              }}
              onCreated={({ scene }) => {
                scene.background = new THREE.Color(BRAND.blueDeep)
                scene.fog = new THREE.Fog(BRAND.navy, 14, 30)
              }}
            >
              <Constellation motionOK={!reducedMotion} onHover={setHoveredLabel} />
              <Starfield />
            </Canvas>
          )}
          {!inView && <div className="hero3d-pending" aria-hidden="true" />}
          {hoveredLabel && <span className="hero3d-tooltip">{hoveredLabel} — click to scroll</span>}
          <SceneBadge mode={mode} />
        </>
      )}
    </div>
  )
}

export default Hero3D
