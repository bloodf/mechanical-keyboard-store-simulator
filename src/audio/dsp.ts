/**
 * Synthesis building blocks. Every sound in the game is generated from these at play time,
 * with small random variations, so nothing sounds exactly the same twice. No audio files.
 *
 * All helpers take a `Voice` describing where to render: the context, the destination node,
 * the start time, and a random source. That lets the same sound render live (AudioContext)
 * or offline (OfflineAudioContext) for automated tests.
 */
export interface Voice {
  ac: BaseAudioContext;
  out: AudioNode;
  t: number; // start time (seconds, in ac.currentTime units)
  rnd: () => number; // 0..1
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function noiseBuffer(ac: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ac);
  if (!b) {
    b = ac.createBuffer(1, Math.floor(ac.sampleRate * 2), ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ac, b);
  }
  return b;
}

/** ±amount relative variation, e.g. vary(v, 0.05) → 0.95..1.05. */
export const vary = (v: Voice, amount: number) => 1 + (v.rnd() * 2 - 1) * amount;

/** Gain node with an attack/decay envelope (exponential decay, never reaches exactly 0). */
export function envGain(v: Voice, peak: number, attack: number, decay: number, start = v.t, hold = 0): GainNode {
  const g = v.ac.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + Math.max(0.001, attack));
  if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), start + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + Math.max(0.005, decay));
  return g;
}

export interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number; // exponential glide target
  glide?: number; // glide time (default = whole duration)
  start?: number;
  attack?: number;
  hold?: number;
  decay: number;
  gain: number;
  detune?: number;
  vibratoHz?: number;
  vibratoDepth?: number; // Hz
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  dest?: AudioNode;
}

export function tone(v: Voice, o: ToneOpts): number {
  const start = o.start ?? v.t;
  const attack = o.attack ?? 0.005;
  const hold = o.hold ?? 0;
  const end = start + attack + hold + o.decay;
  const osc = v.ac.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, start);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, start + (o.glide ?? end - start));
  if (o.detune) osc.detune.value = o.detune;
  if (o.vibratoHz && o.vibratoDepth) {
    const lfo = v.ac.createOscillator();
    lfo.frequency.value = o.vibratoHz;
    const lg = v.ac.createGain();
    lg.gain.value = o.vibratoDepth;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(end + 0.02);
  }
  const g = envGain(v, o.gain, attack, o.decay, start, hold);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = v.ac.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.value = o.filter.freq;
    f.Q.value = o.filter.q ?? 0.7;
    node = node.connect(f);
  }
  node.connect(g).connect(o.dest ?? v.out);
  osc.start(start);
  osc.stop(end + 0.02);
  return end;
}

export interface NoiseOpts {
  start?: number;
  attack?: number;
  hold?: number;
  decay: number;
  gain: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
  rate?: number; // playback rate (darker < 1 < brighter)
  dest?: AudioNode;
}

export function noise(v: Voice, o: NoiseOpts): number {
  const start = o.start ?? v.t;
  const attack = o.attack ?? 0.002;
  const hold = o.hold ?? 0;
  const dur = attack + hold + o.decay;
  const src = v.ac.createBufferSource();
  src.buffer = noiseBuffer(v.ac);
  src.playbackRate.value = o.rate ?? 1;
  let node: AudioNode = src;
  if (o.filter) {
    const f = v.ac.createBiquadFilter();
    f.type = o.filter;
    f.frequency.setValueAtTime(o.freq ?? 1000, start);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, start + dur);
    f.Q.value = o.q ?? 0.7;
    node = node.connect(f);
  }
  node.connect(envGain(v, o.gain, attack, o.decay, start, hold)).connect(o.dest ?? v.out);
  src.start(start, v.rnd() * 1.5, dur + 0.05);
  return start + dur;
}

/** Soft clipper for "angry"/overdriven sounds. */
export function drive(v: Voice, amount: number, dest: AudioNode = v.out): WaveShaperNode {
  const ws = v.ac.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * (1 + amount * 6)) / Math.tanh(1 + amount * 6);
  }
  ws.curve = curve;
  ws.connect(dest);
  return ws;
}

/** Musical helpers for short stingers (not music — jingles of < 1.5 s). */
export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
