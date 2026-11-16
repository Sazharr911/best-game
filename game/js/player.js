// player.js — the Warden: movement, dashing and the cannon. The player is
// a small neon chevron ship orbiting the reactor it defends. Bullets it
// fires live here too, including their collisions with wraiths.

import { VIEW_W, VIEW_H } from './game-state.js';
import { damageEnemy } from './enemies.js';
import { spawnSparks } from './particles.js';
import { sfxShoot, sfxDash } from './audio.js';

const PLAYER_SPEED = 305;
const PLAYER_ACCEL = 2400;
const DASH_SPEED = 1180;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 1.5;
const BASE_FIRE_INTERVAL = 0.145;
const BULLET_SPEED = 800;

export function updatePlayer(state, input, dt) {
  const p = state.player;
  if (p.hp <= 0) return;

  // --- movement: WASD / arrow keys, snappy acceleration ---
  let mx = 0, my = 0;
  if (input.keys.has('a') || input.keys.has('arrowleft')) mx -= 1;
  if (input.keys.has('d') || input.keys.has('arrowright')) mx += 1;
  if (input.keys.has('w') || input.keys.has('arrowup')) my -= 1;
  if (input.keys.has('s') || input.keys.has('arrowdown')) my += 1;
  const len = Math.hypot(mx, my) || 1;
  mx /= len; my /= len;
  const topSpeed = PLAYER_SPEED * state.mods.moveMul;
  p.vx += mx * PLAYER_ACCEL * dt;
  p.vy += my * PLAYER_ACCEL * dt;

  // --- dash: a burst in the movement (or aim) direction, with i-frames ---
  p.dashCd = Math.max(0, p.dashCd - dt);
  if (input.dashQueued && p.dashCd <= 0 && p.dashTime <= 0) {
    input.dashQueued = false;
    const dx = mx !== 0 || my !== 0 ? mx : Math.cos(p.angle);
    const dy = mx !== 0 || my !== 0 ? my : Math.sin(p.angle);
    p.dashTime = DASH_TIME;
    p.dashCd = DASH_COOLDOWN * state.mods.dashCdMul;
    p.invuln = Math.max(p.invuln, DASH_TIME + 0.08);
    p.vx = dx * DASH_SPEED;
    p.vy = dy * DASH_SPEED;
    sfxDash();
    spawnSparks(state, p.x, p.y, '#40e0ff', 8, 160, 2.4, 0.3);
  }
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    // Dash Embers: the dash lays burning ground that hurts wraiths.
    if (state.mods.dashEmbers) {
      state.emberZones.push({ x: p.x, y: p.y, r: 30, life: 1.6, tick: 0 });
    }
  } else {
    // damp velocity toward the input-driven top speed
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > topSpeed) {
      const k = Math.max(topSpeed, sp - 2600 * dt) / sp;
      p.vx *= k; p.vy *= k;
    }
    if (mx === 0 && my === 0) {
      const f = Math.max(0, 1 - 10 * dt);
      p.vx *= f; p.vy *= f;
    }
  }
  p.x = Math.max(p.r, Math.min(VIEW_W - p.r, p.x + p.vx * dt));
  p.y = Math.max(p.r, Math.min(VIEW_H - p.r, p.y + p.vy * dt));
  p.invuln = Math.max(0, p.invuln - dt);
  p.angle = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);

  // --- the cannon ---
  p.fireCd -= dt;
  const firing = input.mouseDown || state.autoFire;
  if (firing && p.fireCd <= 0) {
    p.fireCd = BASE_FIRE_INTERVAL / state.mods.fireRateMul;
    fireVolley(state);
  }
}

function fireVolley(state) {
  const p = state.player;
  const n = 1 + state.mods.split;
  const spreadStep = 0.085;
  for (let i = 0; i < n; i++) {
    const a = p.angle + (i - (n - 1) / 2) * spreadStep;
    state.bullets.push({
      x: p.x + Math.cos(p.angle) * 16,
      y: p.y + Math.sin(p.angle) * 16,
      vx: Math.cos(a) * BULLET_SPEED,
      vy: Math.sin(a) * BULLET_SPEED,
      r: 4, dmg: state.mods.bulletDamage,
      pierce: state.mods.pierce, life: 1.15,
    });
  }
  spawnSparks(state, p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, '#ffd23e', 2, 90, 1.8, 0.16);
  sfxShoot();
}

export function updateBullets(state, dt) {
  const bs = state.bullets;
  for (let i = bs.length - 1; i >= 0; i--) {
    const b = bs[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -20 || b.x > VIEW_W + 20 || b.y < -20 || b.y > VIEW_H + 20) {
      bs.splice(i, 1);
      continue;
    }
    for (const e of state.enemies) {
      if (e.hp <= 0 || e.hitBy === b) continue;
      const dx = e.x - b.x, dy = e.y - b.y;
      const rr = e.r + b.r;
      if (dx * dx + dy * dy < rr * rr) {
        damageEnemy(state, e, b.dmg, b.vx * 0.12, b.vy * 0.12);
        if (b.pierce > 0) {
          b.pierce -= 1;
          e.hitBy = b; // a piercing bolt must not hit the same wraith twice
        } else {
          bs.splice(i, 1);
        }
        break;
      }
    }
  }
}
