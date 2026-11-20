/**
 * Every sound effect in the game, generated from code. No audio files and no music.
 * Add a sound: add an entry here + a name in i18n (`sfx.<id>`); tests check both.
 */
import { envGain, midi, noise, tone, vary, type Voice } from "./dsp";
import { KEY_PRESETS, keyPress, type KeySoundProfile } from "./keyPress";
import { gasp, laugh, randomVoiceParams, speak, type Mood, type VoiceParams } from "./voice";
import type { Bus } from "./engine";

export type SfxCategory = "ui" | "money" | "progress" | "shop" | "bench" | "keyboard" | "customer" | "cheater";

export interface SfxDef {
  bus: Bus;
  category: SfxCategory;
  volume?: number;
  minGap?: number; // seconds between repeats of the same sound
  maxDuration?: number; // upper bound used by tests / offline render
  render(v: Voice, params: Record<string, unknown>): number; // returns end time
}

// ---------- shared recipes ----------

/** Struck metal bell: inharmonic partials with long decay. */
function bell(v: Voice, f: number, gain: number, decay = 1.2, start = v.t) {
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.0, 0.6, 0.7],
    [2.76, 0.45, 0.5],
    [5.4, 0.25, 0.3],
    [8.9, 0.12, 0.18],
  ];
  let end = start;
  for (const [ratio, g, d] of partials) {
    end = Math.max(end, tone(v, { start, freq: f * ratio, decay: decay * d, gain: gain * g, attack: 0.002 }));
  }
  return end;
}

function blip(v: Voice, notes: number[], step: number, gain: number, type: OscillatorType = "square", last = 0.12) {
  let end = v.t;
  notes.forEach((n, i) => {
    const isLast = i === notes.length - 1;
    end = tone(v, {
      start: v.t + i * step,
      freq: midi(n),
      type,
      hold: isLast ? last * 0.3 : step * 0.5,
      decay: isLast ? last : step * 0.6,
      gain,
      filter: { type: "lowpass", freq: 3200 },
    });
  });
  return end;
}

function thud(v: Voice, f: number, gain: number, start = v.t) {
  const a = tone(v, { start, freq: f, freqEnd: f * 0.55, decay: 0.18, gain });
  const b = noise(v, { start, decay: 0.09, gain: gain * 0.7, filter: "lowpass", freq: 900 });
  return Math.max(a, b);
}

const voiceOf = (v: Voice, p: Record<string, unknown>): VoiceParams =>
  (p.voice as VoiceParams | undefined) ?? randomVoiceParams(v.rnd);

const talk = (mood: Mood, min: number, max: number) => (v: Voice, p: Record<string, unknown>) =>
  speak(v, voiceOf(v, p), mood, (p.syllables as number | undefined) ?? min + Math.floor(v.rnd() * (max - min + 1)));

const key = (preset: keyof typeof KEY_PRESETS, big = false) => (v: Voice, p: Record<string, unknown>) =>
  keyPress(v, (p.profile as KeySoundProfile | undefined) ?? KEY_PRESETS[preset], big);

// ---------- the library ----------

export const SFX = {
  // ===== UI =====
  "ui.click": {
    bus: "ui",
    category: "ui",
    render: (v) => {
      noise(v, { decay: 0.018, gain: 0.35, filter: "highpass", freq: 2800 });
      return tone(v, { freq: 1500 * vary(v, 0.05), freqEnd: 1000, decay: 0.03, gain: 0.18, type: "triangle" });
    },
  },
  "ui.hover": {
    bus: "ui",
    category: "ui",
    minGap: 0.05,
    render: (v) => tone(v, { freq: 2600 * vary(v, 0.04), decay: 0.025, gain: 0.05, type: "sine" }),
  },
  "ui.confirm": { bus: "ui", category: "ui", render: (v) => blip(v, [76, 83], 0.06, 0.12) },
  "ui.back": { bus: "ui", category: "ui", render: (v) => blip(v, [79, 72], 0.06, 0.1) },
  "ui.error": {
    bus: "ui",
    category: "ui",
    render: (v) => {
      let end = v.t;
      for (let i = 0; i < 2; i++) {
        for (const f of [110, 117]) {
          end = tone(v, { start: v.t + i * 0.16, freq: f, type: "sawtooth", hold: 0.08, decay: 0.05, gain: 0.13, filter: { type: "lowpass", freq: 900 } });
        }
      }
      return end;
    },
  },
  "ui.toast": {
    bus: "ui",
    category: "ui",
    render: (v) => tone(v, { freq: 620, freqEnd: 1500, glide: 0.06, decay: 0.09, gain: 0.22, type: "sine" }),
  },
  "ui.open": {
    volume: 1.8,
    bus: "ui",
    category: "ui",
    render: (v) => noise(v, { attack: 0.06, decay: 0.14, gain: 0.18, filter: "bandpass", freq: 400, freqEnd: 2600, q: 1.5 }),
  },
  "ui.close": {
    volume: 1.8,
    bus: "ui",
    category: "ui",
    render: (v) => noise(v, { attack: 0.03, decay: 0.14, gain: 0.16, filter: "bandpass", freq: 2600, freqEnd: 400, q: 1.5 }),
  },
  "ui.toggle": {
    bus: "ui",
    category: "ui",
    render: (v) => {
      noise(v, { decay: 0.01, gain: 0.3, filter: "highpass", freq: 3500 });
      return tone(v, { start: v.t + 0.01, freq: 900, decay: 0.04, gain: 0.1, type: "square", filter: { type: "lowpass", freq: 2500 } });
    },
  },

  // ===== Money =====
  "money.coin": {
    bus: "ui",
    category: "money",
    render: (v) => {
      tone(v, { freq: midi(83), hold: 0.05, decay: 0.02, gain: 0.1, type: "square", filter: { type: "lowpass", freq: 5000 } });
      return tone(v, { start: v.t + 0.07, freq: midi(88), hold: 0.08, decay: 0.3, gain: 0.1, type: "square", filter: { type: "lowpass", freq: 5000 } });
    },
  },
  "money.register": {
    bus: "world",
    category: "money",
    maxDuration: 2.5,
    render: (v) => {
      // Drawer clunk, then the "ching" bell
      thud(v, 140, 0.4);
      noise(v, { start: v.t + 0.02, attack: 0.03, decay: 0.12, gain: 0.15, filter: "bandpass", freq: 1800, q: 2 });
      return bell(v, 2100 * vary(v, 0.02), 0.16, 1.4, v.t + 0.12);
    },
  },
  "money.spend": {
    bus: "ui",
    category: "money",
    render: (v) => blip(v, [84, 79, 76, 72], 0.065, 0.08, "square", 0.15),
  },

  // ===== Progress =====
  "progress.goal": {
    bus: "ui",
    category: "progress",
    maxDuration: 2.5,
    render: (v) => {
      blip(v, [72, 76, 79], 0.09, 0.1, "triangle");
      tone(v, { start: v.t + 0.27, freq: midi(84), type: "triangle", hold: 0.25, decay: 0.6, gain: 0.14, vibratoHz: 6, vibratoDepth: 6 });
      tone(v, { start: v.t + 0.27, freq: midi(79), type: "triangle", hold: 0.25, decay: 0.6, gain: 0.08 });
      return bell(v, midi(96), 0.05, 1.0, v.t + 0.27);
    },
  },
  "progress.unlock": {
    bus: "ui",
    category: "progress",
    maxDuration: 2,
    render: (v) => {
      let end = tone(v, { freq: 400, freqEnd: 1600, glide: 0.4, attack: 0.05, hold: 0.25, decay: 0.3, gain: 0.08, type: "triangle" });
      for (let i = 0; i < 12; i++) {
        end = Math.max(end, tone(v, { start: v.t + i * 0.045, freq: 2000 + v.rnd() * 3500, decay: 0.12, gain: 0.04, type: "sine" }));
      }
      return end;
    },
  },
  "progress.dayStart": {
    bus: "world",
    category: "progress",
    maxDuration: 3,
    render: (v) => {
      bell(v, midi(79), 0.14, 1.4);
      return bell(v, midi(84), 0.14, 1.6, v.t + 0.22);
    },
  },
  "progress.dayEnd": {
    bus: "world",
    category: "progress",
    maxDuration: 2.5,
    render: (v) => {
      // Metal shutter rolling down: fast ratchet ticks, then a thud
      const n = 22;
      for (let i = 0; i < n; i++) {
        const t = v.t + i * 0.045 * (1 + i / 60);
        noise(v, { start: t, decay: 0.03, gain: 0.12, filter: "bandpass", freq: 1400 + v.rnd() * 600, q: 3 });
      }
      noise(v, { attack: 0.1, hold: 0.8, decay: 0.2, gain: 0.05, filter: "lowpass", freq: 700 });
      return thud(v, 90, 0.55, v.t + n * 0.045 * 1.2);
    },
  },
  "progress.reviewGood": {
    bus: "ui",
    category: "progress",
    render: (v) => {
      blip(v, [79, 84], 0.08, 0.1, "triangle", 0.25);
      return bell(v, midi(91), 0.05, 0.6, v.t + 0.08);
    },
  },
  "progress.reviewBad": {
    bus: "ui",
    category: "progress",
    render: (v) => tone(v, { freq: 220, freqEnd: 80, glide: 0.5, hold: 0.2, decay: 0.35, gain: 0.2, type: "sawtooth", filter: { type: "lowpass", freq: 700 } }),
  },

  // ===== Shop / world =====
  "shop.doorBell": {
    bus: "world",
    category: "shop",
    maxDuration: 2.5,
    render: (v) => {
      const f = 1650 * vary(v, 0.05);
      let end = v.t;
      const hits = 3 + Math.floor(v.rnd() * 2);
      for (let i = 0; i < hits; i++) {
        end = Math.max(end, bell(v, f * (i % 2 ? 1.19 : 1), 0.12 / (1 + i * 0.6), 0.9, v.t + i * (0.08 + v.rnd() * 0.04)));
      }
      return end;
    },
  },
  "shop.footstep": {
    bus: "world",
    category: "shop",
    minGap: 0.08,
    render: (v) => {
      const k = vary(v, 0.15);
      noise(v, { decay: 0.05, gain: 0.22, filter: "lowpass", freq: 700 * k });
      noise(v, { start: v.t + 0.01, decay: 0.03, gain: 0.05, filter: "highpass", freq: 3000 });
      return tone(v, { freq: 90 * k, decay: 0.05, gain: 0.2 });
    },
  },
  "shop.stomp": {
    bus: "world",
    category: "shop",
    minGap: 0.1,
    render: (v) => thud(v, 75 * vary(v, 0.1), 0.6),
  },
  "shop.doorSlam": {
    bus: "world",
    category: "shop",
    maxDuration: 2,
    render: (v) => {
      thud(v, 65, 0.8);
      noise(v, { decay: 0.25, gain: 0.25, filter: "lowpass", freq: 1500 });
      // Bell jingles angrily after the slam
      let end = v.t;
      for (let i = 0; i < 5; i++) end = Math.max(end, bell(v, 1650 * (i % 2 ? 1.19 : 1), 0.07, 0.5, v.t + 0.05 + i * 0.06));
      return end;
    },
  },
  "shop.delivery": {
    bus: "world",
    category: "shop",
    render: (v) => {
      let end = v.t;
      for (let i = 0; i < 2; i++) {
        for (const f of [370, 466]) {
          end = tone(v, { start: v.t + i * 0.26, freq: f, type: "square", hold: 0.15, decay: 0.05, gain: 0.08, filter: { type: "lowpass", freq: 1400 } });
        }
      }
      return end;
    },
  },
  "shop.boxDrop": {
    bus: "world",
    category: "shop",
    render: (v) => {
      thud(v, 95 * vary(v, 0.1), 0.6);
      return noise(v, { start: v.t + 0.005, decay: 0.12, gain: 0.2, filter: "bandpass", freq: 600, q: 1.2 });
    },
  },
  "shop.boxOpen": {
    volume: 1.5,
    bus: "world",
    category: "shop",
    render: (v) => {
      // Packing tape ripping (crackly bursts) then cardboard flaps
      let end = v.t;
      const n = 14 + Math.floor(v.rnd() * 6);
      for (let i = 0; i < n; i++) {
        end = noise(v, { start: v.t + i * 0.018 + v.rnd() * 0.006, decay: 0.015, gain: 0.15 + v.rnd() * 0.1, filter: "bandpass", freq: 1800 + v.rnd() * 2500, q: 1.5 });
      }
      end = Math.max(end, noise(v, { start: end + 0.05, decay: 0.07, gain: 0.2, filter: "lowpass", freq: 1200 }));
      return Math.max(end, noise(v, { start: end + 0.1, decay: 0.07, gain: 0.18, filter: "lowpass", freq: 1000 }));
    },
  },
  "shop.shelfPlace": {
    bus: "world",
    category: "shop",
    render: (v) => {
      noise(v, { decay: 0.03, gain: 0.2, filter: "bandpass", freq: 1500 * vary(v, 0.2), q: 1.5 });
      return tone(v, { freq: 260 * vary(v, 0.15), decay: 0.06, gain: 0.2 });
    },
  },
  "shop.computerBeep": { bus: "world", category: "shop", render: (v) => blip(v, [84, 91], 0.08, 0.06, "sine", 0.1) },
  "shop.notification": {
    bus: "ui",
    category: "shop",
    render: (v) => {
      tone(v, { freq: midi(88), decay: 0.25, gain: 0.12 });
      return tone(v, { start: v.t + 0.1, freq: midi(93), decay: 0.35, gain: 0.12 });
    },
  },

  // ===== Workbench =====
  "bench.switchOpen": {
    bus: "world",
    category: "bench",
    render: (v) => {
      noise(v, { decay: 0.012, gain: 0.5, filter: "highpass", freq: 2500 });
      return tone(v, { freq: 950 * vary(v, 0.08), freqEnd: 420, decay: 0.05, gain: 0.2, type: "triangle" });
    },
  },
  "bench.spring": {
    bus: "world",
    category: "bench",
    render: (v) =>
      tone(v, { freq: 310 * vary(v, 0.08), freqEnd: 210, decay: 0.45, gain: 0.18, type: "triangle", vibratoHz: 22, vibratoDepth: 70 }),
  },
  "bench.lubeBrush": {
    volume: 1.6,
    bus: "world",
    category: "bench",
    minGap: 0.06,
    render: (v) => {
      noise(v, { attack: 0.04, hold: 0.04, decay: 0.1, gain: 0.2, filter: "bandpass", freq: 650 * vary(v, 0.15), freqEnd: 1300, q: 2.5 });
      return tone(v, { attack: 0.03, freq: 140, freqEnd: 190, decay: 0.12, gain: 0.08, vibratoHz: 30, vibratoDepth: 25 });
    },
  },
  "bench.screw": {
    bus: "world",
    category: "bench",
    render: (v) => {
      let end = v.t;
      for (let i = 0; i < 6; i++) {
        const t = v.t + i * 0.055 + v.rnd() * 0.01;
        noise(v, { start: t, decay: 0.01, gain: 0.3, filter: "highpass", freq: 3000 });
        end = tone(v, { start: t, freq: 2300 * vary(v, 0.05), decay: 0.012, gain: 0.06, type: "square", filter: { type: "lowpass", freq: 5000 } });
      }
      return end;
    },
  },
  "bench.solder": {
    bus: "world",
    category: "bench",
    maxDuration: 2,
    render: (v) => {
      let end = noise(v, { attack: 0.05, hold: 0.35, decay: 0.3, gain: 0.09, filter: "highpass", freq: 4500 });
      for (let i = 0; i < 10; i++) {
        end = Math.max(end, noise(v, { start: v.t + 0.05 + v.rnd() * 0.6, decay: 0.004, gain: 0.2 * v.rnd(), filter: "highpass", freq: 3000 }));
      }
      return end;
    },
  },
  "bench.keycapPull": {
    bus: "world",
    category: "bench",
    render: (v) => {
      noise(v, { decay: 0.015, gain: 0.2, filter: "bandpass", freq: 2500, q: 1 });
      return tone(v, { freq: 450 * vary(v, 0.1), freqEnd: 1250, glide: 0.04, decay: 0.05, gain: 0.22 });
    },
  },
  "bench.keycapPlace": {
    bus: "world",
    category: "bench",
    render: (v) => {
      noise(v, { decay: 0.012, gain: 0.35, filter: "bandpass", freq: 2200 * vary(v, 0.1), q: 1.2 });
      return tone(v, { freq: 700 * vary(v, 0.1), decay: 0.03, gain: 0.12 });
    },
  },
  "bench.pcbSnap": {
    bus: "world",
    category: "bench",
    render: (v) => {
      noise(v, { decay: 0.015, gain: 0.45, filter: "bandpass", freq: 3200, q: 1.5 });
      tone(v, { freq: 1500, decay: 0.02, gain: 0.1, type: "square", filter: { type: "lowpass", freq: 4000 } });
      return thud(v, 160, 0.25, v.t + 0.02);
    },
  },
  "bench.foam": {
    volume: 1.3,
    bus: "world",
    category: "bench",
    render: (v) => noise(v, { attack: 0.05, hold: 0.05, decay: 0.15, gain: 0.3, filter: "lowpass", freq: 550 * vary(v, 0.2), freqEnd: 300 }),
  },
  "bench.tape": {
    volume: 1.8,
    bus: "world",
    category: "bench",
    render: (v) => {
      let end = v.t;
      for (let i = 0; i < 24; i++) {
        end = noise(v, { start: v.t + i * 0.02, decay: 0.018, gain: 0.1 + v.rnd() * 0.08, filter: "bandpass", freq: 1200 + i * 60 + v.rnd() * 800, q: 2 });
      }
      return end;
    },
  },
  "bench.stabRattle": {
    bus: "keyboard",
    category: "bench",
    render: (v) => keyPress(v, { ...KEY_PRESETS.clack, rattle: 1 }, true),
  },
  "bench.testerBeep": {
    bus: "ui",
    category: "bench",
    minGap: 0.03,
    render: (v) => tone(v, { freq: 1760, hold: 0.03, decay: 0.03, gain: 0.08, type: "square", filter: { type: "lowpass", freq: 4000 } }),
  },
  "bench.deadKey": {
    volume: 0.7,
    bus: "ui",
    category: "bench",
    render: (v) => tone(v, { freq: 98, type: "square", hold: 0.16, decay: 0.06, gain: 0.14, filter: { type: "lowpass", freq: 700 } }),
  },
  "bench.buildComplete": {
    bus: "ui",
    category: "bench",
    maxDuration: 3,
    render: (v) => {
      blip(v, [72, 76, 79, 84, 88], 0.07, 0.09, "triangle", 0.5);
      let end = v.t;
      for (let i = 0; i < 14; i++) {
        end = Math.max(end, tone(v, { start: v.t + 0.3 + i * 0.04, freq: 2500 + v.rnd() * 4000, decay: 0.15, gain: 0.035 }));
      }
      return Math.max(end, bell(v, midi(100), 0.05, 1.2, v.t + 0.35));
    },
  },

  // ===== Keyboard typing (presets of the parametric engine) =====
  "kb.thock": { bus: "keyboard", category: "keyboard", minGap: 0.01, render: key("thock") },
  "kb.clack": { bus: "keyboard", category: "keyboard", minGap: 0.01, render: key("clack") },
  "kb.clicky": { bus: "keyboard", category: "keyboard", minGap: 0.01, render: key("clicky") },
  "kb.marbly": { bus: "keyboard", category: "keyboard", minGap: 0.01, render: key("marbly") },
  "kb.membrane": { bus: "keyboard", category: "keyboard", minGap: 0.01, render: key("membrane") },
  "kb.spacebar": { bus: "keyboard", category: "keyboard", minGap: 0.01, render: key("thock", true) },

  // ===== Customers =====
  "voice.talk": { bus: "voice", category: "customer", minGap: 0.2, maxDuration: 3, render: talk("neutral", 5, 9) },
  "voice.happy": { bus: "voice", category: "customer", minGap: 0.2, maxDuration: 3, render: talk("happy", 4, 7) },
  "voice.question": { bus: "voice", category: "customer", minGap: 0.2, maxDuration: 3, render: talk("question", 4, 7) },
  "voice.angry": { volume: 0.4, bus: "voice", category: "customer", minGap: 0.2, maxDuration: 3, render: talk("angry", 6, 10) },
  "voice.sad": { bus: "voice", category: "customer", minGap: 0.2, maxDuration: 3.5, render: talk("sad", 3, 5) },
  "voice.laugh": { bus: "voice", category: "customer", minGap: 0.3, maxDuration: 3, render: (v, p) => laugh(v, voiceOf(v, p)) },
  "voice.gasp": { bus: "voice", category: "customer", minGap: 0.3, render: (v, p) => gasp(v, voiceOf(v, p)) },
  "voice.grumble": {
    volume: 0.45,
    bus: "voice",
    category: "customer",
    minGap: 0.3,
    render: (v, p) => {
      const vp = voiceOf(v, p);
      return speak(v, { ...vp, pitch: vp.pitch * 0.75, speed: vp.speed * 0.8 }, "angry", 3);
    },
  },

  // ===== Cheater screen =====
  "cheat.siren": {
    bus: "world",
    category: "cheater",
    maxDuration: 2.5,
    render: (v) => {
      const dur = 1.6;
      const o = v.ac.createOscillator();
      o.type = "triangle";
      for (let i = 0; i < dur / 0.4; i++) {
        o.frequency.setValueAtTime(650, v.t + i * 0.4);
        o.frequency.linearRampToValueAtTime(1300, v.t + i * 0.4 + 0.2);
        o.frequency.linearRampToValueAtTime(650, v.t + i * 0.4 + 0.4);
      }
      const g = envGain(v, 0.12, 0.05, 0.1, v.t, dur - 0.15);
      o.connect(g).connect(v.out);
      o.start(v.t);
      o.stop(v.t + dur + 0.05);
      return v.t + dur;
    },
  },
  "cheat.trombone": {
    bus: "world",
    category: "cheater",
    maxDuration: 3.5,
    render: (v) => {
      const notes: [number, number][] = [
        [293.66, 0.42],
        [277.18, 0.42],
        [261.63, 0.42],
        [246.94, 1.3],
      ];
      let t = v.t;
      for (const [f, d] of notes) {
        const long = d > 1;
        tone(v, { start: t, freq: f, type: "sawtooth", attack: 0.04, hold: d - 0.16, decay: 0.12, gain: 0.16, filter: { type: "lowpass", freq: 1100 }, vibratoHz: long ? 5.5 : undefined, vibratoDepth: long ? 6 : undefined });
        t += d;
      }
      return t;
    },
  },
  "cheat.buzzer": {
    bus: "ui",
    category: "cheater",
    render: (v) => {
      let end = v.t;
      for (const f of [92, 98, 139]) {
        end = tone(v, { freq: f, type: "sawtooth", hold: 0.55, decay: 0.1, gain: 0.09, filter: { type: "lowpass", freq: 1200 } });
      }
      return end;
    },
  },
} satisfies Record<string, SfxDef>;

export type SfxId = keyof typeof SFX;
export const SFX_IDS = Object.keys(SFX) as SfxId[];
export const SFX_CATEGORIES: SfxCategory[] = ["ui", "money", "progress", "shop", "bench", "keyboard", "customer", "cheater"];
