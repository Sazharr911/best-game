// main.js — EMBERFALL's bootstrap: canvas, input, the fixed-step game
// loop and the screen state machine (title → playing ⇄ upgrade draft →
// win / results → restart). A ?shot=N query parameter stages one exact
// scene with the game's own state and renderer for screenshots; it is
// never used in normal play.

import {
  createGameState, startRun, endRun, breakChain,
} from './game-state.js';
import { updatePlayer, updateBullets } from './player.js';
import { updateEnemies, updateBolts, createEnemy } from './enemies.js';
import { beginWave, updateWaves } from './waves.js';
import { applyUpgrade } from './upgrades.js';
import { updateParticles, spawnAmbientEmber, spawnExplosion } from './particles.js';
import { drawGame } from './render.js';
import {
  unlockAudio, startMusic, stopMusic, setMuted, isMuted,
  sfxClick, sfxUpgrade, sfxWin, sfxLose,
} from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const state = createGameState();

const input = {
  keys: new Set(),
  mouseX: 640, mouseY: 300,
  mouseDown: false,
  dashQueued: false,
};

// ------------------------------------------------------------ input wiring

function toGameCoords(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / rect.width),
    y: (evt.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener('mousemove', (evt) => {
  const p = toGameCoords(evt);
  input.mouseX = p.x; input.mouseY = p.y;
});
canvas.addEventListener('mousedown', (evt) => {
  unlockAudio();
  input.mouseDown = true;
  const p = toGameCoords(evt);
  input.mouseX = p.x; input.mouseY = p.y;
  handleClick(p.x, p.y);
});
window.addEventListener('mouseup', () => { input.mouseDown = false; });
canvas.addEventListener('contextmenu', (evt) => evt.preventDefault());

window.addEventListener('keydown', (evt) => {
  const key = evt.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) evt.preventDefault();
  unlockAudio();
  if (key === 'm') {
    setMuted(!isMuted());
    return;
  }
  if (key === 'shift' || key === ' ') input.dashQueued = true;
  input.keys.add(key);

  if (state.screen === 'title' && (key === 'enter' || key === ' ')) startGame();
  else if (state.screen === 'upgrade' && ['1', '2', '3'].includes(key)) {
    chooseUpgrade(Number(key) - 1);
  } else if (state.screen === 'win') {
    if (key === 'c') continueEndless();
    if (key === 'r') startGame();
  } else if (state.screen === 'results' && key === 'r') startGame();
  else if (state.screen === 'playing' && key === 'f') state.autoFire = !state.autoFire;
});
window.addEventListener('keyup', (evt) => {
  input.keys.delete(evt.key.toLowerCase());
});

// ------------------------------------------------------------ screen flow

function startGame() {
  unlockAudio();
  startRun(state);
  beginWave(state, 1);
  startMusic();
  sfxClick();
}

function chooseUpgrade(index) {
  const choice = state.choices[index];
  if (!choice) return;
  applyUpgrade(state, choice);
  sfxUpgrade();
  state.screen = 'playing';
  beginWave(state, state.wave + 1);
}

function continueEndless() {
  state.endless = true;
  state.coreIgnited = false;
  state.boss = null;
  state.reactor.hp = Math.min(state.reactor.maxHp, state.reactor.hp + 25);
  state.screen = 'playing';
  beginWave(state, state.wave + 1);
  sfxClick();
}

function handleClick(x, y) {
  const button = state.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (!button) return;
  if (button.id === 'start') startGame();
  else if (button.id.startsWith('upgrade-')) chooseUpgrade(Number(button.id.slice(8)));
  else if (button.id === 'continue') continueEndless();
  else if (button.id === 'again' || button.id === 'restart') startGame();
}

// ------------------------------------------------------------ the loop

let last = performance.now();
let emberTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;
  state.time += dt;

  if (!state.staged) {
    emberTimer -= dt;
    if (emberTimer <= 0) { emberTimer = 0.24; spawnAmbientEmber(state); }

    if (state.screen === 'playing') {
      state.runTime += dt;
      state.waveBanner = Math.max(0, state.waveBanner - dt);
      state.reactorFlash = Math.max(0, state.reactorFlash - dt);
      state.shake = Math.max(0, state.shake - dt * 26);

      if (state.chainTimer > 0) {
        state.chainTimer -= dt;
        if (state.chainTimer <= 0) breakChain(state, false);
      }
      if (state.bossDying > 0) {
        state.bossDying -= dt;
        updateParticles(state, dt);
        if (state.bossDying <= 0) {
          state.boss = null;
          endRun(state, true, 'boss');
          state.screen = 'win';
          sfxWin();
        }
      } else {
        updatePlayer(state, input, dt);
        updateBullets(state, dt);
        updateEnemies(state, dt);
        updateBolts(state, dt);
        updateWaves(state, dt);
        updateParticles(state, dt);
        if (state.screen === 'results') { stopMusic(); sfxLose(); }
      }
    } else {
      updateParticles(state, dt);
    }
  }

  drawGame(ctx, state, input);
}

// ------------------------------------------------------------ staging
// ?shot=1 dense boss-wave action (the cover) · 2 title · 3 CORE IGNITED
// win · 4 results. Each scene is assembled from the game's real entities
// and state and rendered by the real renderer; nothing is drawn by hand
// for the camera.

function stageShot(n) {
  // NOTE: staged is set at the END of each branch — startRun() replaces
  // the whole state object (createGameState has staged: false), so setting
  // it up front would silently un-freeze the scene and let it play live.
  if (n === 2) { state.staged = true; return; } // the title screen as it boots

  if (n === 1) {
    // THE COVER: the boss wave at full stretch — the Embermaw in the
    // arena, its escort converging, a x4 Ember Chain arcing kill to kill
    // into the reactor, score popups frozen mid-rise, both bolt streams
    // in the air and the full HUD carrying the objective.
    startRun(state);
    state.wave = 5;
    state.score = 12460;
    state.kills = 71;
    state.chain = 27;
    state.chainTimer = 2.3;
    state.bestChain = 34;
    state.runTime = 285;
    state.reactor.hp = 58;
    state.player.hp = 64;
    state.player.x = 430; state.player.y = 505;
    state.player.angle = Math.atan2(205 - 505, 950 - 430);
    input.mouseX = 950; input.mouseY = 205;
    state.mods.split = 1;
    state.mods.shieldRing = true;
    state.mods.shieldCharge = 0.7;
    state.mods.dashEmbers = true;
    state.upgradesOwned = [
      { id: 'split', name: 'Split Shot' }, { id: 'chain', name: 'Chain Extender' },
      { id: 'shield', name: 'Reactor Shield Ring' },
    ];
    const boss = createEnemy('embermaw', 950, 205, 1.48);
    boss.hp = Math.round(boss.maxHp * 0.42); // cracked, its bar visibly spent
    state.boss = boss;
    state.enemies.push(boss);
    const foes = [
      ['wraith', 250, 150], ['wraith', 180, 360], ['wraith', 355, 615],
      ['wraith', 1085, 470], ['wraith', 1150, 150], ['wraith', 770, 605],
      ['swift', 880, 115], ['swift', 235, 255], ['swift', 1035, 615],
      ['stalker', 455, 185], ['stalker', 1125, 330],
      ['brute', 150, 560], ['brute', 1015, 300],
    ];
    for (const [kind, x, y] of foes) state.enemies.push(createEnemy(kind, x, y, 1.48));
    const hurtBrute = state.enemies[state.enemies.length - 1];
    hurtBrute.hp = Math.round(hurtBrute.maxHp * 0.6); // its HP bar shows
    for (const e of state.enemies) {
      const a = Math.atan2(state.reactor.y - e.y, state.reactor.x - e.x);
      e.vx = Math.cos(a) * e.speed; e.vy = Math.sin(a) * e.speed;
    }
    // the Ember Chain, mid-crackle: three linked kills feeding the core
    state.chainLinks.push(
      { x1: 452, y1: 296, x2: 540, y2: 322, life: 0.55, maxLife: 0.55 },
      { x1: 540, y1: 322, x2: 606, y2: 348, life: 0.55, maxLife: 0.55 },
      { x1: 606, y1: 348, x2: 634, y2: 357, life: 0.55, maxLife: 0.55 },
    );
    state.lastKill = { x: 634, y: 357 };
    // score popups frozen mid-rise, the biggest where the chain hit x4
    state.floaters.push(
      { x: 452, y: 258, vy: -58, life: 0.85, maxLife: 1.3, text: '+600 CHAIN x4', color: '#ffd23e', size: 26 },
      { x: 838, y: 400, vy: -46, life: 0.5, maxLife: 0.95, text: '+200', color: '#ffd23e', size: 19 },
      { x: 268, y: 448, vy: -46, life: 0.68, maxLife: 0.95, text: '+80', color: '#ffe9b0', size: 16 },
      { x: 1096, y: 520, vy: -46, life: 0.6, maxLife: 0.95, text: '+100', color: '#ffe9b0', size: 16 },
    );
    // the warden's split-shot stream, flown toward the Embermaw
    const aim = state.player.angle;
    for (let i = 0; i < 5; i++) {
      const d = 60 + i * 58;
      state.bullets.push({
        x: state.player.x + Math.cos(aim) * d, y: state.player.y + Math.sin(aim) * d,
        vx: Math.cos(aim) * 800, vy: Math.sin(aim) * 800, r: 4, dmg: 1, pierce: 0, life: 1,
      });
    }
    for (const off of [-0.085, 0.085]) {
      state.bullets.push({
        x: state.player.x + Math.cos(aim + off) * 118, y: state.player.y + Math.sin(aim + off) * 118,
        vx: Math.cos(aim + off) * 800, vy: Math.sin(aim + off) * 800, r: 4, dmg: 1, pierce: 0, life: 1,
      });
    }
    // the Embermaw's answer: a bolt ring bursting and a volley inbound
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4;
      state.enemyBolts.push({
        x: 950 + Math.cos(a) * 96, y: 205 + Math.sin(a) * 96,
        vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, r: 5, dmg: 9, life: 3,
      });
    }
    for (const d of [130, 185]) {
      state.enemyBolts.push({
        x: 950 + Math.cos(aim + Math.PI) * d, y: 205 + Math.sin(aim + Math.PI) * d,
        vx: Math.cos(aim + Math.PI) * 250, vy: Math.sin(aim + Math.PI) * 250, r: 5, dmg: 11, life: 3,
      });
    }
    state.emberZones.push({ x: 392, y: 528, r: 30, life: 1.6, tick: 0 }, { x: 360, y: 548, r: 30, life: 1.6, tick: 0 });
    spawnExplosion(state, 452, 296, '#8a5cff', 1.1);
    state.staged = true;
    return;
  }

  if (n === 3) {
    startRun(state);
    state.wave = 5;
    state.score = 12850;
    state.kills = 86;
    state.bestChain = 31;
    state.runTime = 326;
    state.reactor.hp = 47;
    state.coreIgnited = true;
    state.upgradesOwned = [
      { id: 'split', name: 'Split Shot' }, { id: 'chain', name: 'Chain Extender' },
      { id: 'shield', name: 'Reactor Shield Ring' },
    ];
    endRun(state, true, 'boss');
    state.screen = 'win';
    // the Embermaw's shards, frozen mid-collapse above the reactor
    const shardAt = (x, y, size, rot) => ({
      x, y, vx: 0, vy: 0, rot, vr: 0, size, life: 99, color: '#ff5a2a',
    });
    state.bossShards.push(
      shardAt(548, 196, 27, 0.4), shardAt(648, 156, 19, 1.2), shardAt(736, 218, 23, 2.1),
      shardAt(590, 258, 15, 0.9), shardAt(694, 282, 17, 1.7), shardAt(640, 232, 12, 2.8),
      shardAt(506, 262, 14, 1.9), shardAt(770, 292, 12, 0.2),
    );
    spawnExplosion(state, 640, 250, '#ffd23e', 2.2);
    state.staged = true;
    return;
  }

  if (n === 4) {
    startRun(state);
    state.wave = 4;
    state.score = 6930;
    state.kills = 64;
    state.bestChain = 23;
    state.runTime = 243;
    state.reactor.hp = 0;
    state.upgradesOwned = [
      { id: 'split', name: 'Split Shot' }, { id: 'chain', name: 'Chain Extender' },
      { id: 'shield', name: 'Reactor Shield Ring' },
    ];
    endRun(state, false, 'reactor');
    state.staged = true;
    return;
  }
}

const shotParam = new URLSearchParams(window.location.search).get('shot');
if (shotParam) stageShot(Number(shotParam));

window.__emberfall = { state, input };
requestAnimationFrame(frame);
