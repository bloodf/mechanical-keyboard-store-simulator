/**
 * Tiny Web Audio synth. Browsers only allow audio after a user gesture, so the context
 * is created lazily and `unlockAudio()` is called from the first pointer/key event.
 * (Phase 5 replaces keyClack with the full parametric sound-profile engine.)
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function audioReady() {
  return !!ctx && ctx.state === "running";
}

/** Short "thock": filtered noise transient + low body tone. depth 0 = clacky, 1 = thocky. */
export function keyClack(depth = 0.6, volume = 0.5) {
  if (!ctx || !master || !noiseBuf || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const vary = 0.9 + Math.random() * 0.2;

  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  n.playbackRate.value = vary;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = (3200 - depth * 2200) * vary;
  bp.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(volume * 0.9, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  n.connect(bp).connect(ng).connect(master);
  n.start(t, Math.random() * 0.3, 0.05);

  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime((420 - depth * 260) * vary, t);
  o.frequency.exponentialRampToValueAtTime((200 - depth * 110) * vary, t + 0.05);
  const og = ctx.createGain();
  og.gain.setValueAtTime(volume * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.08);
}

/** Classic "wah wah wah waaah". */
export function sadTrombone() {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + 0.05;
  const notes = [
    [293.66, 0.45],
    [277.18, 0.45],
    [261.63, 0.45],
    [246.94, 1.4],
  ] as const;
  let t = t0;
  for (const [f, d] of notes) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = d > 1 ? 5.5 : 0.01;
    const vibG = ctx.createGain();
    vibG.gain.value = d > 1 ? 6 : 0;
    vib.connect(vibG).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
    g.gain.setValueAtTime(0.22, t + d - 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    vib.start(t);
    o.stop(t + d + 0.02);
    vib.stop(t + d + 0.02);
    t += d;
  }
}

/** Short police "whoop" siren. */
export function siren(duration = 1.6) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = "triangle";
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
  g.gain.setValueAtTime(0.12, t + duration - 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  for (let i = 0; i < duration / 0.4; i++) {
    o.frequency.setValueAtTime(650, t + i * 0.4);
    o.frequency.linearRampToValueAtTime(1300, t + i * 0.4 + 0.2);
    o.frequency.linearRampToValueAtTime(650, t + i * 0.4 + 0.4);
  }
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + duration);
}
