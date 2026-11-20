/**
 * Parametric keypress sound. Phase 5 will compute these parameters from the real build
 * (case, plate, foam, lube, switch, keycaps); for now presets drive it.
 */
import { noise, tone, vary, type Voice } from "./dsp";

export interface KeySoundProfile {
  depth: number; // 0 clacky/high … 1 deep thock
  brightness: number; // 0 muffled … 1 crisp
  hollow: number; // 0 dampened … 1 empty-case ping
  click: number; // 0 linear … 1 clicky click-jacket
  rattle: number; // 0 … 1 (stabilizers; mostly on big keys)
  scratch: number; // 0 smooth/lubed … 1 scratchy
  volume: number; // 0..1
}

export const KEY_PRESETS: Record<"thock" | "clack" | "clicky" | "marbly" | "membrane", KeySoundProfile> = {
  thock: { depth: 0.9, brightness: 0.3, hollow: 0.1, click: 0, rattle: 0, scratch: 0.05, volume: 0.8 },
  clack: { depth: 0.2, brightness: 0.85, hollow: 0.35, click: 0, rattle: 0, scratch: 0.2, volume: 0.8 },
  clicky: { depth: 0.4, brightness: 0.8, hollow: 0.2, click: 1, rattle: 0, scratch: 0.2, volume: 0.85 },
  marbly: { depth: 0.65, brightness: 0.6, hollow: 0.05, click: 0, rattle: 0, scratch: 0, volume: 0.7 },
  membrane: { depth: 0.5, brightness: 0.1, hollow: 0.0, click: 0, rattle: 0, scratch: 0.6, volume: 0.45 },
};

/** One keystroke (bottom-out + upstroke). `big` = spacebar/enter/shift (stabilized keys). */
export function keyPress(v: Voice, p: KeySoundProfile, big = false): number {
  const k = vary(v, 0.06);
  const vol = p.volume * (0.85 + v.rnd() * 0.3);
  let end = v.t;

  // Click jacket: sharp double tick before bottom-out.
  if (p.click > 0) {
    end = Math.max(end, noise(v, { decay: 0.006, gain: 0.55 * p.click * vol, filter: "highpass", freq: 4500 }));
    end = Math.max(end, tone(v, { freq: 5200 * k, decay: 0.012, gain: 0.12 * p.click * vol, type: "triangle" }));
  }
  const bottom = v.t + (p.click > 0 ? 0.012 : 0);

  // Impact transient: brightness decides the filter.
  const bodyF = (big ? 0.75 : 1) * (2600 - p.depth * 1800) * k;
  end = Math.max(end, noise(v, { start: bottom, decay: 0.02 + p.depth * 0.02, gain: 0.7 * vol, filter: "bandpass", freq: bodyF, q: 0.9 + p.brightness }));
  if (p.brightness > 0.4) {
    end = Math.max(end, noise(v, { start: bottom, decay: 0.008, gain: 0.25 * (p.brightness - 0.3) * vol, filter: "highpass", freq: 5000 }));
  }
  // Body tone: deep boards have a low "thock" resonance.
  const toneF = (big ? 0.7 : 1) * (520 - p.depth * 380) * k;
  end = Math.max(end, tone(v, { start: bottom, freq: toneF, freqEnd: toneF * 0.6, decay: 0.05 + p.depth * 0.05, gain: (0.25 + p.depth * 0.35) * vol }));
  // Hollow case ping
  if (p.hollow > 0.05) {
    end = Math.max(end, tone(v, { start: bottom, freq: 1900 * k, decay: 0.08 + p.hollow * 0.15, gain: 0.06 * p.hollow * vol, type: "sine" }));
  }
  // Scratchy (unlubed) switch: short grainy noise during travel
  if (p.scratch > 0.1) {
    end = Math.max(end, noise(v, { start: v.t - 0.002, attack: 0.004, decay: 0.02, gain: 0.1 * p.scratch * vol, filter: "bandpass", freq: 3200, q: 3 }));
  }
  // Upstroke (quieter, higher)
  const up = bottom + 0.07 + v.rnd() * 0.03;
  end = Math.max(end, noise(v, { start: up, decay: 0.015, gain: 0.22 * vol, filter: "bandpass", freq: bodyF * 1.4, q: 1.2 }));
  // Stabilizer rattle on big keys
  if (big && p.rattle > 0.05) {
    for (let i = 0; i < 3; i++) {
      end = Math.max(end, noise(v, { start: bottom + 0.012 + i * 0.011 + v.rnd() * 0.006, decay: 0.006, gain: 0.25 * p.rattle * vol, filter: "highpass", freq: 3500 }));
    }
  }
  return end;
}
