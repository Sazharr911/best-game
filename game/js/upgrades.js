// upgrades.js — the between-wave draft. Every upgrade changes something
// the player can see: more fanned bolts, a shield ring around the reactor,
// a dash that leaves fire. rollChoices offers three the run does not
// already max out; applyUpgrade mutates state.mods (or repairs hulls).

export const UPGRADES = [
  {
    id: 'split', name: 'Split Shot', tag: 'FORKED CANNON',
    desc: '+1 projectile per shot, fanned wide.',
    max: 3,
    can: (s) => s.mods.split < 3,
    apply: (s) => { s.mods.split += 1; },
  },
  {
    id: 'rapid', name: 'Rapid Core', tag: 'OVERDRIVE',
    desc: '+22% fire rate. The cannon hums hotter.',
    max: 3,
    can: (s) => s.mods.fireRateMul < 1.7,
    apply: (s) => { s.mods.fireRateMul *= 1.22; },
  },
  {
    id: 'heavy', name: 'Heavy Bolts', tag: 'HIGH MASS',
    desc: '+1 damage per bolt. Brutes fall faster.',
    max: 3,
    can: (s) => s.mods.bulletDamage < 4,
    apply: (s) => { s.mods.bulletDamage += 1; },
  },
  {
    id: 'pierce', name: 'Piercing Rounds', tag: 'LANCE TIPS',
    desc: 'Bolts punch through +1 wraith.',
    max: 2,
    can: (s) => s.mods.pierce < 2,
    apply: (s) => { s.mods.pierce += 1; },
  },
  {
    id: 'chain', name: 'Chain Extender', tag: 'LONGER SPARK',
    desc: 'The Ember Chain stays alive +0.9s per kill.',
    max: 2,
    can: (s) => s.mods.chainWindow < 4.3,
    apply: (s) => { s.mods.chainWindow += 0.9; },
  },
  {
    id: 'shield', name: 'Reactor Shield Ring', tag: 'LAST WALL',
    desc: 'A neon ring zaps wraiths that reach the core.',
    max: 1,
    can: (s) => !s.mods.shieldRing,
    apply: (s) => { s.mods.shieldRing = true; s.mods.shieldCharge = 1; },
  },
  {
    id: 'dashEmbers', name: 'Dash Embers', tag: 'FIRE TRAIL',
    desc: 'Your dash leaves burning ground behind you.',
    max: 1,
    can: (s) => !s.mods.dashEmbers,
    apply: (s) => { s.mods.dashEmbers = true; },
  },
  {
    id: 'plating', name: 'Reactor Plating', tag: 'THICKER CORE',
    desc: '+30 reactor max HP, and repair 30 now.',
    max: 2,
    can: (s) => s.reactor.maxHp < 160,
    apply: (s) => { s.reactor.maxHp += 30; s.reactor.hp = Math.min(s.reactor.maxHp, s.reactor.hp + 30); },
  },
  {
    id: 'thrusters', name: 'Ion Thrusters', tag: 'SWIFT WARDEN',
    desc: '+14% move speed, dash recharges faster.',
    max: 2,
    can: (s) => s.mods.moveMul < 1.28,
    apply: (s) => { s.mods.moveMul *= 1.14; s.mods.dashCdMul *= 0.85; },
  },
  {
    id: 'hull', name: 'Warden Plating', tag: 'SECOND SKIN',
    desc: '+25 warden max HP, and repair 25 now.',
    max: 2,
    can: (s) => s.player.maxHp < 150,
    apply: (s) => { s.player.maxHp += 25; s.player.hp = Math.min(s.player.maxHp, s.player.hp + 25); },
  },
];

const FIELD_REPAIRS = {
  id: 'repairs', name: 'Field Repairs', tag: 'PATCH IT UP',
  desc: 'Repair 22 reactor HP and 22 warden HP.',
  max: 99,
  can: () => true,
  apply: (s) => {
    s.reactor.hp = Math.min(s.reactor.maxHp, s.reactor.hp + 22);
    s.player.hp = Math.min(s.player.maxHp, s.player.hp + 22);
  },
};

// Three distinct choices, shuffled from everything still available;
// Field Repairs pads the draft if the pool runs dry late in a run.
export function rollChoices(state) {
  const pool = UPGRADES.filter((u) => u.can(state));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, 3);
  while (picks.length < 3) picks.push(FIELD_REPAIRS);
  return picks;
}

export function applyUpgrade(state, upgrade) {
  upgrade.apply(state);
  state.upgradesOwned.push({ id: upgrade.id, name: upgrade.name });
}
