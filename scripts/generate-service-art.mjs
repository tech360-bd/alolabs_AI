#!/usr/bin/env node
/**
 * Generates the hero artwork for each service line.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The service pages had no imagery at all, so a reader hit a wall of text. The
 * obvious fix — stock photography — would be dishonest: we cannot photograph a
 * "multi-agent system", and a generic photo of people at laptops says nothing
 * about what the client receives. Cheap icon clip-art is what makes a page read
 * as unserious, which is exactly the complaint that prompted this work.
 *
 * So the artwork is generated from the service's own identity: two brand stops
 * and a motif that describes the IDEA of the service (a bounded tool network, a
 * pipeline that hands back to a person, identical environment blocks). It is
 * drawn as layered geometry with depth, grain and a light source, not as flat
 * line art, and it is deterministic — regenerating gives byte-identical output,
 * so it can live in version control without churn.
 *
 * ── What it deliberately does not show ──────────────────────────────────────
 * No agent counts, no department names, no upstream tooling, no third-party
 * marks. The composition describes what a client buys, nothing about how ALO
 * Labs assembles or supplies it.
 *
 * Usage:  node scripts/generate-service-art.mjs
 * Output: public/services/<slug>.webp  (1600×900, plus a 2× fallback)
 */

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/services');

const W = 1600;
const H = 900;

/** Deterministic PRNG so the artwork is reproducible. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
/** Blend two hex colours; t=0 → a, t=1 → b. */
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
}

/* ── Shared background: deep navy field, drifting light, fine grid ─────────── */
function background(c1, c2, seed) {
  const r = rng(seed);
  const blobs = Array.from({ length: 5 }, () => {
    const x = Math.round(r() * W), y = Math.round(r() * H);
    const rad = 280 + r() * 420;
    const col = r() > 0.5 ? c1 : c2;
    return `<circle cx="${x}" cy="${y}" r="${rad}" fill="url(#glow-${col.slice(1)})" opacity="${(0.16 + r() * 0.16).toFixed(3)}"/>`;
  }).join('');

  const lines = [];
  for (let x = 0; x <= W; x += 64) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
  for (let y = 0; y <= H; y += 64) lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);

  return `
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${blobs}
    <g stroke="rgba(255,255,255,0.045)" stroke-width="1">${lines.join('')}</g>
    <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  `;
}

/* ── Motifs ────────────────────────────────────────────────────────────────── */
/* Each returns SVG for one idea, drawn around the centre of the frame.        */

const CX = W / 2, CY = H / 2;

function motifCircuit(c1, c2, seed) {
  const r = rng(seed);
  const nodes = [];
  const edges = [];
  const cols = 6, rows = 4;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = 180 + i * 240 + (r() - 0.5) * 46;
      const y = 190 + j * 180 + (r() - 0.5) * 46;
      nodes.push({ x, y, big: r() > 0.78 });
    }
  }
  nodes.forEach((a, i) => {
    nodes.forEach((b, j) => {
      if (j <= i) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 300) edges.push({ a, b, d });
    });
  });
  return `
    <g stroke="${rgba(c1, 0.5)}" stroke-width="1.6" fill="none">
      ${edges.map(({ a, b }) => `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`).join('')}
    </g>
    <g>
      ${nodes.map((n) => `
        <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.big ? 11 : 5.5}" fill="${n.big ? c2 : '#ffffff'}" opacity="${n.big ? 0.95 : 0.55}"/>
        ${n.big ? `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="26" fill="none" stroke="${rgba(c2, 0.4)}" stroke-width="1.4"/>` : ''}
      `).join('')}
    </g>
  `;
}

function motifNetwork(c1, c2, seed) {
  const r = rng(seed);
  const hub = { x: CX, y: CY };
  const spokes = Array.from({ length: 9 }, (_, i) => {
    const ang = (i / 9) * Math.PI * 2 + r() * 0.25;
    const rad = 250 + r() * 110;
    return { x: hub.x + Math.cos(ang) * rad * 1.5, y: hub.y + Math.sin(ang) * rad * 0.78, i };
  });
  return `
    <g stroke="url(#beam)" stroke-width="2" fill="none">
      ${spokes.map((s) => `<line x1="${hub.x}" y1="${hub.y}" x2="${s.x.toFixed(1)}" y2="${s.y.toFixed(1)}"/>`).join('')}
    </g>
    <g>
      <circle cx="${hub.x}" cy="${hub.y}" r="92" fill="${rgba(c2, 0.16)}" stroke="${rgba(c2, 0.55)}" stroke-width="2"/>
      <circle cx="${hub.x}" cy="${hub.y}" r="54" fill="${rgba('#ffffff', 0.9)}"/>
      <circle cx="${hub.x}" cy="${hub.y}" r="140" fill="none" stroke="${rgba('#ffffff', 0.16)}" stroke-width="1.4" stroke-dasharray="3 9"/>
      ${spokes.map((s) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="16" fill="${rgba(c1, 0.9)}" stroke="${rgba('#ffffff', 0.5)}" stroke-width="1.5"/>`).join('')}
    </g>
  `;
}

function motifLayers(c1, c2, seed) {
  const r = rng(seed);
  const bandH = 74;
  const top = 190;
  // A slight left-to-right skew per layer reads as a stack seen at an angle,
  // which is what stops it looking like a loading skeleton.
  const bands = Array.from({ length: 6 }, (_, i) => {
    const t = i / 5;
    const y = top + i * (bandH + 16);
    const inset = 120 - i * 14;
    const skew = (r() - 0.5) * 16;
    const lit = mix(c1, c2, t);
    return `
      <g>
        <path d="M ${inset + skew} ${y} L ${W - inset + skew} ${y} L ${W - inset - 60 - skew} ${y + bandH} L ${inset + 60 - skew} ${y + bandH} Z"
              fill="${rgba(lit, 0.34 + t * 0.26)}" stroke="${rgba('#ffffff', 0.10 + t * 0.16)}" stroke-width="1.2"/>
        <path d="M ${inset + skew} ${y} L ${W - inset + skew} ${y}"
              stroke="${rgba('#ffffff', 0.30 + t * 0.35)}" stroke-width="2"/>
        <rect x="${inset + 84}" y="${y + 26}" width="${140 + t * 90}" height="14" rx="7" fill="${rgba('#ffffff', 0.22 + t * 0.2)}"/>
      </g>`;
  }).join('');
  // A beam linking the layers, so it reads as one system rather than six bars.
  const beam = Array.from({ length: 5 }, (_, i) => {
    const y1 = top + i * (bandH + 16) + bandH;
    const y2 = y1 + 16;
    return `<line x1="${CX}" y1="${y1}" x2="${CX}" y2="${y2}" stroke="${rgba('#ffffff', 0.5)}" stroke-width="2"/>`;
  }).join('');
  return `<g>${bands}</g><g filter="url(#bloom)">${beam}</g>`;
}

function motifFlow(c1, c2, seed) {
  const r = rng(seed);
  const nodesY = 180;
  const stages = Array.from({ length: 5 }, (_, i) => ({
    x: 300 + i * 250,
    y: nodesY + (r() - 0.5) * 26,
  }));
  const path = stages.map((s, i) => (i === 0 ? `M ${s.x} ${s.y}` : `L ${s.x} ${s.y}`)).join(' ');
  return `
    <path d="${path}" fill="none" stroke="${rgba(c1, 0.75)}" stroke-width="3"/>
    <path d="${path}" fill="none" stroke="${rgba('#ffffff', 0.85)}" stroke-width="1.2" stroke-dasharray="7 13"/>
    ${stages.map((s, i) => `
      <rect x="${s.x - 20}" y="${s.y - 20}" width="40" height="40" rx="10"
            fill="${rgba(i === stages.length - 1 ? c2 : mix(c1, c2, i / 4), 0.92)}"
            stroke="${rgba('#ffffff', 0.55)}" stroke-width="1.6"/>`).join('')}
    <path d="M ${stages[3].x} ${stages[3].y + 20} C ${stages[3].x} 430, ${stages[3].x - 90} 470, ${stages[3].x - 90} 560"
          fill="none" stroke="${rgba('#ffffff', 0.5)}" stroke-width="2" stroke-dasharray="6 8"/>
    <g>
      <circle cx="${stages[3].x - 90}" cy="600" r="52" fill="${rgba('#ffffff', 0.9)}"/>
      <circle cx="${stages[3].x - 90}" cy="556" r="19" fill="${mix(c1, '#000000', 0.35)}"/>
      <path d="M ${stages[3].x - 122} 632 Q ${stages[3].x - 90} 592 ${stages[3].x - 58} 632 Z" fill="${mix(c1, '#000000', 0.35)}"/>
    </g>
  `;
}

function motifBrowser(c1, c2, seed) {
  const x = 330, y = 200, w = 940, h = 520;
  const r = rng(seed);
  const cards = Array.from({ length: 6 }, (_, i) => {
    const cw = 250, ch = 120 + Math.round(r() * 60);
    const cx = x + 40 + (i % 3) * (cw + 26);
    const cy = y + 110 + Math.floor(i / 3) * 190;
    return `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="14" fill="${rgba(mix(c1, c2, (i / 6)), 0.34)}" stroke="${rgba('#ffffff', 0.18)}" stroke-width="1.3"/>`;
  }).join('');
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="rgba(255,255,255,0.06)" stroke="${rgba('#ffffff', 0.34)}" stroke-width="1.8"/>
      <line x1="${x}" y1="${y + 62}" x2="${x + w}" y2="${y + 62}" stroke="${rgba('#ffffff', 0.24)}" stroke-width="1.4"/>
      ${[0, 1, 2].map((i) => `<circle cx="${x + 42 + i * 30}" cy="${y + 31}" r="7" fill="${rgba('#ffffff', 0.4 - i * 0.08)}"/>`).join('')}
      <rect x="${x + 150}" y="${y + 19}" width="330" height="24" rx="12" fill="rgba(255,255,255,0.12)"/>
      <rect x="${x + 40}" y="${y + 88}" width="320" height="26" rx="8" fill="${rgba('#ffffff', 0.62)}"/>
      <rect x="${x + 40}" y="${y + 128}" width="230" height="15" rx="7" fill="${rgba('#ffffff', 0.24)}"/>
      ${cards}
    </g>
  `;
}

function motifGrid(c1, c2, seed) {
  const r = rng(seed);
  const x0 = 300, y0 = 190, cw = 152, ch = 108, gap = 16;
  const cells = [];
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 4; j++) {
      const t = (i + j) / 10;
      const hot = r() > 0.86;
      cells.push(`<rect x="${x0 + i * (cw + gap)}" y="${y0 + j * (ch + gap)}" width="${cw}" height="${ch}" rx="12"
        fill="${hot ? rgba(c2, 0.85) : rgba(mix(c1, c2, t), 0.24)}"
        stroke="${rgba('#ffffff', hot ? 0.55 : 0.14)}" stroke-width="1.2"/>`);
    }
  }
  return `<g>${cells.join('')}
    <path d="M ${x0 + 2 * (cw + gap)} ${y0 + ch / 2} C ${x0 + 900} ${y0 - 60}, ${x0 + 980} ${y0 + 470}, ${x0 + 6 * (cw + gap)} ${y0 + 2 * (ch + gap) + ch / 2}"
          fill="none" stroke="${rgba('#ffffff', 0.62)}" stroke-width="2.4" stroke-dasharray="8 9"/>
  </g>`;
}

function motifSignal(c1, c2, seed) {
  const r = rng(seed);
  const pts = Array.from({ length: 26 }, (_, i) => {
    const x = 240 + i * 44;
    const trend = 620 - i * 13;
    const noise = Math.sin(i * 0.9) * 26 + (r() - 0.5) * 30;
    return { x, y: trend + noise };
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y.toFixed(1)}`).join(' ');
  const area = `${d} L ${pts[pts.length - 1].x} 780 L ${pts[0].x} 780 Z`;
  return `
    <path d="${area}" fill="url(#area)"/>
    <path d="${d}" fill="none" stroke="${rgba('#ffffff', 0.92)}" stroke-width="3.2" stroke-linejoin="round"/>
    ${pts.filter((_, i) => i % 6 === 0).map((p) => `<circle cx="${p.x}" cy="${p.y.toFixed(1)}" r="6" fill="${c1}" stroke="#fff" stroke-width="1.6"/>`).join('')}
    <g opacity="0.5">${Array.from({ length: 6 }, (_, i) => `<line x1="240" y1="${300 + i * 86}" x2="1400" y2="${300 + i * 86}" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>`).join('')}</g>
  `;
}

function motifFrames(c1, c2, seed) {
  const r = rng(seed);
  const frames = Array.from({ length: 5 }, (_, i) => {
    const w = 380 - i * 34, h = 260 - i * 22;
    const x = 300 + i * 74;
    const y = 250 + i * 46;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18"
      fill="${rgba(mix(c1, c2, i / 5), 0.30 + i * 0.1)}"
      stroke="${rgba('#ffffff', 0.20 + i * 0.12)}" stroke-width="1.6"
      transform="rotate(${(r() - 0.5) * 5} ${x + w / 2} ${y + h / 2})"/>`;
  }).join('');
  return `<g>${frames}</g>`;
}

function motifWave(c1, c2, seed) {
  const bars = Array.from({ length: 52 }, (_, i) => {
    const t = i / 51;
    const env = Math.sin(t * Math.PI) ** 1.3;
    const h = 40 + env * 320 * (0.45 + 0.55 * Math.abs(Math.sin(i * 0.7)));
    const x = 220 + i * 23;
    return `<rect x="${x}" y="${(CY - h / 2).toFixed(1)}" width="9" height="${h.toFixed(1)}" rx="4.5"
      fill="${rgba(mix(c1, c2, t), 0.42 + env * 0.5)}"/>`;
  }).join('');
  return `<g>${bars}</g>
    <g filter="url(#bloom)">
      <circle cx="1372" cy="${CY}" r="74" fill="none" stroke="${rgba('#ffffff', 0.28)}" stroke-width="2" stroke-dasharray="5 12"/>
      <circle cx="1372" cy="${CY}" r="50" fill="${rgba('#ffffff', 0.94)}"/>
      <path d="M 1352 ${CY - 15} L 1372 ${CY + 15} L 1396 ${CY - 17}"
            fill="none" stroke="${mix(c1, '#000', 0.45)}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
}

function motifNodes(c1, c2, seed) {
  const left = Array.from({ length: 5 }, (_, i) => ({ x: 430, y: 220 + i * 118 }));
  const right = Array.from({ length: 5 }, (_, i) => ({ x: 1170, y: 220 + i * 118 }));
  const links = left.map((a, i) => `<path d="M ${a.x} ${a.y} C ${a.x + 300} ${a.y}, ${right[i].x - 300} ${right[i].y}, ${right[i].x} ${right[i].y}"
    fill="none" stroke="${rgba(mix(c1, c2, i / 5), 0.8)}" stroke-width="2.2"/>`).join('');
  const box = (p, fill) => `<rect x="${p.x - 26}" y="${p.y - 26}" width="52" height="52" rx="14" fill="${fill}" stroke="${rgba('#ffffff', 0.5)}" stroke-width="1.6"/>`;
  return `
    ${links}
    <circle cx="${CX}" cy="${CY}" r="86" fill="rgba(255,255,255,0.10)" stroke="${rgba('#ffffff', 0.6)}" stroke-width="2"/>
    <path d="M ${CX - 26} ${CY} L ${CX - 6} ${CY + 22} L ${CX + 30} ${CY - 20}"
          fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    ${left.map((p) => box(p, rgba(c1, 0.85))).join('')}
    ${right.map((p) => box(p, rgba(c2, 0.85))).join('')}
  `;
}

function motifChart(c1, c2, seed) {
  const r = rng(seed);
  const bars = Array.from({ length: 8 }, (_, i) => {
    const h = 120 + r() * 330;
    const x = 330 + i * 128;
    return `<rect x="${x}" y="${(730 - h).toFixed(1)}" width="76" height="${h.toFixed(1)}" rx="10"
      fill="${rgba(mix(c1, c2, i / 8), 0.72)}" stroke="${rgba('#ffffff', 0.22)}" stroke-width="1.2"/>
      <line x1="${x}" y1="${(730 - h - 30).toFixed(1)}" x2="${x + 76}" y2="${(730 - h - 30).toFixed(1)}"
            stroke="${rgba('#ffffff', 0.35)}" stroke-width="2" stroke-dasharray="4 6"/>`;
  }).join('');
  return `<g>${bars}
    <line x1="300" y1="740" x2="1400" y2="740" stroke="${rgba('#ffffff', 0.4)}" stroke-width="2"/>
  </g>`;
}

function motifCloud(c1, c2, seed) {
  const defs = [0, 1, 2].map((i) => {
    const y = 300 + i * 150;
    return `<g opacity="${0.9 - i * 0.12}">
      <rect x="${300 + i * 60}" y="${y}" width="${900 - i * 120}" height="86" rx="20"
            fill="${rgba(mix(c1, c2, i / 3), 0.30)}" stroke="${rgba('#ffffff', 0.26)}" stroke-width="1.5"/>
      ${Array.from({ length: 4 }, (_, k) => `<rect x="${340 + i * 60 + k * 190}" y="${y + 30}" width="120" height="26" rx="8" fill="${rgba('#ffffff', 0.30)}"/>`).join('')}
    </g>`;
  }).join('');
  const arrows = [0, 1, 2].map((i) => {
    const y = 300 + i * 150 + 86;
    return `<path d="M ${CX} ${y} L ${CX} ${y + 64}" stroke="${rgba('#ffffff', 0.42)}" stroke-width="2.2" marker-end="url(#arrow)" fill="none"/>`;
  }).join('');
  return `<g>${defs}${arrows}</g>`;
}

const MOTIFS = {
  circuit: motifCircuit, network: motifNetwork, layers: motifLayers, flow: motifFlow,
  browser: motifBrowser, grid: motifGrid, signal: motifSignal, frames: motifFrames,
  wave: motifWave, nodes: motifNodes, chart: motifChart, cloud: motifCloud,
};

function buildSvg({ slug, gradient, motif }) {
  const [c1, c2] = gradient;
  const seed = [...slug].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const motifSvg = (MOTIFS[motif] ?? motifNetwork)(c1, c2, seed);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#03060F"/>
      <stop offset="0.55" stop-color="#061024"/>
      <stop offset="1" stop-color="#040A18"/>
    </linearGradient>
    <radialGradient id="glow-${c1.slice(1)}"><stop offset="0" stop-color="${c1}" stop-opacity="1"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
    <radialGradient id="glow-${c2.slice(1)}"><stop offset="0" stop-color="${c2}" stop-opacity="1"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>
    <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${rgba(c2, 0.85)}"/><stop offset="1" stop-color="${rgba(c1, 0.25)}"/>
    </linearGradient>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${rgba(c1, 0.55)}"/><stop offset="1" stop-color="${rgba(c1, 0)}"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <radialGradient id="focal" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${rgba(c2, 0.5)}"/>
      <stop offset="0.45" stop-color="${rgba(c1, 0.16)}"/>
      <stop offset="1" stop-color="${rgba(c1, 0)}"/>
    </radialGradient>
    <!-- Depth: every motif group gets a soft shadow so it sits *above* the
         field instead of being printed flat onto it. This is the single
         change that stops the artwork looking like a placeholder. -->
    <filter id="lift" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.55"/>
    </filter>
    <filter id="bloom" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${rgba('#ffffff', 0.5)}"/>
    </marker>
  </defs>
  ${background(c1, c2, seed)}
  <ellipse cx="${CX}" cy="${CY}" rx="720" ry="430" fill="url(#focal)"/>
  <g filter="url(#lift)">${motifSvg}</g>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.05" style="mix-blend-mode:overlay"/>
</svg>`;
}

async function main() {
  const mod = await import(path.join(root, 'src/lib/brand/service-depth.ts')).catch(() => null);
  // The .ts file cannot be imported directly by node; read the gradient/motif
  // pairs from a small JSON sidecar the build emits, or parse them from source.
  const { readFileSync } = await import('node:fs');
  let depthSource = readFileSync(path.join(root, 'src/lib/brand/service-depth.ts'), 'utf8');

  mkdirSync(outDir, { recursive: true });

  const entries = [];
  const blockRe = /'([a-z0-9-]+)':\s*\{[\s\S]*?visual:\s*\{\s*gradient:\s*\['(#[0-9A-Fa-f]{6})',\s*'(#[0-9A-Fa-f]{6})'\],\s*motif:\s*'([a-z]+)'/g;
  let m;
  while ((m = blockRe.exec(depthSource)) !== null) {
    entries.push({ slug: m[1], gradient: [m[2], m[3]], motif: m[4] });
  }

  for (const entry of entries) {
    const svg = buildSvg(entry);
    const out = path.join(outDir, `${entry.slug}.webp`);
    await sharp(Buffer.from(svg)).webp({ quality: 90, effort: 6 }).toFile(out);
    process.stdout.write(`  ${entry.slug.padEnd(30)} ${entry.motif.padEnd(8)} ${entry.gradient.join(' → ')}\n`);
  }
  process.stdout.write(`\n${entries.length} images → public/services/\n`);
}

main().catch((error) => {
  console.error('service art generation failed:', error.message);
  process.exit(1);
});
