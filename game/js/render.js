// render.js — everything the player sees. Canvas 2D, neon vector shapes
// only: a dark arena, the glowing Ember Reactor at its heart, wraith
// silhouettes with ember eyes, and screens for title, the upgrade draft,
// victory and results. The HUD's headline is the Ember Chain meter.

import { VIEW_W, VIEW_H, chainMultiplier, formatTime } from './game-state.js';
import { drawParticles, drawChainArcs, drawEmberZones, drawFloaters } from './particles.js';
import { hostilesRemaining, BOSS_WAVE } from './waves.js';

const FONT = '"Segoe UI", system-ui, sans-serif';
const EMBER = '#ff7a1a';
const CORE = '#ffd23e';
const CYAN = '#40e0ff';
const PALE = '#cfe8ff';

// Deterministic scatter for the background layers: the same hash the
// whole session long, so stars, vents and motes never flicker or jump
// between frames — they are part of the arena, not noise.
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const STARS = Array.from({ length: 170 }, (_, i) => ({
  x: hash(i * 3 + 1) * VIEW_W,
  y: hash(i * 3 + 2) * VIEW_H,
  r: 0.7 + hash(i * 3 + 3) * 1.5,
  tw: hash(i * 7 + 4) * Math.PI * 2,
}));

const MOTES = Array.from({ length: 54 }, (_, i) => ({
  x: hash(i * 5 + 11) * VIEW_W,
  y: hash(i * 5 + 12) * VIEW_H,
  sp: 6 + hash(i * 5 + 13) * 13,
  sway: 10 + hash(i * 5 + 14) * 22,
  ph: hash(i * 5 + 15) * Math.PI * 2,
  size: 1.1 + hash(i * 5 + 16) * 1.7,
  warm: hash(i * 5 + 17) < 0.72,
}));

// Ember vents in the scorched ground near the rim: fixed spots where the
// core's heat breaks through, each breathing on its own phase.
const VENTS = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + 0.35;
  const rad = 452 + hash(i * 9 + 21) * 78;
  return {
    x: Math.max(36, Math.min(VIEW_W - 36, 640 + Math.cos(a) * rad)),
    y: Math.max(36, Math.min(VIEW_H - 36, 360 + Math.sin(a) * rad * 0.62)),
    ph: hash(i * 9 + 22) * Math.PI * 2,
    s: 0.75 + hash(i * 9 + 23) * 0.6,
  };
});

export function drawGame(ctx, state, input) {
  state.buttons = [];
  ctx.save();
  if (state.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
  }
  drawArena(ctx, state);
  drawEmberZones(ctx, state);
  drawReactor(ctx, state);
  drawChainArcs(ctx, state);
  drawEnemies(ctx, state);
  drawBossShards(ctx, state);
  if (state.screen !== 'title') drawPlayer(ctx, state);
  drawBolts(ctx, state);
  drawParticles(ctx, state);
  drawFloaters(ctx, state);
  ctx.restore();

  if (state.screen === 'playing' || state.screen === 'upgrade') drawHUD(ctx, state);
  if (state.screen === 'title') drawTitle(ctx, state, input);
  if (state.screen === 'upgrade') drawUpgradeDraft(ctx, state, input);
  if (state.screen === 'win') drawWin(ctx, state, input);
  if (state.screen === 'results') drawResults(ctx, state, input);
}

// ---------------------------------------------------------------- arena

function drawArena(ctx, state) {
  const t = state.time;
  const grad = ctx.createRadialGradient(640, 360, 60, 640, 360, 760);
  grad.addColorStop(0, '#0b0e26');
  grad.addColorStop(0.55, '#070818');
  grad.addColorStop(1, '#04050d');
  ctx.fillStyle = grad;
  ctx.fillRect(-20, -20, VIEW_W + 40, VIEW_H + 40);

  // nebula wash: two huge, soft colour clouds so the void has depth
  for (const [nx, ny, nr, col] of [
    [240, 130, 430, 'rgba(88, 44, 160, 0.13)'],
    [1060, 610, 470, 'rgba(20, 92, 110, 0.12)'],
    [1100, 110, 320, 'rgba(150, 40, 90, 0.07)'],
  ]) {
    const neb = ctx.createRadialGradient(nx, ny, 10, nx, ny, nr);
    neb.addColorStop(0, col);
    neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = neb;
    ctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
  }

  // starfield
  for (const s of STARS) {
    const a = 0.16 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.7 + s.tw));
    ctx.globalAlpha = a;
    ctx.fillStyle = '#bcd6ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // scorched ground under the reactor: a burnt disc, radial scorch
  // streaks and a heat-cracked ring — the core has burned here for ages
  const scorch = ctx.createRadialGradient(640, 360, 20, 640, 360, 250);
  scorch.addColorStop(0, 'rgba(26, 10, 2, 0.55)');
  scorch.addColorStop(0.6, 'rgba(16, 7, 2, 0.34)');
  scorch.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = scorch;
  ctx.fillRect(390, 110, 500, 500);
  ctx.strokeStyle = 'rgba(255, 120, 40, 0.05)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 26; i++) {
    const a = hash(i * 13 + 31) * Math.PI * 2;
    const r0 = 58 + hash(i * 13 + 32) * 30;
    const r1 = r0 + 70 + hash(i * 13 + 33) * 110;
    ctx.beginPath();
    ctx.moveTo(640 + Math.cos(a) * r0, 360 + Math.sin(a) * r0);
    ctx.lineTo(640 + Math.cos(a) * r1, 360 + Math.sin(a) * r1);
    ctx.stroke();
  }

  // faint range rings around the reactor: the ground itself is a dial
  ctx.strokeStyle = 'rgba(64, 224, 255, 0.07)';
  ctx.lineWidth = 1;
  for (const r of [110, 190, 280]) {
    ctx.beginPath();
    ctx.arc(640, 360, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // the rune ring: etched glyphs circling the reactor, turning slowly
  ctx.save();
  ctx.translate(640, 360);
  ctx.rotate(t * 0.03);
  ctx.strokeStyle = 'rgba(255, 190, 80, 0.17)';
  ctx.fillStyle = 'rgba(255, 190, 80, 0.17)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * 152, y = Math.sin(a) * 152;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath();
      ctx.stroke();
    } else if (i % 3 === 1) {
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(0, 7);
      ctx.moveTo(-4, -2); ctx.lineTo(4, -2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();

  // ember vents around the rim, breathing with the core's heat
  for (const v of VENTS) {
    const flick = 0.5 + 0.5 * Math.sin(t * 2.6 + v.ph);
    const glowR = 30 * v.s * (0.8 + flick * 0.45);
    const vg = ctx.createRadialGradient(v.x, v.y, 1, v.x, v.y, glowR);
    vg.addColorStop(0, `rgba(255, 150, 50, ${0.20 + flick * 0.13})`);
    vg.addColorStop(1, 'rgba(255, 90, 20, 0)');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.arc(v.x, v.y, glowR, 0, Math.PI * 2);
    ctx.fill();
    // the crack itself: a short jagged tear with a lit heart
    ctx.strokeStyle = `rgba(255, 170, 70, ${0.35 + flick * 0.3})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(v.x - 9 * v.s, v.y + 3);
    ctx.lineTo(v.x - 3 * v.s, v.y - 2);
    ctx.lineTo(v.x + 2 * v.s, v.y + 2);
    ctx.lineTo(v.x + 9 * v.s, v.y - 3);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 210, 110, ${0.5 + flick * 0.4})`;
    ctx.beginPath();
    ctx.arc(v.x, v.y, 1.8 * v.s, 0, Math.PI * 2);
    ctx.fill();
  }

  // drifting ember motes and ash on the air above the ground
  for (const m of MOTES) {
    const rise = (t * m.sp) % (VIEW_H + 60);
    const y = VIEW_H + 30 - rise;
    const x = m.x + Math.sin(t * 0.4 + m.ph) * m.sway;
    const fade = Math.min(1, rise / 90, (VIEW_H + 60 - rise) / 90);
    ctx.globalAlpha = Math.max(0, fade) * 0.5;
    ctx.fillStyle = m.warm ? '#ff9a3c' : '#9aa4b8';
    ctx.beginPath();
    ctx.arc(x, y, m.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // dotted grid
  ctx.fillStyle = 'rgba(120, 160, 255, 0.05)';
  for (let x = 40; x < VIEW_W; x += 40) {
    for (let y = 40; y < VIEW_H; y += 40) {
      ctx.fillRect(x, y, 2, 2);
    }
  }
  // arena rim
  ctx.strokeStyle = 'rgba(64, 224, 255, 0.16)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, VIEW_W - 12, VIEW_H - 12);
}

function drawReactor(ctx, state) {
  const r = state.reactor;
  const t = state.time;
  const ignited = state.coreIgnited;
  const pulse = 1 + Math.sin(t * (ignited ? 5 : 2.4)) * 0.05;

  // ground glow
  const glow = ctx.createRadialGradient(r.x, r.y, 4, r.x, r.y, ignited ? 190 : 130);
  glow.addColorStop(0, ignited ? 'rgba(255, 190, 60, 0.5)' : 'rgba(255, 140, 40, 0.32)');
  glow.addColorStop(1, 'rgba(255, 110, 20, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(r.x, r.y, ignited ? 190 : 130, 0, Math.PI * 2);
  ctx.fill();

  // shield ring (upgrade): brightness follows its charge
  if (state.mods.shieldRing) {
    ctx.strokeStyle = `rgba(64, 224, 255, ${0.25 + state.mods.shieldCharge * 0.55})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r + 46, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // rotating machinery rings
  for (const [radius, speed, dash] of [[52, 0.35, [14, 10]], [64, -0.22, [4, 14]]]) {
    ctx.strokeStyle = 'rgba(255, 170, 60, 0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash(dash);
    ctx.lineDashOffset = t * speed * 60;
    ctx.beginPath();
    ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // the core itself
  const coreR = r.r * pulse;
  const core = ctx.createRadialGradient(r.x, r.y, 1, r.x, r.y, coreR);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, CORE);
  core.addColorStop(0.8, EMBER);
  core.addColorStop(1, 'rgba(255, 90, 20, 0.15)');
  ctx.fillStyle = core;
  ctx.shadowColor = EMBER;
  ctx.shadowBlur = ignited ? 46 : 26;
  ctx.beginPath();
  ctx.arc(r.x, r.y, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (ignited) {
    ctx.strokeStyle = 'rgba(255, 210, 62, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.7;
      ctx.beginPath();
      ctx.moveTo(r.x + Math.cos(a) * 74, r.y + Math.sin(a) * 74);
      ctx.lineTo(r.x + Math.cos(a) * (104 + Math.sin(t * 3 + i) * 10), r.y + Math.sin(a) * (104 + Math.sin(t * 3 + i) * 10));
      ctx.stroke();
    }
  }

  // damage flash + name
  if (state.reactorFlash > 0) {
    ctx.fillStyle = `rgba(255, 60, 40, ${state.reactorFlash * 0.8})`;
    ctx.beginPath();
    ctx.arc(r.x, r.y, coreR + 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = 'bold 11px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 200, 130, 0.65)';
  ctx.fillText('EMBER REACTOR', r.x, r.y + 92);
}

// ---------------------------------------------------------------- actors

function drawPlayer(ctx, state) {
  const p = state.player;
  if (p.hp <= 0) return;
  ctx.save();
  ctx.translate(p.x, p.y);

  if (p.dashTime > 0) {
    for (const k of [0.03, 0.06]) {
      ctx.save();
      ctx.rotate(p.angle);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = CYAN;
      shipPath(ctx, -p.vx * k * 3.2, -p.vy * k * 3.2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.rotate(p.angle);
  // engine flame
  const moving = Math.hypot(p.vx, p.vy) > 40;
  if (moving) {
    const flick = 8 + Math.random() * 7;
    ctx.fillStyle = EMBER;
    ctx.beginPath();
    ctx.moveTo(-11, -4.5);
    ctx.lineTo(-11 - flick, 0);
    ctx.lineTo(-11, 4.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 14;
  shipPath(ctx, 0, 0);
  ctx.fillStyle = '#0a1a2e';
  ctx.fill();
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(3, 0, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (p.invuln > 0 && p.dashTime <= 0) {
    ctx.strokeStyle = 'rgba(64, 224, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 7 + Math.sin(state.time * 14) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function shipPath(ctx, ox, oy) {
  ctx.beginPath();
  ctx.moveTo(ox + 19, oy);
  ctx.lineTo(ox - 6, oy - 5);
  ctx.lineTo(ox - 13, oy - 12);
  ctx.lineTo(ox - 9, oy);
  ctx.lineTo(ox - 13, oy + 12);
  ctx.lineTo(ox - 6, oy + 5);
  ctx.closePath();
}

function drawEnemies(ctx, state) {
  for (const e of state.enemies) {
    if (e.hp <= 0 && e.kind !== 'embermaw') continue; // the dead burst already
    ctx.save();
    ctx.translate(e.x, e.y);
    const face = Math.atan2(e.vy, e.vx);
    if (e.kind === 'embermaw') drawEmbermaw(ctx, state, e);
    else if (e.kind === 'brute') drawBrute(ctx, e, face);
    else if (e.kind === 'stalker') drawStalker(ctx, e, face);
    else drawWraith(ctx, state, e, face, e.kind === 'swift');
    ctx.restore();

    if ((e.kind === 'brute') && e.hp < e.maxHp) {
      bar(ctx, e.x - 24, e.y - e.r - 14, 48, 5, e.hp / e.maxHp, '#b06bff');
    }
  }
}

// The standard wraith: a hooded silhouette with a wavy hem and two ember
// eyes — readable as a dark ghost at any size.
function drawWraith(ctx, state, e, face, swift) {
  const r = e.r;
  const sway = Math.sin(state.time * 3 + e.seed) * r * 0.08;
  ctx.rotate(Math.sin(e.seed) * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.15);
  ctx.bezierCurveTo(r * 0.95, -r * 0.7, r * 0.9, r * 0.3, r * 0.62, r * 0.95);
  ctx.quadraticCurveTo(r * 0.3, r * 0.72 + sway, 0, r * 0.95);
  ctx.quadraticCurveTo(-r * 0.3, r * 0.72 - sway, -r * 0.62, r * 0.95);
  ctx.bezierCurveTo(-r * 0.9, r * 0.3, -r * 0.95, -r * 0.7, 0, -r * 1.15);
  ctx.fillStyle = e.flash > 0 ? '#3d3466' : '#100c24';
  ctx.fill();
  ctx.strokeStyle = e.color;
  ctx.lineWidth = swift ? 1.6 : 2;
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.shadowBlur = 0;
  eyes(ctx, face, r * 0.34, r * 0.16, swift ? 2.2 : 2.8, e.color);
}

function drawStalker(ctx, e, face) {
  const r = e.r;
  ctx.rotate(face);
  ctx.beginPath();
  ctx.moveTo(r * 1.2, 0);
  ctx.lineTo(-r * 0.4, -r * 0.5);
  ctx.lineTo(-r * 1.1, -r * 1.05);
  ctx.lineTo(-r * 0.75, 0);
  ctx.lineTo(-r * 1.1, r * 1.05);
  ctx.lineTo(-r * 0.4, r * 0.5);
  ctx.closePath();
  ctx.fillStyle = e.flash > 0 ? '#4a2438' : '#180c1c';
  ctx.fill();
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 2;
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 9;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.arc(r * 0.45, 0, 2.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawBrute(ctx, e, face) {
  const r = e.r;
  ctx.fillStyle = e.flash > 0 ? '#41305e' : '#150f2c';
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 2.4;
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // horn spikes
  ctx.fillStyle = e.color;
  for (const a of [-0.7, -0.25, 0.25, 0.7]) {
    const ang = face + a + Math.PI;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang - 0.16) * r, Math.sin(ang - 0.16) * r);
    ctx.lineTo(Math.cos(ang) * (r + 9), Math.sin(ang) * (r + 9));
    ctx.lineTo(Math.cos(ang + 0.16) * r, Math.sin(ang + 0.16) * r);
    ctx.closePath();
    ctx.fill();
  }
  eyes(ctx, face, r * 0.36, r * 0.2, 3.4, '#ffb0ff');
}

function drawEmbermaw(ctx, state, e) {
  const r = e.r;
  const dying = e.hp <= 0;
  ctx.rotate(Math.sin(e.seed + state.time * 0.6) * 0.04);
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.25);
  ctx.bezierCurveTo(r * 1.05, -r * 0.8, r, r * 0.4, r * 0.66, r * 1.05);
  ctx.quadraticCurveTo(0, r * 0.8, -r * 0.66, r * 1.05);
  ctx.bezierCurveTo(-r, r * 0.4, -r * 1.05, -r * 0.8, 0, -r * 1.25);
  ctx.fillStyle = e.flash > 0 ? '#59331f' : '#170b16';
  ctx.fill();
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 3.4;
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.shadowBlur = 0;
  // crown of spikes
  ctx.fillStyle = e.color;
  for (const a of [-0.55, -0.28, 0, 0.28, 0.55]) {
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * r * 0.8 - 6, -Math.cos(a) * r * 1.05);
    ctx.lineTo(Math.sin(a) * r * 1.02, -Math.cos(a) * r * 1.38);
    ctx.lineTo(Math.sin(a) * r * 0.8 + 6, -Math.cos(a) * r * 1.05);
    ctx.closePath();
    ctx.fill();
  }
  // the one burning eye
  const eyeR = dying ? 6 : 10 + Math.sin(state.time * 4) * 1.6;
  const eye = ctx.createRadialGradient(0, -r * 0.15, 1, 0, -r * 0.15, eyeR * 2.4);
  eye.addColorStop(0, '#ffffff');
  eye.addColorStop(0.4, CORE);
  eye.addColorStop(1, 'rgba(255, 90, 20, 0)');
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.arc(0, -r * 0.15, eyeR * 2.4, 0, Math.PI * 2);
  ctx.fill();
  // cracks as it weakens
  if (!dying && e.hp < e.maxHp * 0.45) {
    ctx.strokeStyle = 'rgba(255, 170, 60, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, -r * 0.5);
    ctx.lineTo(-r * 0.15, -r * 0.1);
    ctx.lineTo(-r * 0.35, r * 0.35);
    ctx.moveTo(r * 0.45, -r * 0.3);
    ctx.lineTo(r * 0.2, r * 0.15);
    ctx.stroke();
  }
}

function eyes(ctx, face, spread, fwd, size, color) {
  const ex = Math.cos(face), ey = Math.sin(face);
  const px = -ey, py = ex;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(ex * fwd + px * spread * s, ey * fwd + py * spread * s, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawBossShards(ctx, state) {
  for (const s of state.bossShards) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.globalAlpha = Math.min(1, s.life);
    ctx.fillStyle = '#170b16';
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -s.size);
    ctx.lineTo(s.size * 0.7, s.size * 0.6);
    ctx.lineTo(-s.size * 0.7, s.size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawBolts(ctx, state) {
  for (const b of state.bullets) {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (const b of state.enemyBolts) {
    ctx.fillStyle = '#ff8a3c';
    ctx.shadowColor = EMBER;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------- HUD

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(10, 14, 34, 0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.min(1, frac)), h - 2);
  ctx.strokeStyle = 'rgba(160, 200, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

// The goal of the moment, in one short line: defend the core through
// the early waves, ignite it on the boss wave, hold forever after.
function objectiveText(state) {
  if (state.coreIgnited) return '— CORE IGNITED —';
  if (state.endless) return 'OBJECTIVE — HOLD THE LINE, ENDLESS';
  if (state.wave === BOSS_WAVE) return 'OBJECTIVE — IGNITE THE CORE · BOSS WAVE';
  return 'OBJECTIVE — DEFEND THE REACTOR';
}

function drawHUD(ctx, state) {
  ctx.textBaseline = 'alphabetic';

  // wave + hostiles, top-left
  ctx.textAlign = 'left';
  ctx.font = 'bold 25px ' + FONT;
  ctx.fillStyle = PALE;
  ctx.fillText('WAVE ' + state.wave + (state.endless ? ' · ENDLESS' : ''), 22, 38);
  ctx.font = '14px ' + FONT;
  ctx.fillStyle = 'rgba(160, 200, 255, 0.75)';
  ctx.fillText('HOSTILES ' + hostilesRemaining(state), 22, 60);

  // the Ember Chain meter, top-center headline
  const mult = chainMultiplier(state);
  const active = state.chain > 0;
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px ' + FONT;
  ctx.fillStyle = active ? CORE : 'rgba(255, 210, 62, 0.35)';
  ctx.shadowColor = EMBER;
  ctx.shadowBlur = active ? 16 : 0;
  ctx.fillText('EMBER CHAIN ×' + mult, 640, 42);
  ctx.shadowBlur = 0;
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = active ? '#ffe9b0' : 'rgba(200, 210, 240, 0.4)';
  ctx.fillText(active ? state.chain + ' KILLS CHAINED' : 'CHAIN YOUR KILLS — DO NOT LET THE CORE BE HIT', 640, 62);
  if (active) {
    bar(ctx, 640 - 110, 70, 220, 6, state.chainTimer / state.mods.chainWindow, EMBER);
  }

  // boss bar under the chain meter
  if (state.boss && state.boss.hp > 0) {
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = '#ff8a5a';
    ctx.fillText('EMBERMAW', 640, 100);
    bar(ctx, 640 - 190, 106, 380, 9, state.boss.hp / state.boss.maxHp, '#ff5a2a');
  }

  // the live objective, stated inside the gameplay frame itself
  ctx.font = 'bold 13.5px ' + FONT;
  ctx.fillStyle = 'rgba(255, 210, 62, 0.88)';
  ctx.shadowColor = EMBER;
  ctx.shadowBlur = 6;
  ctx.fillText(objectiveText(state), 640, state.boss && state.boss.hp > 0 ? 136 : 96);
  ctx.shadowBlur = 0;

  // score, top-right
  ctx.textAlign = 'right';
  ctx.font = 'bold 25px ' + FONT;
  ctx.fillStyle = PALE;
  ctx.fillText('SCORE ' + state.score, 1258, 38);
  ctx.font = '14px ' + FONT;
  ctx.fillStyle = 'rgba(160, 200, 255, 0.75)';
  ctx.fillText('KILLS ' + state.kills + ' · BEST CHAIN ' + state.bestChain, 1258, 60);

  // hull bars, bottom corners
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px ' + FONT;
  ctx.fillStyle = CYAN;
  ctx.fillText('WARDEN', 22, 664);
  bar(ctx, 22, 672, 250, 13, state.player.hp / state.player.maxHp, state.player.hp < 30 ? '#ff5d5d' : CYAN);
  ctx.textAlign = 'right';
  ctx.fillStyle = EMBER;
  ctx.fillText('REACTOR', 1258, 664);
  bar(ctx, 1008, 672, 250, 13, state.reactor.hp / state.reactor.maxHp, state.reactor.hp < 30 ? '#ff5d5d' : EMBER);

  // hints, bottom-center
  ctx.textAlign = 'center';
  ctx.font = '12.5px ' + FONT;
  ctx.fillStyle = 'rgba(170, 190, 230, 0.5)';
  ctx.fillText(
    'SHIFT / SPACE — DASH      F — AUTO-FIRE ' + (state.autoFire ? 'ON' : 'OFF') + '      M — ' + 'SOUND',
    640, 700);

  // wave banner
  if (state.waveBanner > 0 && state.screen === 'playing') {
    const a = Math.min(1, state.waveBanner);
    ctx.globalAlpha = a;
    ctx.font = 'bold 54px ' + FONT;
    ctx.fillStyle = PALE;
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 22;
    ctx.fillText(state.wave === BOSS_WAVE ? 'FINAL WAVE' : 'WAVE ' + state.wave, 640, 300);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- screens

function panelButton(ctx, state, input, id, x, y, w, h, label, primary) {
  const hover = input.mouseX >= x && input.mouseX <= x + w && input.mouseY >= y && input.mouseY <= y + h;
  state.buttons.push({ id, x, y, w, h });
  ctx.fillStyle = primary
    ? (hover ? 'rgba(255, 122, 26, 0.9)' : 'rgba(255, 122, 26, 0.65)')
    : (hover ? 'rgba(64, 224, 255, 0.28)' : 'rgba(64, 224, 255, 0.14)');
  ctx.strokeStyle = primary ? CORE : CYAN;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 19px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x + w / 2, y + h / 2 + 7);
  return hover;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTitle(ctx, state, input) {
  ctx.fillStyle = 'rgba(3, 4, 12, 0.45)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';

  ctx.font = '16px ' + FONT;
  ctx.fillStyle = CYAN;
  ctx.fillText('A  N E O N  R E A C T O R  D E F E N S E', 640, 108);

  const grad = ctx.createLinearGradient(0, 130, 0, 230);
  grad.addColorStop(0, '#ffe9b0');
  grad.addColorStop(0.5, CORE);
  grad.addColorStop(1, EMBER);
  ctx.font = 'bold 96px ' + FONT;
  ctx.fillStyle = grad;
  ctx.shadowColor = EMBER;
  ctx.shadowBlur = 34;
  ctx.fillText('EMBERFALL', 640, 218);
  ctx.shadowBlur = 0;

  ctx.font = '19px ' + FONT;
  ctx.fillStyle = PALE;
  ctx.fillText('The wraiths are coming for the core. You are its warden.', 640, 262);

  // controls in two columns in the band below the reactor
  ctx.font = '16.5px ' + FONT;
  const lines = [
    ['WASD / ARROWS', 'move'],
    ['MOUSE', 'aim — hold to fire'],
    ['F', 'toggle auto-fire'],
    ['SHIFT / SPACE', 'dash'],
    ['M', 'mute'],
  ];
  lines.forEach(([key, what], i) => {
    const colX = i < 3 ? 400 : 872;
    const y = 486 + (i % 3) * 28;
    ctx.textAlign = 'right';
    ctx.fillStyle = CORE;
    ctx.fillText(key, colX - 10, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(207, 232, 255, 0.92)';
    ctx.fillText(what, colX + 10, y);
  });

  ctx.textAlign = 'center';
  ctx.font = '15.5px ' + FONT;
  ctx.fillStyle = 'rgba(255, 233, 176, 0.9)';
  ctx.fillText('Chain kills to feed the core. Survive 5 waves and ignite it. If the reactor dies, everything does.', 640, 592);

  const pulse = 0.75 + Math.sin(state.time * 3.2) * 0.25;
  ctx.globalAlpha = pulse;
  panelButton(ctx, state, input, 'start', 640 - 230, 610, 460, 54, 'DEFEND THE CORE');
  ctx.globalAlpha = 1;
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(170, 190, 230, 0.55)';
  ctx.fillText('click the button or press ENTER', 640, 692);
}

function drawUpgradeDraft(ctx, state, input) {
  ctx.fillStyle = 'rgba(3, 4, 12, 0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 40px ' + FONT;
  ctx.fillStyle = CORE;
  ctx.shadowColor = EMBER;
  ctx.shadowBlur = 18;
  ctx.fillText('WAVE ' + state.wave + ' CLEARED', 640, 130);
  ctx.shadowBlur = 0;
  ctx.font = '19px ' + FONT;
  ctx.fillStyle = PALE;
  ctx.fillText('Choose one upgrade — the next wave is already gathering.', 640, 166);
  ctx.font = '14px ' + FONT;
  ctx.fillStyle = 'rgba(255, 233, 176, 0.8)';
  ctx.fillText('wave bonus +' + 100 * state.wave + ' already banked', 640, 190);

  const cardW = 320, cardH = 300, gap = 28;
  const totalW = cardW * 3 + gap * 2;
  const x0 = (VIEW_W - totalW) / 2, y0 = 226;
  state.choices.forEach((choice, i) => {
    const x = x0 + i * (cardW + gap);
    const hover = input.mouseX >= x && input.mouseX <= x + cardW && input.mouseY >= y0 && input.mouseY <= y0 + cardH;
    state.buttons.push({ id: 'upgrade-' + i, x, y: y0, w: cardW, h: cardH });
    ctx.fillStyle = hover ? 'rgba(20, 26, 58, 0.97)' : 'rgba(12, 16, 40, 0.95)';
    ctx.strokeStyle = hover ? CORE : 'rgba(64, 224, 255, 0.45)';
    ctx.lineWidth = hover ? 3 : 2;
    roundRect(ctx, x, y0, cardW, cardH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 12.5px ' + FONT;
    ctx.fillStyle = CYAN;
    ctx.fillText(choice.tag, x + cardW / 2, y0 + 44);
    ctx.font = 'bold 27px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(choice.name, x + cardW / 2, y0 + 84);
    ctx.strokeStyle = 'rgba(255, 170, 60, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 60, y0 + 106);
    ctx.lineTo(x + cardW - 60, y0 + 106);
    ctx.stroke();
    ctx.font = '16.5px ' + FONT;
    ctx.fillStyle = 'rgba(207, 232, 255, 0.92)';
    wrapText(ctx, choice.desc, x + cardW / 2, y0 + 142, cardW - 52, 23);
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillStyle = 'rgba(255, 210, 62, 0.85)';
    ctx.fillText('PRESS ' + (i + 1) + ' OR CLICK', x + cardW / 2, y0 + cardH - 26);
  });
}

function statRow(ctx, state, cx, y) {
  const r = state.result;
  if (!r) return;
  const stats = [
    ['SCORE', String(r.score)],
    ['KILLS', String(r.kills)],
    ['LONGEST CHAIN', String(r.bestChain)],
    ['TIME', formatTime(r.time)],
  ];
  ctx.font = 'bold 12.5px ' + FONT;
  stats.forEach(([label, value], i) => {
    const x = cx + (i - 1.5) * 190;
    ctx.fillStyle = 'rgba(160, 200, 255, 0.7)';
    ctx.fillText(label, x, y);
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(value, x, y + 36);
    ctx.font = 'bold 12.5px ' + FONT;
  });
}

function drawWin(ctx, state, input) {
  ctx.fillStyle = 'rgba(10, 6, 2, 0.35)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  const grad = ctx.createLinearGradient(0, 120, 0, 220);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, CORE);
  grad.addColorStop(1, EMBER);
  ctx.font = 'bold 88px ' + FONT;
  ctx.fillStyle = grad;
  ctx.shadowColor = EMBER;
  ctx.shadowBlur = 40;
  ctx.fillText('CORE IGNITED', 640, 208);
  ctx.shadowBlur = 0;
  ctx.font = '19px ' + FONT;
  ctx.fillStyle = PALE;
  ctx.fillText('The Embermaw is ash above the reactor, and the core burns brighter than ever.', 640, 248);
  statRow(ctx, state, 640, 316);
  panelButton(ctx, state, input, 'continue', 640 - 320, 566, 300, 56, 'CONTINUE — ENDLESS');
  panelButton(ctx, state, input, 'again', 640 + 20, 566, 300, 56, 'PLAY AGAIN', true);
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(170, 190, 230, 0.55)';
  ctx.fillText('C — continue      R — play again', 640, 652);
}

function drawResults(ctx, state, input) {
  ctx.fillStyle = 'rgba(8, 2, 6, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.font = 'bold 74px ' + FONT;
  ctx.fillStyle = '#ff5d5d';
  ctx.shadowColor = '#ff2020';
  ctx.shadowBlur = 30;
  ctx.fillText('THE EMBER FADES', 640, 168);
  ctx.shadowBlur = 0;
  const r = state.result;
  ctx.font = '19px ' + FONT;
  ctx.fillStyle = PALE;
  ctx.fillText(
    r && r.reason === 'player'
      ? 'The warden fell, and the core followed her into the dark.'
      : 'The wraiths reached the core, and the light went out.',
    640, 208);
  if (r) {
    ctx.font = '17px ' + FONT;
    ctx.fillStyle = 'rgba(207, 232, 255, 0.9)';
    ctx.fillText('You held until WAVE ' + r.wave + ' of ' + BOSS_WAVE, 640, 240);
    statRow(ctx, state, 640, 300);
    if (r.upgrades.length) {
      ctx.font = '14.5px ' + FONT;
      ctx.fillStyle = 'rgba(255, 233, 176, 0.85)';
      wrapText(ctx, 'Upgrades carried: ' + r.upgrades.join(' · '), 640, 396, 760, 21);
    }
  }
  panelButton(ctx, state, input, 'restart', 640 - 190, 470, 380, 58, 'RESTART', true);
  ctx.font = '13px ' + FONT;
  ctx.fillStyle = 'rgba(170, 190, 230, 0.55)';
  ctx.fillText('or press R', 640, 556);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
