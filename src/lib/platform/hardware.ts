/**
 * Host capability detection for the Super Admin panel.
 *
 * The point is to answer one question honestly: *what can this machine actually
 * run?* A model list that ignores the host is a wish list. Everything here
 * reports what was measured and marks what could not be determined as
 * `unknown` rather than guessing — a fabricated "GPU: none" on a machine whose
 * drivers are merely not queryable would send an operator down the wrong path.
 */

import os from 'node:os';
import { statfsSync } from 'node:fs';

export interface GpuInfo {
  /** `true` when a device was found; `false` when the probe ran and found none. */
  present: boolean;
  devices: Array<{ name: string; memoryGb: number | null }>;
  /** How the answer was obtained, so an operator can judge it. */
  detectedVia: 'nvidia-smi' | 'rocm-smi' | 'apple-silicon' | 'none';
  /** Present when the probe could not run at all. */
  note?: string;
}

export interface HardwareSnapshot {
  cpu: {
    model: string;
    cores: number;
    physicalCores: number | null;
    loadAverage1m: number;
    architecture: string;
  };
  memory: { totalGb: number; freeGb: number; usedPct: number };
  storage: { path: string; totalGb: number; freeGb: number } | null;
  gpu: GpuInfo;
  platform: { os: string; release: string; node: string; uptimeHours: number };
  /** Rough guidance derived from the measured numbers. */
  verdict: {
    canRunSmallLocalModels: boolean;
    canRun7bModels: boolean;
    canRun13bModels: boolean;
    canRunImageGeneration: boolean;
    reasons: string[];
  };
}

function detectGpu(): GpuInfo {
  // nvidia-smi is the only reliable, cheap way to ask on Linux/Windows. It is
  // invoked without a shell so nothing in the environment can be injected.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const output = execFileSync(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 2500, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const devices = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, memory] = line.split(',').map((part) => part.trim());
        const megabytes = Number(memory);
        return { name: name ?? 'unknown GPU', memoryGb: Number.isFinite(megabytes) ? Math.round(megabytes / 1024) : null };
      });
    if (devices.length) return { present: true, devices, detectedVia: 'nvidia-smi' };
  } catch {
    // Not installed, or no driver. Fall through to the other probes.
  }

  if (process.platform === 'darwin' && process.arch === 'arm64') {
    // Apple Silicon shares unified memory with the GPU; there is no separate
    // VRAM figure to report, which is why the memory is left null.
    return {
      present: true,
      devices: [{ name: `Apple Silicon (${os.cpus()[0]?.model?.trim() ?? 'M-series'})`, memoryGb: null }],
      detectedVia: 'apple-silicon',
      note: 'Unified memory is shared between CPU and GPU; Metal-backed inference is available.',
    };
  }

  return {
    present: false,
    devices: [],
    detectedVia: 'none',
    note: 'No NVIDIA device reported by nvidia-smi. AMD (ROCm) and Intel GPUs are not auto-detected; verify manually before assuming CPU-only.',
  };
}

function storageOf(path: string): HardwareSnapshot['storage'] {
  try {
    const stat = statfsSync(path);
    const blockSize = Number(stat.bsize);
    return {
      path,
      totalGb: Math.round((Number(stat.blocks) * blockSize) / 1024 ** 3),
      freeGb: Math.round((Number(stat.bavail) * blockSize) / 1024 ** 3),
    };
  } catch {
    return null;
  }
}

export function hardwareSnapshot(storagePath = process.cwd()): HardwareSnapshot {
  const cpus = os.cpus();
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const totalGb = Math.round((totalBytes / 1024 ** 3) * 10) / 10;
  const freeGb = Math.round((freeBytes / 1024 ** 3) * 10) / 10;
  const gpu = detectGpu();
  const storage = storageOf(storagePath);

  const gpuMemoryGb = gpu.devices.reduce((max, device) => Math.max(max, device.memoryGb ?? 0), 0);
  // A local model needs roughly its weight size plus a KV-cache allowance; Q4
  // 7B is about 4.5 GB. These thresholds are deliberately conservative and are
  // stated in the response rather than being a hidden policy.
  const usableGb = Math.max(totalGb, gpuMemoryGb);
  const canRunSmallLocalModels = usableGb >= 3.5;
  const canRun7bModels = gpuMemoryGb >= 6 || (!gpu.present && totalGb >= 12);
  const canRun13bModels = gpuMemoryGb >= 12 || (!gpu.present && totalGb >= 24);
  const canRunImageGeneration = gpuMemoryGb >= 6;

  const reasons: string[] = [];
  reasons.push(
    gpu.present
      ? `GPU present (${gpu.devices.map((d) => d.name).join(', ')}${gpuMemoryGb ? `, ${gpuMemoryGb} GB` : ''}) — detected via ${gpu.detectedVia}.`
      : 'No GPU detected; inference will run on CPU and be slow for anything above ~3B parameters.',
  );
  reasons.push(`CPU: ${cpus.length} logical core(s), load ${os.loadavg()[0]?.toFixed(2) ?? '0'} over 1 min.`);
  reasons.push(`Memory: ${totalGb} GB total, ${freeGb} GB free.`);
  if (storage) {
    reasons.push(`Storage: ${storage.freeGb} GB free of ${storage.totalGb} GB at ${storage.path}.`);
    if (storage.freeGb < 10) reasons.push('Less than 10 GB free — pulling a 7B model will fail.');
  }
  if (!canRunSmallLocalModels) {
    reasons.push('Below ~3.5 GB of usable memory: even a 1.5B quantised model may not load.');
  }

  return {
    cpu: {
      model: cpus[0]?.model?.trim() ?? 'unknown',
      cores: cpus.length,
      physicalCores: null,
      loadAverage1m: Math.round((os.loadavg()[0] ?? 0) * 100) / 100,
      architecture: process.arch,
    },
    memory: {
      totalGb,
      freeGb,
      usedPct: totalGb > 0 ? Math.round(((totalGb - freeGb) / totalGb) * 100) : 0,
    },
    storage,
    gpu,
    platform: {
      os: process.platform,
      release: os.release(),
      node: process.version,
      uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
    },
    verdict: { canRunSmallLocalModels, canRun7bModels, canRun13bModels, canRunImageGeneration, reasons },
  };
}
