/**
 * Audio engine: one AudioContext, a master bus and four category buses with user volumes.
 * No music by design. Only generated sound effects.
 *
 * Browsers only start audio after a user gesture; `unlockAudio()` is wired to the first
 * pointer/key event in main.ts. Until then, play() calls are silently ignored.
 */
import type { Voice } from "./dsp";
import { SFX, type SfxDef, type SfxId } from "./library";

export type Bus = "ui" | "world" | "voice" | "keyboard";
export const BUSES: Bus[] = ["ui", "world", "voice", "keyboard"];

export interface AudioSettings {
  master: number; // 0..1
  ui: number;
  world: number;
  voice: number;
  keyboard: number;
  muted: boolean;
}

const SETTINGS_KEY = "mkss.settings.audio"; // not part of the protected save: volume isn't cheatable
const DEFAULTS: AudioSettings = { master: 0.8, ui: 0.7, world: 0.9, voice: 0.8, keyboard: 1, muted: false };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;
const buses = new Map<Bus, GainNode>();
let settings: AudioSettings = loadSettings();

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AudioSettings>;
      const s = { ...DEFAULTS };
      for (const k of ["master", ...BUSES] as const) {
        if (typeof p[k] === "number" && p[k]! >= 0 && p[k]! <= 1) s[k] = p[k]!;
      }
      s.muted = p.muted === true;
      return s;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function getAudioSettings(): AudioSettings {
  return { ...settings };
}

export function setAudioSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  applyVolumes();
}

function applyVolumes() {
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, now, 0.02);
  for (const b of BUSES) buses.get(b)?.gain.setTargetAtTime(settings[b], now, 0.02);
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: "interactive" });
    // A gentle limiter keeps stacked sounds from clipping.
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    master = ctx.createGain();
    master.connect(limiter);
    for (const b of BUSES) {
      const g = ctx.createGain();
      g.connect(master);
      buses.set(b, g);
    }
    applyVolumes();
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

export interface PlayOpts {
  volume?: number; // 0..2 multiplier
  pan?: number; // -1 (left) .. 1 (right)
  delay?: number; // seconds
  /** Extra parameters some sounds understand (e.g. a customer's voice). */
  params?: Record<string, unknown>;
}

// Simple per-sound throttle so 20 identical calls in one frame don't become a wall of noise.
const lastPlayed = new Map<SfxId, number>();

export function play(id: SfxId, opts: PlayOpts = {}): void {
  // "suspended" is allowed: right after the first gesture the context is still resuming.
  if (!ctx || ctx.state === "closed" || settings.muted) return;
  const def: SfxDef = SFX[id];
  const now = ctx.currentTime;
  const last = lastPlayed.get(id) ?? -1;
  if (now - last < (def.minGap ?? 0.025)) return;
  lastPlayed.set(id, now);

  const bus = buses.get(def.bus)!;
  const g = ctx.createGain();
  g.gain.value = (opts.volume ?? 1) * (def.volume ?? 1);
  let out: AudioNode = g;
  if (opts.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, opts.pan));
    g.connect(p);
    out = p;
  }
  out.connect(bus);
  const voice: Voice = { ac: ctx, out: g, t: now + 0.005 + (opts.delay ?? 0), rnd: Math.random };
  const end = def.render(voice, opts.params ?? {});
  // Disconnect the per-sound nodes after they finish to keep the graph small.
  const ms = Math.max(50, (end - now + 0.2) * 1000);
  setTimeout(() => {
    g.disconnect();
    if (out !== g) out.disconnect();
  }, ms);
}

/** Render one sound offline (used by tests and the dev sound board's analyzer). */
export async function renderOffline(id: SfxId, params: Record<string, unknown> = {}, sampleRate = 44100) {
  const def: SfxDef = SFX[id];
  const maxLen = def.maxDuration ?? 4;
  const oac = new OfflineAudioContext(1, Math.ceil(sampleRate * maxLen), sampleRate);
  const g = oac.createGain();
  g.gain.value = def.volume ?? 1;
  g.connect(oac.destination);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const end = def.render({ ac: oac, out: g, t: 0.01, rnd }, params);
  const buf = await oac.startRendering();
  return { buffer: buf, declaredEnd: end };
}
