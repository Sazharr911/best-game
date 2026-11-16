// enemies.js — the wraiths. Four kinds plus the Embermaw: silhouettes
// that converge on the reactor (stalkers hunt the warden instead), the
// reactor's shield ring, enemy bolts, and everything that happens when a
// wraith is hurt or killed — including the boss's collapse.

import { VIEW_W, VIEW_H, registerKill, damageReactor, damagePlayer, chainMultiplier } from './game-state.js';
import { spawnSparks, spawnExplosion, addFloater } from './particles.js';
import { sfxHit, sfxBoom, sfxChain, sfxHurt, sfxReactorHit, sfxBossRoar } from './audio.js';

export const ENEMY_KINDS = {
  wraith:  { hp: 3,  speed: 63,  r: 16, reactorDmg: 7,  playerDmg: 8,  score: 50,  color: '#8a5cff' },
  swift:   { hp: 2,  speed: 122, r: 11, reactorDmg: 5,  playerDmg: 6,  score: 80,  color: '#ff3d7e' },
  stalker: { hp: 4,  speed: 86,  r: 14, reactorDmg: 6,  playerDmg: 11, score: 100, color: '#ff4040' },
  brute:   { hp: 15, speed: 34,  r: 27, reactorDmg: 15, playerDmg: 12, score: 150, color: '#b06bff' },
  embermaw:{ hp: 300, speed: 17, r: 54, reactorDmg: 30, playerDmg: 16, score: 2000, color: '#ff5a2a' },
};

export function createEnemy(kind, x, y, hpMul = 1) {
  const base = ENEMY_KINDS[kind];
  return {
    kind, x, y, vx: 0, vy: 0,
    hp: Math.round(base.hp * hpMul), maxHp: Math.round(base.hp * hpMul),
    r: base.r, speed: base.speed * (0.9 + Math.random() * 0.2),
    reactorDmg: base.reactorDmg, playerDmg: base.playerDmg,
    score: base.score, color: base.color,
    flash: 0, touchCd: 0, seed: Math.random() * Math.PI * 2,
    boltCd: 2.2, spawnCd: 3.5, hitBy: null,
  };
}

// Spawn at a random point just outside a random arena edge.
export function spawnEnemy(state, kind, hpMul = 1) {
  const edge = Math.floor(Math.random() * 4);
  const m = 30;
  let x, y;
  if (edge === 0) { x = Math.random() * VIEW_W; y = -m; }
  else if (edge === 1) { x = VIEW_W + m; y = Math.random() * VIEW_H; }
  else if (edge === 2) { x = Math.random() * VIEW_W; y = VIEW_H + m; }
  else { x = -m; y = Math.random() * VIEW_H; }
  const e = createEnemy(kind, x, y, hpMul);
  state.enemies.push(e);
  return e;
}

export function updateEnemies(state, dt) {
  const reactor = state.reactor;
  const player = state.player;

  // Reactor Shield Ring: charge slowly rebuilds; a wraith crossing the
  // ring is zapped while charge lasts.
  if (state.mods.shieldRing) {
    state.mods.shieldCharge = Math.min(1, state.mods.shieldCharge + dt * 0.1);
  }
  const ringR = reactor.r + 46;

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;
    e.flash = Math.max(0, e.flash - dt);
    e.touchCd = Math.max(0, e.touchCd - dt);

    // Target: stalkers hunt the warden, everything else hunts the core.
    const target = e.kind === 'stalker' && player.hp > 0 ? player : reactor;
    let dx = target.x - e.x, dy = target.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    dx /= dist; dy /= dist;

    // The boss stops at bombardment range and strafes; others press in.
    let want = e.speed;
    if (e.kind === 'embermaw' && dist < 215) {
      want = 0;
      const strafe = Math.sin(state.time * 0.5 + e.seed);
      e.vx += (-dy * strafe * 26 - e.vx) * dt * 2;
      e.vy += (dx * strafe * 26 - e.vy) * dt * 2;
    } else {
      e.vx += (dx * want - e.vx) * dt * 3;
      e.vy += (dy * want - e.vy) * dt * 3;
    }

    // Gentle separation so a wave reads as silhouettes, not a blob.
    for (const other of state.enemies) {
      if (other === e || other.hp <= 0) continue;
      const sx = e.x - other.x, sy = e.y - other.y;
      const sd = Math.hypot(sx, sy);
      const min = e.r + other.r + 2;
      if (sd > 0.01 && sd < min) {
        e.vx += (sx / sd) * (min - sd) * 6 * dt * 10;
        e.vy += (sy / sd) * (min - sd) * 6 * dt * 10;
      }
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    // Burning ground from Dash Embers.
    for (const z of state.emberZones) {
      const zdx = e.x - z.x, zdy = e.y - z.y;
      if (zdx * zdx + zdy * zdy < (z.r + e.r * 0.5) ** 2) {
        z.tick = (z.tick || 0) + dt;
        if (z.tick > 0.3) { z.tick = 0; damageEnemy(state, e, 1, 0, 0); }
      }
    }
    if (e.hp <= 0) continue;

    // Shield ring zap.
    if (state.mods.shieldRing && e.kind !== 'embermaw') {
      const rd = Math.hypot(e.x - reactor.x, e.y - reactor.y);
      if (rd < ringR + e.r && state.mods.shieldCharge >= 0.34) {
        state.mods.shieldCharge -= 0.34;
        spawnSparks(state, e.x, e.y, '#40e0ff', 10, 240, 2.6, 0.35);
        damageEnemy(state, e, 3, (e.x - reactor.x) * 2, (e.y - reactor.y) * 2);
        continue;
      }
    }

    // Reaching the reactor: the wraith bursts against the core.
    const rd = Math.hypot(e.x - reactor.x, e.y - reactor.y);
    if (e.kind !== 'embermaw' && rd < reactor.r + e.r * 0.55) {
      state.enemies.splice(i, 1);
      spawnExplosion(state, e.x, e.y, e.color, 0.8);
      sfxReactorHit();
      damageReactor(state, e.reactorDmg);
      continue;
    }

    // Touching the warden hurts — unless she is mid-dash.
    const pd = Math.hypot(e.x - player.x, e.y - player.y);
    if (player.hp > 0 && pd < player.r + e.r * 0.7 && e.touchCd <= 0) {
      e.touchCd = 0.8;
      damagePlayer(state, e.playerDmg);
      sfxHurt();
      if (e.kind !== 'embermaw') {
        state.enemies.splice(i, 1);
        spawnExplosion(state, e.x, e.y, e.color, 0.8);
        continue;
      }
    }

    if (e.kind === 'embermaw') updateBoss(state, e, dt);
  }

  state.enemies = state.enemies.filter((e) => e.hp > 0 || e === state.boss && state.bossDying > 0);
}

// The Embermaw bombards: rings of ember bolts and aimed volleys, and it
// keeps shedding wraiths while it lives.
function updateBoss(state, e, dt) {
  e.boltCd -= dt;
  if (e.boltCd <= 0) {
    e.boltCd = 2.7;
    const ring = 12;
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2 + e.seed;
      state.enemyBolts.push({ x: e.x, y: e.y, vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, r: 5, dmg: 9, life: 3.4 });
    }
    const p = state.player;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    for (const off of [-0.16, 0, 0.16]) {
      state.enemyBolts.push({ x: e.x, y: e.y, vx: Math.cos(a + off) * 250, vy: Math.sin(a + off) * 250, r: 5, dmg: 11, life: 3 });
    }
    sfxBossRoar();
  }
  e.spawnCd -= dt;
  if (e.spawnCd <= 0 && state.enemies.length < 16) {
    e.spawnCd = 4.2;
    const minion = spawnEnemy(state, Math.random() < 0.4 ? 'swift' : 'wraith');
    minion.x = e.x + (Math.random() - 0.5) * 90;
    minion.y = e.y + (Math.random() - 0.5) * 90;
  }
}

export function updateBolts(state, dt) {
  const bolts = state.enemyBolts;
  const reactor = state.reactor;
  const player = state.player;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || b.x < -30 || b.x > VIEW_W + 30 || b.y < -30 || b.y > VIEW_H + 30) {
      bolts.splice(i, 1);
      continue;
    }
    const pd = Math.hypot(b.x - player.x, b.y - player.y);
    if (player.hp > 0 && pd < player.r + b.r) {
      bolts.splice(i, 1);
      damagePlayer(state, b.dmg);
      sfxHurt();
      continue;
    }
    const rd = Math.hypot(b.x - reactor.x, b.y - reactor.y);
    if (rd < reactor.r + b.r) {
      bolts.splice(i, 1);
      damageReactor(state, b.dmg);
      sfxReactorHit();
    }
  }
}

export function damageEnemy(state, e, dmg, kx, ky) {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  e.flash = 0.09;
  e.vx += kx; e.vy += ky;
  if (e.hp > 0) { sfxHit(); return; }

  // Death: burst, score through the chain, sound.
  const scale = e.kind === 'brute' ? 1.5 : e.kind === 'embermaw' ? 4 : 1;
  spawnExplosion(state, e.x, e.y, e.color, scale);
  sfxBoom(e.kind === 'brute' || e.kind === 'embermaw');
  const gained = registerKill(state, e.x, e.y, e.score);
  sfxChain(state.chain);
  // Floating score popup at the kill: plain pale for an ordinary kill,
  // but when the kill pushes the Ember Chain into a new multiplier tier
  // (every 8th chained kill) it lands big, gold and named — the number
  // the whole arena is chasing, readable mid-fight.
  if (state.chain > 0 && state.chain % 8 === 0) {
    state.floaters.push({
      x: e.x, y: e.y - e.r - 12, vy: -58,
      life: 1.3, maxLife: 1.3,
      text: '+' + gained + ' CHAIN x' + chainMultiplier(state),
      color: '#ffd23e', size: 26,
    });
    if (state.floaters.length > 24) state.floaters.shift();
  } else {
    addFloater(state, e.x, e.y - e.r - 4, '+' + gained, state.chain >= 8 ? '#ffd23e' : '#ffe9b0', state.chain >= 16 ? 20 : 15);
  }

  if (e.kind === 'embermaw') beginBossDeath(state, e);
}

// The boss does not simply vanish: it breaks into shards above the
// reactor while the core ignites, and the win screen follows.
function beginBossDeath(state, boss) {
  state.bossDying = 1.6;
  state.coreIgnited = true;
  state.shake = 16;
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 40 + Math.random() * 130;
    state.bossShards.push({
      x: boss.x, y: boss.y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 6,
      size: 8 + Math.random() * 20, life: 2.2 + Math.random(),
      color: boss.color,
    });
  }
  spawnExplosion(state, boss.x, boss.y, '#ffd23e', 3);
  // The escort burns with its master — spectacle, no score.
  for (const e of state.enemies) {
    if (e !== boss && e.hp > 0) {
      e.hp = 0;
      spawnExplosion(state, e.x, e.y, e.color, 0.9);
    }
  }
  state.enemyBolts.length = 0;
}
