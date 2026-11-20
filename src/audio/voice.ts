/**
 * Customer "voices": Sims/Animal-Crossing-style gibberish made with a small formant synthesizer.
 * One sawtooth "vocal cord" → two resonant filters (vowel formants) → amplitude envelope per syllable.
 * Each customer gets their own VoiceParams, so everybody sounds different, and mood changes delivery.
 */
import type { Rng } from "../core/rng";
import { drive, noise, type Voice } from "./dsp";

export interface VoiceParams {
  pitch: number; // base f0 in Hz (≈ 85 deep … 260 high)
  formant: number; // vocal tract scale (0.85 big … 1.25 small)
  speed: number; // syllables speed multiplier (0.8 … 1.3)
  breath: number; // 0..1 breathiness
}

export type Mood = "neutral" | "happy" | "angry" | "question" | "sad";

/** [F1, F2] in Hz for a few vowels (a, e, i, o, u, schwa, æ). */
const VOWELS: [number, number][] = [
  [730, 1090],
  [530, 1840],
  [300, 2290],
  [570, 840],
  [320, 870],
  [500, 1500],
  [660, 1720],
];

export function randomVoiceParams(rnd: () => number): VoiceParams {
  const low = rnd() < 0.5;
  return {
    pitch: low ? 90 + rnd() * 60 : 170 + rnd() * 90,
    formant: low ? 0.85 + rnd() * 0.15 : 1.0 + rnd() * 0.22,
    speed: 0.85 + rnd() * 0.4,
    breath: rnd() * 0.6,
  };
}

export function voiceFromRng(rng: Rng): VoiceParams {
  return randomVoiceParams(() => rng.next());
}

/** Speak `syllables` of gibberish. Returns the end time. */
export function speak(v: Voice, vp: VoiceParams, mood: Mood, syllables: number): number {
  const { ac } = v;
  const moodCfg = {
    neutral: { pitch: 1, wobble: 0.07, speed: 1, gain: 0.5, drive: 0 },
    happy: { pitch: 1.15, wobble: 0.14, speed: 1.1, gain: 0.55, drive: 0 },
    angry: { pitch: 0.97, wobble: 0.18, speed: 1.35, gain: 0.75, drive: 0.55 },
    question: { pitch: 1.03, wobble: 0.08, speed: 1, gain: 0.5, drive: 0 },
    sad: { pitch: 0.88, wobble: 0.05, speed: 0.75, gain: 0.4, drive: 0 },
  }[mood];

  const f0 = vp.pitch * moodCfg.pitch;
  const speed = vp.speed * moodCfg.speed;

  const src = ac.createOscillator();
  src.type = "sawtooth";
  const vib = ac.createOscillator();
  vib.frequency.value = 5 + v.rnd() * 2;
  const vibG = ac.createGain();
  vibG.gain.value = f0 * 0.012;
  vib.connect(vibG).connect(src.frequency);

  const f1 = ac.createBiquadFilter();
  f1.type = "bandpass";
  f1.Q.value = 5;
  const f2 = ac.createBiquadFilter();
  f2.type = "bandpass";
  f2.Q.value = 8;
  const f2g = ac.createGain();
  f2g.gain.value = 0.55;
  const amp = ac.createGain();
  amp.gain.value = 0.0001;
  const tilt = ac.createBiquadFilter();
  tilt.type = "lowpass";
  tilt.frequency.value = 3800 * vp.formant;

  src.connect(f1).connect(amp);
  src.connect(f2).connect(f2g).connect(amp);
  const dest = moodCfg.drive > 0 ? drive(v, moodCfg.drive) : v.out;
  amp.connect(tilt).connect(dest);

  let t = v.t;
  src.frequency.setValueAtTime(f0, t);
  for (let i = 0; i < syllables; i++) {
    const dur = (0.075 + v.rnd() * 0.07) / speed;
    const [F1, F2] = VOWELS[Math.floor(v.rnd() * VOWELS.length)];
    f1.frequency.setTargetAtTime(F1 * vp.formant, t, 0.012);
    f2.frequency.setTargetAtTime(F2 * vp.formant, t, 0.012);

    // Pitch contour
    let target = f0 * (1 + (v.rnd() * 2 - 1) * moodCfg.wobble);
    const last = i >= syllables - 2;
    if (mood === "question" && last) target = f0 * (i === syllables - 1 ? 1.45 : 1.2);
    if (mood === "sad" || (mood === "neutral" && last)) target *= i === syllables - 1 ? 0.88 : 1;
    src.frequency.linearRampToValueAtTime(target, t + dur * 0.6);

    // Consonant onset (short noise burst) on about half the syllables
    if (v.rnd() < 0.55) {
      noise(v, { start: t, decay: 0.025, gain: 0.12 * moodCfg.gain, filter: "highpass", freq: 2500 + v.rnd() * 2500, dest });
    }
    const level = moodCfg.gain * (0.75 + v.rnd() * 0.25);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(level, t + 0.018);
    amp.gain.setValueAtTime(level, t + dur * 0.7);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vp.breath > 0.05) {
      noise(v, { start: t, attack: 0.02, decay: dur, gain: 0.05 * vp.breath * moodCfg.gain, filter: "bandpass", freq: F2 * vp.formant, q: 2, dest });
    }
    // Small gap; occasional "word" gap
    t += dur + (v.rnd() < 0.22 ? 0.09 : 0.015 + v.rnd() * 0.02) / speed;
  }
  src.start(v.t);
  vib.start(v.t);
  src.stop(t + 0.05);
  vib.stop(t + 0.05);
  return t;
}

/** "Ha-ha-ha": breathy descending syllables on "a". */
export function laugh(v: Voice, vp: VoiceParams): number {
  let end = v.t;
  const n = 4 + Math.floor(v.rnd() * 3);
  for (let i = 0; i < n; i++) {
    const start = v.t + i * (0.13 / vp.speed);
    noise(v, { start, decay: 0.04, gain: 0.12, filter: "bandpass", freq: 1200 * vp.formant, q: 1.5 });
    end = speak({ ...v, t: start + 0.01 }, { ...vp, pitch: vp.pitch * (1.35 - i * 0.06), speed: vp.speed * 1.6 }, "happy", 1);
  }
  return end;
}

/** Sharp inhale + short "oh!". */
export function gasp(v: Voice, vp: VoiceParams): number {
  noise(v, { attack: 0.12, decay: 0.08, gain: 0.22, filter: "bandpass", freq: 1400 * vp.formant, freqEnd: 2600 * vp.formant, q: 2 });
  return speak({ ...v, t: v.t + 0.2 }, { ...vp, pitch: vp.pitch * 1.3 }, "question", 1);
}
