// particles.js — the game's short-lived visual effects: sparks, ember
// drift, explosions, floating score text, the burning zones a dash can
// leave, and the Ember Chain arcs that link one kill to the next. Counts
// are deliberately modest: effects dress the action, they never bury it.

const MAX_PARTICLES = 420;

export function spawnSparks(state, x, y, color, count, speed = 260, size = 3, life = 0.5) {
  for (let i = 0; i < count; i++) {
    if (state.particles.length >= MAX_PARTICLES) return;
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.3 + Math.random() * 0.9);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: life * (0.5 + Math.random() * 0.8), maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color, drag: 3.2, rise: 0,
    });
  }
}

export function spawnExplosion(state, x, y, color, scale = 1) {
  spawnSparks(state, x, y, color, Math.round(16 * scale), 300 * scale, 3.4, 0.55);
  spawnSparks(state, x, y, '#ffd23e', Math.round(8 * scale), 170 * scale, 2.4, 0.4);
  spawnSparks(state, x, y, '#ffffff', Math.round(4 * scale), 90 * scale, 2, 0.25);
}

// Ambient embers that drift up through the arena at all times.
export function spawnAmbientEmber(state) {
  if (state.particles.length >= MAX_PARTICLES) return;
  state.particles.push({
    x: Math.random() * 1280, y: 730,
    vx: (Math.random() - 0.5) * 14, vy: -(14 + Math.random() * 30),
    life: 4 + Math.random() * 3, maxLife: 7,
    size: 1.4 + Math.random() * 1.6,
    color: Math.random() < 0.7 ? '#ff7a1a' : '#40e0ff',
    drag: 0, rise: 1,
  });
}

export function addFloater(state, x, y, text, color = '#ffd23e', size = 17) {
  state.floaters.push({ x, y, vy: -46, life: 0.95, maxLife: 0.95, text, color, size });
  if (state.floaters.length > 24) state.floaters.shift();
}

export function updateParticles(state, dt) {
  const ps = state.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) { ps.splice(i, 1); continue; }
    const dragK = Math.max(0, 1 - p.drag * dt);
    p.vx *= dragK; p.vy *= dragK;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = state.chainLinks.length - 1; i >= 0; i--) {
    state.chainLinks[i].life -= dt;
    if (state.chainLinks[i].life <= 0) state.chainLinks.splice(i, 1);
  }
  for (let i = state.floaters.length - 1; i >= 0; i--) {
    const f = state.floaters[i];
    f.life -= dt;
    f.y += f.vy * dt;
    if (f.life <= 0) state.floaters.splice(i, 1);
  }
  for (let i = state.emberZones.length - 1; i >= 0; i--) {
    state.emberZones[i].life -= dt;
    if (state.emberZones[i].life <= 0) state.emberZones.splice(i, 1);
  }
  for (let i = state.bossShards.length - 1; i >= 0; i--) {
    const s = state.bossShards[i];
    s.life -= dt;
    s.vy += 300 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.rot += s.vr * dt;
    if (s.life <= 0 || s.y > 760) state.bossShards.splice(i, 1);
  }
}

export function drawParticles(ctx, state) {
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = p.rise ? a * 0.55 : a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.rise ? 1 : a), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The Ember Chain made visible: a jagged lightning polyline between the
// last two kills, redrawn with fresh jitter each frame so it crackles.
export function drawChainArcs(ctx, state) {
  for (const link of state.chainLinks) {
    const a = Math.max(0, link.life / link.maxLife);
    const segs = 7;
    ctx.strokeStyle = `rgba(255, 170, 40, ${0.75 * a})`;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = '#ff7a1a';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(link.x1, link.y1);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const mx = link.x1 + (link.x2 - link.x1) * t;
      const my = link.y1 + (link.y2 - link.y1) * t;
      const off = (Math.random() - 0.5) * 26 * Math.sin(t * Math.PI);
      ctx.lineTo(mx + off, my + (Math.random() - 0.5) * 26 * Math.sin(t * Math.PI));
    }
    ctx.lineTo(link.x2, link.y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

export function drawEmberZones(ctx, state) {
  for (const z of state.emberZones) {
    const a = Math.min(1, z.life / 1.6);
    const grad = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r);
    grad.addColorStop(0, `rgba(255, 150, 40, ${0.5 * a})`);
    grad.addColorStop(1, 'rgba(255, 90, 20, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawFloaters(ctx, state) {
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.globalAlpha = a;
    ctx.font = `bold ${f.size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 8;
    ctx.fillText(f.text, f.x, f.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}
