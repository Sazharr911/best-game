// game-state.js — the single source of truth for a run of EMBERFALL.
// Every other module reads and mutates the object created here; keeping the
// shape in one file means the renderer, the waves and the combat code can
// never disagree about what a run looks like.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const REACTOR_X = VIEW_W / 2;
export const REACTOR_Y = VIEW_H / 2;
export const REACTOR_R = 34;

export const CHAIN_BASE_WINDOW = 2.6; // seconds a kill keeps the chain alive
export const CHAIN_HEAL_EVERY = 10;   // every Nth chained kill feeds the core
export const CHAIN_HEAL_AMOUNT = 3;

export function createPlayer() {
  return {
    x: REACTOR_X - 190, y: REACTOR_Y + 120,
    vx: 0, vy: 0, r: 14,
    hp: 100, maxHp: 100,
    angle: 0, fireCd: 0,
    dashCd: 0, dashTime: 0, invuln: 0,
  };
}

export function createGameState() {
  return {
    screen: 'title', // title | playing | upgrade | win | results
    time: 0,
    runTime: 0,
    wave: 0,
    phase: 'combat', // combat | cleared
    score: 0,
    kills: 0,
    chain: 0,
    chainTimer: 0,
    bestChain: 0,
    lastKill: null,
    player: createPlayer(),
    reactor: { x: REACTOR_X, y: REACTOR_Y, r: REACTOR_R, hp: 100, maxHp: 100 },
    mods: freshMods(),
    bullets: [],
    enemyBolts: [],
    enemies: [],
    particles: [],
    chainLinks: [],
    floaters: [],
    emberZones: [],
    spawnQueue: [],
    spawnTimer: 0,
    waveBanner: 0,
    choices: [],
    upgradesOwned: [],
    autoFire: false,
    shake: 0,
    reactorFlash: 0,
    boss: null,
    bossDying: 0,
    bossShards: [],
    coreIgnited: false,
    endless: false,
    result: null,
    buttons: [],
    staged: false,
  };
}

export function freshMods() {
  return {
    split: 0,          // extra fanned projectiles per shot
    pierce: 0,         // enemies each bolt can pass through
    fireRateMul: 1,    // Rapid Core multiplier
    bulletDamage: 1,   // Heavy Bolts
    chainWindow: CHAIN_BASE_WINDOW,
    shieldRing: false, // Reactor Shield Ring owned
    shieldCharge: 1,   // 0..1, a zap spends 0.34
    dashEmbers: false, // dash leaves burning zones
    moveMul: 1,        // Ion Thrusters
    dashCdMul: 1,
  };
}

// A fresh run: everything back to wave 0, the caller starts wave 1.
export function startRun(state) {
  const keepAutoFire = state.autoFire;
  Object.assign(state, createGameState());
  state.autoFire = keepAutoFire;
  state.screen = 'playing';
}

// The chain multiplier: +1 for every 8 chained kills, capped at x8.
export function chainMultiplier(state) {
  return 1 + Math.min(7, Math.floor(state.chain / 8));
}

// Register a kill at (x, y): grow the chain, arc from the previous kill,
// feed the score (times the multiplier) and, every CHAIN_HEAL_EVERY kills,
// feed a little health back to the reactor the chain is defending.
export function registerKill(state, x, y, baseScore) {
  state.kills += 1;
  state.chain += 1;
  state.chainTimer = state.mods.chainWindow;
  if (state.chain > state.bestChain) state.bestChain = state.chain;
  if (state.lastKill) {
    state.chainLinks.push({
      x1: state.lastKill.x, y1: state.lastKill.y, x2: x, y2: y,
      life: 0.55, maxLife: 0.55,
    });
  }
  state.lastKill = { x, y };
  const mult = chainMultiplier(state);
  const gained = baseScore * mult;
  state.score += gained;
  if (state.chain % CHAIN_HEAL_EVERY === 0 && state.reactor.hp > 0) {
    state.reactor.hp = Math.min(state.reactor.maxHp, state.reactor.hp + CHAIN_HEAL_AMOUNT);
  }
  return gained;
}

// The chain shatters: reactor damage calls this, and so does the timer.
export function breakChain(state, announce) {
  if (announce && state.chain >= 6) {
    state.floaters.push({
      x: state.reactor.x, y: state.reactor.y - 64,
      vy: -34, life: 1.1, maxLife: 1.1,
      text: 'CHAIN BROKEN', color: '#ff5d5d', size: 22,
    });
  }
  state.chain = 0;
  state.chainTimer = 0;
  state.lastKill = null;
}

export function damageReactor(state, dmg) {
  if (state.screen !== 'playing' || state.reactor.hp <= 0) return;
  state.reactor.hp -= dmg;
  state.reactorFlash = 0.35;
  state.shake = Math.min(14, state.shake + 5);
  breakChain(state, true);
  if (state.reactor.hp <= 0) {
    state.reactor.hp = 0;
    endRun(state, false, 'reactor');
  }
}

export function damagePlayer(state, dmg) {
  const p = state.player;
  if (state.screen !== 'playing' || p.invuln > 0 || p.hp <= 0) return;
  p.hp -= dmg;
  p.invuln = 0.7;
  state.shake = Math.min(12, state.shake + 4);
  if (p.hp <= 0) {
    p.hp = 0;
    endRun(state, false, 'player');
  }
}

// Fill the results record and move to the results screen (or, for a win,
// the caller moves to the win screen once the boss collapse has played).
export function endRun(state, win, reason) {
  state.result = {
    win,
    reason, // 'reactor' | 'player' | 'boss'
    wave: state.wave,
    score: state.score,
    kills: state.kills,
    bestChain: state.bestChain,
    time: state.runTime,
    upgrades: state.upgradesOwned.map((u) => u.name),
  };
  if (!win) state.screen = 'results';
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
