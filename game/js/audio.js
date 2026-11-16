// audio.js — every sound in EMBERFALL is synthesized with WebAudio: no
// audio files, no samples. Short oscillator/noise envelopes for effects
// and a small step-sequenced bass + arpeggio loop for music. The context
// is created lazily on the first user gesture (unlockAudio) so the game
// never trips a browser autoplay policy.

let ctx = null;
let master = null;
let musicGain = null;
let muted = false;
let musicTimer = null;
let musicStep = 0;

export function isMuted() { return muted; }

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : 0.9;
}

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.5;
  musicGain.connect(master);
}

// One enveloped oscillator blip. type/freq/dur shape the sound; slideTo
// bends the pitch, which is most of what makes a zap or a boom read.
function blip({ type = 'square', freq = 440, slideTo = null, dur = 0.12, vol = 0.2, delay = 0 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A burst of filtered noise: explosions, hits and dash whooshes.
function noiseBurst({ dur = 0.2, vol = 0.25, freq = 1200, delay = 0 }) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

export function sfxShoot() { blip({ type: 'square', freq: 880, slideTo: 320, dur: 0.07, vol: 0.05 }); }
export function sfxHit() { noiseBurst({ dur: 0.05, vol: 0.08, freq: 2400 }); }
export function sfxBoom(big = false) {
  noiseBurst({ dur: big ? 0.5 : 0.22, vol: big ? 0.4 : 0.2, freq: big ? 700 : 1100 });
  blip({ type: 'triangle', freq: big ? 160 : 220, slideTo: 40, dur: big ? 0.45 : 0.2, vol: 0.25 });
}
export function sfxChain(chain) {
  const step = Math.min(12, Math.floor(chain / 4));
  blip({ type: 'sawtooth', freq: 500 + step * 60, slideTo: 900 + step * 80, dur: 0.09, vol: 0.07 });
}
export function sfxDash() { noiseBurst({ dur: 0.16, vol: 0.12, freq: 3000 }); }
export function sfxHurt() { blip({ type: 'sawtooth', freq: 200, slideTo: 70, dur: 0.18, vol: 0.22 }); }
export function sfxReactorHit() {
  blip({ type: 'sawtooth', freq: 140, slideTo: 55, dur: 0.3, vol: 0.3 });
  noiseBurst({ dur: 0.25, vol: 0.2, freq: 800 });
}
export function sfxUpgrade() {
  blip({ type: 'triangle', freq: 520, dur: 0.12, vol: 0.18 });
  blip({ type: 'triangle', freq: 780, dur: 0.14, vol: 0.18, delay: 0.09 });
  blip({ type: 'triangle', freq: 1040, dur: 0.2, vol: 0.18, delay: 0.18 });
}
export function sfxClick() { blip({ type: 'triangle', freq: 660, dur: 0.06, vol: 0.12 }); }
export function sfxBossRoar() {
  blip({ type: 'sawtooth', freq: 90, slideTo: 45, dur: 0.8, vol: 0.35 });
  blip({ type: 'sawtooth', freq: 135, slideTo: 60, dur: 0.8, vol: 0.2, delay: 0.05 });
}
export function sfxWin() {
  [392, 523, 659, 784, 1046].forEach((f, i) =>
    blip({ type: 'triangle', freq: f, dur: 0.3, vol: 0.2, delay: i * 0.11 }));
}
export function sfxLose() {
  [330, 262, 196, 131].forEach((f, i) =>
    blip({ type: 'triangle', freq: f, dur: 0.34, vol: 0.2, delay: i * 0.16 }));
}

// --- music: a dark D-minor pulse, bass on every step, sparse arp above ---
const BASS = [73.4, 0, 73.4, 0, 87.3, 0, 73.4, 0, 65.4, 0, 65.4, 0, 98, 0, 110, 0];
const ARP = [293.7, 0, 349.2, 440, 0, 349.2, 0, 293.7, 261.6, 0, 329.6, 392, 0, 329.6, 0, 0];

function musicTick() {
  if (!ctx || muted) { musicStep++; return; }
  const i = musicStep % 16;
  const bass = BASS[i];
  if (bass) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = bass;
    gain.gain.setValueAtTime(0.16, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.21);
    osc.connect(gain).connect(musicGain);
    osc.start(t0); osc.stop(t0 + 0.22);
  }
  const arp = ARP[i];
  if (arp && musicStep % 32 >= 16) {
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = arp;
    gain.gain.setValueAtTime(0.05, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
    osc.connect(gain).connect(musicGain);
    osc.start(t0); osc.stop(t0 + 0.2);
  }
  musicStep++;
}

export function startMusic() {
  if (!ctx || musicTimer) return;
  musicStep = 0;
  musicTimer = setInterval(musicTick, 214); // ~140bpm eighth notes
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
