// waves.js — the escalation. Five authored waves, the fifth carrying the
// Embermaw; after the core is ignited, endless waves keep scaling. Waves
// trickle in from the edges so the arena never dumps everything at once,
// and a cleared wave opens the upgrade draft before the next begins.

import { spawnEnemy } from './enemies.js';
import { rollChoices } from './upgrades.js';
import { addFloater } from './particles.js';
import { sfxBossRoar } from './audio.js';

export const BOSS_WAVE = 5;

// Wave recipes: lists of enemy kinds, shuffled before they queue.
const RECIPES = {
  1: ['wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith'],
  2: ['wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'swift', 'swift', 'swift'],
  3: ['wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'swift', 'swift', 'swift', 'swift', 'stalker', 'stalker'],
  4: ['wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'wraith', 'swift', 'swift', 'swift', 'swift', 'swift', 'swift', 'stalker', 'stalker', 'stalker', 'brute', 'brute'],
};

function endlessRecipe(n) {
  const list = [];
  const wraiths = 12 + n, swifts = 4 + Math.floor(n / 2), stalkers = 2 + Math.floor(n / 3), brutes = 1 + Math.floor(n / 3);
  for (let i = 0; i < wraiths; i++) list.push('wraith');
  for (let i = 0; i < swifts; i++) list.push('swift');
  for (let i = 0; i < stalkers; i++) list.push('stalker');
  for (let i = 0; i < brutes; i++) list.push('brute');
  return list;
}

export function hpMultiplier(wave) {
  return wave <= BOSS_WAVE ? 1 + (wave - 1) * 0.12 : 1.5 + (wave - BOSS_WAVE) * 0.3;
}

export function beginWave(state, n) {
  state.wave = n;
  state.phase = 'combat';
  state.waveBanner = 2.4;
  const mul = hpMultiplier(n);
  if (n === BOSS_WAVE) {
    state.spawnQueue = ['wraith', 'wraith', 'swift', 'wraith', 'swift', 'wraith', 'wraith', 'swift']
      .map((kind) => ({ kind, mul }));
    state.boss = spawnEnemy(state, 'embermaw', mul);
    addFloater(state, state.reactor.x, 120, 'THE EMBERMAW COMES FOR THE CORE', '#ff5a2a', 26);
    sfxBossRoar();
    return;
  }
  const recipe = RECIPES[n] || endlessRecipe(n);
  const shuffled = [...recipe];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  state.spawnQueue = shuffled.map((kind) => ({ kind, mul }));
  state.spawnTimer = 0.4;
}

export function updateWaves(state, dt) {
  if (state.phase !== 'combat' || state.bossDying > 0) return;

  // Trickle the queue in, one or two at a time.
  if (state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = 0.55;
      const next = state.spawnQueue.shift();
      spawnEnemy(state, next.kind, next.mul);
      if (state.spawnQueue.length > 0 && Math.random() < 0.45) {
        const extra = state.spawnQueue.shift();
        spawnEnemy(state, extra.kind, extra.mul);
      }
    }
    return;
  }

  // Queue empty and arena clear: the wave is done.
  const living = state.enemies.some((e) => e.hp > 0);
  if (!living && state.screen === 'playing') {
    if (state.wave === BOSS_WAVE && !state.endless) return; // only the boss ends wave 5
    state.score += 100 * state.wave;
    state.phase = 'cleared';
    state.choices = rollChoices(state);
    state.screen = 'upgrade';
  }
}

export function hostilesRemaining(state) {
  return state.spawnQueue.length + state.enemies.filter((e) => e.hp > 0).length;
}
