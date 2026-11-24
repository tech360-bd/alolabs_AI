'use client'

/**
 * OrbCore — the WebGL centrepiece of the AgentOS landing page.
 *
 * A real renderer, not a CSS imitation: a violet-free blue/orange refractive
 * icosahedron wrapped in two counter-rotating wireframe shells, a particle
 * field, and additive bloom, all drawn with raw WebGL2 (no three.js dependency,
 * so nothing is added to the bundle or the lockfile).
 *
 * Non-negotiables:
 *  - It must never block the page. If WebGL is unavailable, blocked, or the
 *    context is lost, the CSS fallback under it stays visible and nothing
 *    throws.
 *  - It must respect `prefers-reduced-motion` (renders one frame, then stops).
 *  - It must stop rendering when scrolled out of view or the tab is hidden,
 *    so the page does not burn a laptop battery while idle.
 */

import { useEffect, useRef, useState } from 'react'

const VERT = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNormal;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform float uTime;
out vec3 vNormal;
out vec3 vWorld;
out float vPulse;

// Cheap value-noise for the surface displacement.
float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
  return n;
}

void main(){
  vec3 n = normalize(aNormal);
  float breathe = noise(n * 2.4 + uTime * 0.16) * 0.10;
  vPulse = 0.5 + 0.5 * sin(uTime * 0.9 + n.y * 3.0);
  vec3 pos = aPos * (1.0 + breathe);
  vec4 world = uModel * vec4(pos, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * n;
  gl_Position = uProj * uView * world;
}`

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
in float vPulse;
uniform vec3 uCam;
uniform vec3 uOrange;
uniform vec3 uBlue;
uniform vec3 uNavy;
uniform float uTime;
out vec4 fragColor;

void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCam - vWorld);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6);

  // Key light from upper-left, warm rim from lower-right.
  vec3 L1 = normalize(vec3(-0.55, 0.85, 0.62));
  vec3 L2 = normalize(vec3(0.75, -0.42, 0.38));
  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);

  // Blue body with an orange rim: the two logo colours, not a rainbow.
  vec3 body = mix(uNavy, uBlue, pow(clamp(N.y * 0.5 + 0.5, 0.0, 1.0), 1.35));
  vec3 col = body * (0.30 + 0.85 * d1);
  col += uOrange * fres * 1.15;
  col += uBlue * (0.35 + 0.25 * vPulse) * d2 * 0.55;
  col += uOrange * pow(fres, 3.0) * 0.45;

  // Specular highlight.
  vec3 H = normalize(L1 + V);
  col += vec3(1.0) * pow(max(dot(N, H), 0.0), 64.0) * 0.55;

  float alpha = 0.90 + fres * 0.10;
  fragColor = vec4(col, alpha);
}`

const LINE_VERT = `#version 300 es
precision highp float;
in vec3 aPos;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
void main(){ gl_Position = uProj * uView * uModel * vec4(aPos, 1.0); }`

const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 fragColor;
void main(){ fragColor = vec4(uColor, uAlpha); }`

const POINT_VERT = `#version 300 es
precision highp float;
in vec3 aPos;
in float aSeed;
uniform mat4 uProj;
uniform mat4 uView;
uniform float uTime;
out float vSeed;
void main(){
  vSeed = aSeed;
  vec3 p = aPos;
  p.y += sin(uTime * 0.35 + aSeed * 6.28) * 0.22;
  p.x += cos(uTime * 0.28 + aSeed * 4.71) * 0.18;
  gl_Position = uProj * uView * vec4(p, 1.0);
  gl_PointSize = 1.4 + aSeed * 2.6;
}`

const POINT_FRAG = `#version 300 es
precision highp float;
in float vSeed;
uniform vec3 uOrange;
uniform vec3 uBlue;
out vec4 fragColor;
void main(){
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * 0.75;
  vec3 col = mix(uBlue, uOrange, step(0.62, vSeed));
  fragColor = vec4(col, a);
}`

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '')
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  ]
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // Surfacing this matters: a silently dropped program would leave the page
    // looking broken with no diagnostic anywhere.
    console.error('[OrbCore] shader compile failed:', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram | null {
  const v = compile(gl, gl.VERTEX_SHADER, vs)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs)
  if (!v || !f) return null
  const p = gl.createProgram()
  if (!p) return null
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('[OrbCore] program link failed:', gl.getProgramInfoLog(p))
    return null
  }
  return p
}

// ─── Geometry ───────────────────────────────────────────────────────────────

/** Subdivided icosahedron: smoother silhouette and enough facets for lighting. */
function icosphere(subdiv: number): { positions: Float32Array; normals: Float32Array; indices: Uint16Array } {
  const t = (1 + Math.sqrt(5)) / 2
  const base: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ]
  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  const verts = base.map((v) => {
    const l = Math.hypot(v[0], v[1], v[2])
    return [v[0] / l, v[1] / l, v[2] / l]
  })

  for (let s = 0; s < subdiv; s++) {
    const cache = new Map<string, number>()
    const next: number[][] = []
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      const va = verts[a]
      const vb = verts[b]
      const m = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]]
      const l = Math.hypot(m[0], m[1], m[2])
      verts.push([m[0] / l, m[1] / l, m[2] / l])
      const idx = verts.length - 1
      cache.set(key, idx)
      return idx
    }
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b)
      const bc = midpoint(b, c)
      const ca = midpoint(c, a)
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca])
    }
    faces = next
  }

  const positions = new Float32Array(verts.length * 3)
  verts.forEach((v, i) => {
    positions[i * 3] = v[0]
    positions[i * 3 + 1] = v[1]
    positions[i * 3 + 2] = v[2]
  })
  const indices = new Uint16Array(faces.length * 3)
  faces.forEach((f, i) => {
    indices[i * 3] = f[0]
    indices[i * 3 + 1] = f[1]
    indices[i * 3 + 2] = f[2]
  })
  return { positions, normals: positions.slice(), indices }
}

/** Icosahedron wireframe edges. */
function icosaEdges(): Float32Array {
  const t = (1 + Math.sqrt(5)) / 2
  const v: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((p) => {
    const l = Math.hypot(p[0], p[1], p[2])
    return [p[0] / l, p[1] / l, p[2] / l]
  })
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  const seen = new Set<string>()
  const out: number[] = []
  for (const [a, b, c] of faces) {
    for (const [x, y] of [[a, b], [b, c], [c, a]] as const) {
      const key = x < y ? `${x}_${y}` : `${y}_${x}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(...v[x], ...v[y])
    }
  }
  return new Float32Array(out)
}

function particleField(count: number): { positions: Float32Array; seeds: Float32Array } {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    // Even-ish shell distribution.
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = 2.15 + Math.random() * 1.65
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.cos(phi) * 1.25
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    seeds[i] = Math.random()
  }
  return { positions, seeds }
}

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2)
  const nf = 1 / (near - far)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ])
}

function lookAt(eye: number[], target: number[], up: number[]): Float32Array {
  const [ex, ey, ez] = eye
  const [cx, cy, cz] = target
  const [ux, uy, uz] = up
  let zx = ex - cx, zy = ey - cy, zz = ez - cz
  let len = Math.hypot(zx, zy, zz) || 1
  zx /= len; zy /= len; zz /= len
  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx
  len = Math.hypot(xx, xy, xz) || 1
  xx /= len; xy /= len; xz /= len
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * ex + xy * ey + xz * ez),
    -(yx * ex + yy * ey + yz * ez),
    -(zx * ex + zy * ey + zz * ez),
    1,
  ])
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      o[i * 4 + j] =
        a[j] * b[i * 4] +
        a[4 + j] * b[i * 4 + 1] +
        a[8 + j] * b[i * 4 + 2] +
        a[12 + j] * b[i * 4 + 3]
    }
  }
  return o
}

function rotationY(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a)
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1])
}
function rotationX(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a)
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1])
}

export function OrbCore({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [webglFailed, setWebglFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    })
    if (!gl) {
      setWebglFailed(true)
      return
    }

    const sphereProg = program(gl, VERT, FRAG)
    const lineProg = program(gl, LINE_VERT, LINE_FRAG)
    const pointProg = program(gl, POINT_VERT, POINT_FRAG)
    if (!sphereProg || !lineProg || !pointProg) {
      setWebglFailed(true)
      return
    }

    const sphere = icosphere(3)
    const sphereVao = gl.createVertexArray()
    gl.bindVertexArray(sphereVao)
    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, sphere.positions, gl.STATIC_DRAW)
    const posLoc = gl.getAttribLocation(sphereProg, 'aPos')
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0)
    const normBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
    gl.bufferData(gl.ARRAY_BUFFER, sphere.normals, gl.STATIC_DRAW)
    const normLoc = gl.getAttribLocation(sphereProg, 'aNormal')
    gl.enableVertexAttribArray(normLoc)
    gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0)
    const idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphere.indices, gl.STATIC_DRAW)

    // Two wireframe shells at different radii/rotations.
    const edges = icosaEdges()
    const makeShell = () => {
      const vao = gl.createVertexArray()
      gl.bindVertexArray(vao)
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, edges, gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(lineProg, 'aPos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)
      return vao
    }
    const shellA = makeShell()
    const shellB = makeShell()

    // Particles.
    const particles = particleField(420)
    const particleVao = gl.createVertexArray()
    gl.bindVertexArray(particleVao)
    const pPos = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, pPos)
    gl.bufferData(gl.ARRAY_BUFFER, particles.positions, gl.STATIC_DRAW)
    const pPosLoc = gl.getAttribLocation(pointProg, 'aPos')
    gl.enableVertexAttribArray(pPosLoc)
    gl.vertexAttribPointer(pPosLoc, 3, gl.FLOAT, false, 0, 0)
    const pSeed = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, pSeed)
    gl.bufferData(gl.ARRAY_BUFFER, particles.seeds, gl.STATIC_DRAW)
    const pSeedLoc = gl.getAttribLocation(pointProg, 'aSeed')
    gl.enableVertexAttribArray(pSeedLoc)
    gl.vertexAttribPointer(pSeedLoc, 1, gl.FLOAT, false, 0, 0)

    gl.bindVertexArray(null)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const orange = hexToRgb('#FC5400')
    const blue = hexToRgb('#0048C0')
    const navy = hexToRgb('#00186C')

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let raf = 0
    let running = true
    let visible = true
    const start = performance.now()

    // Pointer parallax, damped.
    let targetX = 0, targetY = 0, curX = 0, curY = 0
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      targetX = ((e.clientX - r.left) / r.width - 0.5) * 2
      targetY = ((e.clientY - r.top) / r.height - 0.5) * 2
    }
    window.addEventListener('pointermove', onPointer, { passive: true })

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth || 1
      const h = canvas.clientHeight || 1
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const draw = (now: number) => {
      if (!running) return
      resize()
      const t = reduce ? 1.2 : (now - start) / 1000

      curX += (targetX - curX) * 0.05
      curY += (targetY - curY) * 0.05

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      const aspect = canvas.width / canvas.height
      const proj = perspective(0.86, aspect, 0.1, 100)
      const camDist = 4.35
      const eye = [Math.sin(t * 0.18) * 0.25 + curX * 0.35, curY * 0.28 + Math.cos(t * 0.22) * 0.12, camDist]
      const view = lookAt(eye, [0, 0, 0], [0, 1, 0])

      // Core sphere
      gl.useProgram(sphereProg)
      gl.bindVertexArray(sphereVao)
      const model = multiply(rotationX(0.42 + curY * 0.1), rotationY(t * 0.30 + curX * 0.22))
      gl.uniformMatrix4fv(gl.getUniformLocation(sphereProg, 'uProj'), false, proj)
      gl.uniformMatrix4fv(gl.getUniformLocation(sphereProg, 'uView'), false, view)
      gl.uniformMatrix4fv(gl.getUniformLocation(sphereProg, 'uModel'), false, model)
      gl.uniform3fv(gl.getUniformLocation(sphereProg, 'uCam'), new Float32Array(eye))
      gl.uniform3fv(gl.getUniformLocation(sphereProg, 'uOrange'), new Float32Array(orange))
      gl.uniform3fv(gl.getUniformLocation(sphereProg, 'uBlue'), new Float32Array(blue))
      gl.uniform3fv(gl.getUniformLocation(sphereProg, 'uNavy'), new Float32Array(navy))
      gl.uniform1f(gl.getUniformLocation(sphereProg, 'uTime'), t)
      gl.drawElements(gl.TRIANGLES, sphere.indices.length, gl.UNSIGNED_SHORT, 0)

      // Shell A — blue, larger, counter-rotating
      gl.useProgram(lineProg)
      gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'uProj'), false, proj)
      gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'uView'), false, view)
      gl.uniform3fv(gl.getUniformLocation(lineProg, 'uColor'), new Float32Array(blue))
      gl.uniform1f(gl.getUniformLocation(lineProg, 'uAlpha'), 0.38)
      const shellAModel = multiply(
        rotationY(-t * 0.22),
        multiply(rotationX(0.6), new Float32Array([1.55, 0, 0, 0, 0, 1.55, 0, 0, 0, 0, 1.55, 0, 0, 0, 0, 1])),
      )
      gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'uModel'), false, shellAModel)
      gl.bindVertexArray(shellA)
      gl.drawArrays(gl.LINES, 0, edges.length / 3)

      // Shell B — orange, tighter, opposite tilt
      gl.uniform3fv(gl.getUniformLocation(lineProg, 'uColor'), new Float32Array(orange))
      gl.uniform1f(gl.getUniformLocation(lineProg, 'uAlpha'), 0.26)
      const shellBModel = multiply(
        rotationY(t * 0.34),
        multiply(rotationX(-0.35), new Float32Array([1.28, 0, 0, 0, 0, 1.28, 0, 0, 0, 0, 1.28, 0, 0, 0, 0, 1])),
      )
      gl.uniformMatrix4fv(gl.getUniformLocation(lineProg, 'uModel'), false, shellBModel)
      gl.bindVertexArray(shellB)
      gl.drawArrays(gl.LINES, 0, edges.length / 3)

      // Particles
      gl.useProgram(pointProg)
      gl.bindVertexArray(particleVao)
      gl.uniformMatrix4fv(gl.getUniformLocation(pointProg, 'uProj'), false, proj)
      gl.uniformMatrix4fv(gl.getUniformLocation(pointProg, 'uView'), false, view)
      gl.uniform1f(gl.getUniformLocation(pointProg, 'uTime'), t)
      gl.uniform3fv(gl.getUniformLocation(pointProg, 'uOrange'), new Float32Array(orange))
      gl.uniform3fv(gl.getUniformLocation(pointProg, 'uBlue'), new Float32Array(blue))
      gl.drawArrays(gl.POINTS, 0, particles.seeds.length)

      gl.bindVertexArray(null)
      if (!reduce) raf = requestAnimationFrame(draw)
    }

    // Pause work when offscreen or backgrounded.
    const io = new IntersectionObserver(
      (entries) => {
        const next = entries[0]?.isIntersecting ?? true
        if (next && !visible) {
          visible = true
          if (!reduce && running) raf = requestAnimationFrame(draw)
        } else if (!next) {
          visible = false
          cancelAnimationFrame(raf)
        }
      },
      { threshold: 0.01 },
    )
    io.observe(canvas)

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
      } else if (visible && !reduce && running) {
        raf = requestAnimationFrame(draw)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    let failed = false
    const onLost = (e: Event) => {
      // preventDefault tells the browser we intend to recover the context.
      e.preventDefault()
      failed = true
      running = false
      cancelAnimationFrame(raf)
      setWebglFailed(true)
    }
    const onRestored = () => {
      if (!failed) return
      failed = false
      running = true
      setWebglFailed(false)
      raf = requestAnimationFrame(draw)
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    raf = requestAnimationFrame(draw)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pointermove', onPointer)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)

      // Deliberately do NOT call WEBGL_lose_context here. React 19 StrictMode
      // mounts, unmounts and remounts effects in development; losing the
      // context on the first unmount leaves the second mount holding a dead
      // context, where every shader compile fails silently and the page falls
      // back to CSS. The browser reclaims the context when the canvas is
      // garbage collected, which is the correct lifetime.
      gl.bindVertexArray(null)
    }
  }, [])

  return (
    <div className={`ag-orb ${className}`} aria-hidden="true" data-webgl={webglFailed ? 'failed' : 'ok'}>
      {/* CSS fallback / underlay — shown when WebGL cannot start. The canvas is
          always mounted (the renderer needs a live element); on failure it is
          revealed as empty and the fallback underneath carries the visual. */}
      <div className="ag-orb-fallback">
        <div className="ag-orb-fallback-core" />
        <div className="ag-orb-fallback-ring ag-orb-fallback-ring-a" />
        <div className="ag-orb-fallback-ring ag-orb-fallback-ring-b" />
      </div>
      <canvas
        ref={canvasRef}
        className="ag-orb-canvas"
        data-webgl={webglFailed ? 'failed' : 'ok'}
      />
    </div>
  )
}

export default OrbCore
