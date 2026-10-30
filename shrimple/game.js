(() => {
'use strict';

// ---------- Config ----------
const CASTS = 10;
const BAIT = 3;
const PX_PER_M = 2;
const BOTTOM_M = 10935;
const DAILY_EPOCH = Date.UTC(2026, 9, 30); // Daily #1
const ZONES = [
  { name: 'Sunlight Zone', from: 0 },
  { name: 'Twilight Zone', from: 200 },
  { name: 'Midnight Zone', from: 1000 },
  { name: 'Abyssal Zone', from: 4000 },
  { name: 'Hadal Zone', from: 6000 },
];
const WATER = [
  [0, '#5fd0f7'], [100, '#1497d4'], [200, '#0a66a8'], [600, '#0b3f7a'],
  [1000, '#0a2a5e'], [2500, '#08183c'], [4000, '#050c27'], [6000, '#03061a'], [11000, '#010108'],
];
const CREATURES = [
  { to: 200,   pool: ['🐠', '🐟', '🐡', '🐢', '🐬', '🪼', '🐠'] },
  { to: 1000,  pool: ['🦑', '🐟', '🦈', '🐋', '🪼', '🐙'] },
  { to: 4000,  pool: ['🦑', '🐙', '🪼', '🦐', '🐟'] },
  { to: 6000,  pool: ['🦐', '🪼', '🐙'] },
  { to: 11000, pool: ['🦐', '🪼'] },
];

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('shrimple.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('shrimple.' + k, JSON.stringify(v)); } catch {} },
};
const fmt = (m) => Math.round(m).toLocaleString('en-US') + ' m';
const zoneAt = (m) => m >= BOTTOM_M ? 'Challenger Deep' : ZONES.filter(z => m >= z.from).pop().name;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Answer matching ----------
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
}
function variants(k) {
  const v = new Set([k]);
  if (k.startsWith('the') && k.length > 5) v.add(k.slice(3));
  for (const x of [...v]) {
    if (x.endsWith('ies')) v.add(x.slice(0, -3) + 'y');
    if (x.endsWith('es')) v.add(x.slice(0, -2));
    if (x.endsWith('s')) v.add(x.slice(0, -1));
    v.add(x + 's');
  }
  return [...v];
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const BOOKS = new Map();
function book(cat) {
  if (BOOKS.has(cat.id)) return BOOKS.get(cat.id);
  const entries = [];
  const map = new Map();
  cat.tiers.forEach((line, tier) => {
    for (const raw of line.split(',')) {
      const names = raw.split('|').map(s => s.trim()).filter(Boolean);
      if (!names.length) continue;
      const keys = names.map(norm).filter(Boolean);
      if (keys.some(k => map.has(k))) {
        keys.forEach(k => { if (!map.has(k)) map.set(k, map.get(keys.find(x => map.has(x)))); });
        continue;
      }
      const e = { name: names[0], tier, keys };
      entries.push(e);
      keys.forEach(k => map.set(k, e));
    }
  });
  const b = { entries, map };
  BOOKS.set(cat.id, b);
  return b;
}
function lookup(cat, text) {
  const { entries, map } = book(cat);
  const k = norm(text);
  if (!k) return null;
  for (const v of variants(k)) if (map.has(v)) return map.get(v);
  if (k.length < 5) return null;
  const max = k.length >= 7 ? 2 : 1;
  let best = null, bestD = max + 1, tie = false;
  for (const e of entries) {
    for (const key of e.keys) {
      if (key.length < 5) continue;
      const d = lev(k, key, max);
      if (d < bestD) { best = e; bestD = d; tie = false; }
      else if (d === bestD && best !== e) tie = true;
    }
  }
  return bestD <= max && !tie ? best : null;
}

// ---------- Daily ----------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dailyNumber() {
  const d = new Date();
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - DAILY_EPOCH) / 86400000) + 1;
}
function dailyCategory() {
  const n = Math.max(1, dailyNumber());
  const cycle = Math.floor((n - 1) / CATEGORIES.length);
  const order = shuffle(CATEGORIES, rng(9001 + cycle * 7919));
  return order[(n - 1) % CATEGORIES.length];
}

// ---------- Sound ----------
let actx = null;
let soundOn = store.get('sound', true);
function audio() {
  if (!soundOn) return null;
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, start, dur, type = 'sine', vol = 0.16, slide = 0) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  plop() { tone(520, 0, 0.18, 'sine', 0.2, 0.35); },
  catch(tier) {
    const notes = [523, 659, 784, 988, 1175, 1568];
    for (let i = 0; i <= tier + 1; i++) tone(notes[i], 0.07 * i, 0.35 + tier * 0.08, i % 2 ? 'triangle' : 'sine', 0.12);
    if (tier >= 3) tone(130, 0, 1.2, 'sine', 0.15, 0.5);
  },
  miss() { tone(180, 0, 0.3, 'sawtooth', 0.07, 0.6); },
  dupe() { tone(330, 0, 0.12, 'square', 0.04); },
  end() { [784, 659, 523, 392].forEach((f, i) => tone(f, i * 0.12, 0.4, 'triangle', 0.1)); },
};
function buzz(ms) {
  try {
    if (window.ShrimpleAndroid) window.ShrimpleAndroid.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}

// ---------- Ocean renderer ----------
const cv = $('ocean');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
const view = {
  hookM: 0,        // displayed hook depth (meters)
  targetM: 0,      // where the hook is heading
  camY: 0,         // world px at top of screen
  anchor: 0.5,     // hook's vertical position on screen (fraction)
  anchorTarget: 0.5,
  flash: null,     // {color, t}
  popups: [],
  bubbles: [],
  t: 0,
};

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const WATER_RGB = WATER.map(([m, c]) => [m, hexToRgb(c)]);
function waterAt(m) {
  if (m <= 0) return WATER_RGB[0][1];
  for (let i = 1; i < WATER_RGB.length; i++) {
    const [m1, c1] = WATER_RGB[i];
    if (m <= m1) {
      const [m0, c0] = WATER_RGB[i - 1];
      const f = (m - m0) / (m1 - m0);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * f));
    }
  }
  return WATER_RGB[WATER_RGB.length - 1][1];
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// Deterministic decoration placed in world space, generated per tile.
const TILE = 360;
const tileCache = new Map();
function tile(i) {
  if (tileCache.has(i)) return tileCache.get(i);
  const r = rng(i * 2654435761);
  const topM = (i * TILE) / PX_PER_M;
  const snow = [], glow = [], fish = [];
  for (let k = 0; k < 14; k++) snow.push({ x: r(), y: r() * TILE, s: 0.6 + r() * 1.6, p: r() * 6.28 });
  const deep = Math.min(1, Math.max(0, (topM - 600) / 1400));
  const nGlow = Math.round(deep * 6 * r());
  for (let k = 0; k < nGlow; k++) glow.push({ x: r(), y: r() * TILE, s: 1 + r() * 2.2, p: r() * 6.28, hue: r() < 0.7 ? 185 : (r() < 0.5 ? 140 : 280) });
  if (topM > 4 && topM < BOTTOM_M - 30) {
    const band = CREATURES.find(b => topM < b.to) || CREATURES[CREATURES.length - 1];
    const chance = topM < 200 ? 0.85 : topM < 1000 ? 0.6 : topM < 4000 ? 0.4 : 0.22;
    if (r() < chance) {
      fish.push({ e: band.pool[Math.floor(r() * band.pool.length)], x: r(), y: 40 + r() * (TILE - 80),
        dir: r() < 0.5 ? -1 : 1, v: 0.012 + r() * 0.03, s: 22 + r() * 22, p: r() * 6.28 });
    }
  }
  const t = { snow, glow, fish };
  tileCache.set(i, t);
  if (tileCache.size > 400) tileCache.delete(tileCache.keys().next().value);
  return t;
}

function drawSky(yWater) {
  if (yWater <= 0) return;
  const g = ctx.createLinearGradient(0, yWater - H, 0, yWater);
  g.addColorStop(0, '#2b6cb0'); g.addColorStop(0.6, '#8fd3ff'); g.addColorStop(1, '#ffe7c2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, yWater);
  // sun
  ctx.fillStyle = 'rgba(255,240,200,0.9)';
  ctx.beginPath(); ctx.arc(W * 0.8, yWater - 120, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,200,0.25)';
  ctx.beginPath(); ctx.arc(W * 0.8, yWater - 120, 56, 0, Math.PI * 2); ctx.fill();
}

function drawBoat(yWater, t) {
  const bx = W * 0.5 - 70, by = yWater + Math.sin(t * 1.6) * 2;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(Math.sin(t * 1.3) * 0.03);
  // rod
  ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(18, -14); ctx.lineTo(70, -58); ctx.stroke();
  // fisher
  ctx.fillStyle = '#ffcc80';
  ctx.beginPath(); ctx.arc(8, -30, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffb300';
  ctx.beginPath(); ctx.moveTo(-1, -33); ctx.lineTo(17, -33); ctx.lineTo(8, -44); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e65100';
  ctx.fillRect(1, -24, 14, 14);
  // hull
  ctx.fillStyle = '#8d5524';
  ctx.beginPath(); ctx.moveTo(-36, -12); ctx.lineTo(40, -12); ctx.lineTo(28, 6); ctx.lineTo(-26, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a86a32'; ctx.fillRect(-34, -12, 72, 4);
  ctx.restore();
  return { x: bx + 70, y: by - 58 };
}

function drawHook(x, y, swing) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing);
  ctx.strokeStyle = '#dfe7ee'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(180,230,255,0.6)'; ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 26);
  ctx.arc(-9, 26, 9, 0, Math.PI, false);
  ctx.lineTo(-18, 17);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, 17); ctx.lineTo(-13, 21); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -3, 3, 0, Math.PI * 2); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = '24px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(-10, 36); ctx.rotate(0.5); ctx.fillText('🦐', 0, 0); ctx.restore();
  ctx.restore();
}

function render(dt) {
  view.t += dt;
  const t = view.t;

  // ease hook toward target
  const diff = view.targetM - view.hookM;
  const speed = Math.max(40, Math.abs(diff) * 2.4);
  view.hookM += Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
  // with the keyboard open the screen is short, so keep the hook above the answer chips
  const anchorGoal = current === 'game' && H < 700 ? Math.min(view.anchorTarget, 0.3) : view.anchorTarget;
  view.anchor += (anchorGoal - view.anchor) * Math.min(1, dt * 3);
  const sinking = Math.abs(diff) > 1;

  const hookPx = view.hookM * PX_PER_M;
  view.camY = hookPx - H * view.anchor;
  const cam = view.camY;
  const yWater = -cam;

  // water gradient for the visible slice
  const topM = Math.max(0, cam / PX_PER_M), botM = (cam + H) / PX_PER_M;
  const g = ctx.createLinearGradient(0, Math.max(0, yWater), 0, H);
  for (let i = 0; i <= 6; i++) {
    const m = topM + (botM - topM) * (i / 6);
    g.addColorStop(i / 6, rgb(waterAt(m)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, yWater), W, H);
  drawSky(yWater);

  // light rays near the surface
  if (topM < 260) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fade = Math.max(0, 1 - topM / 260);
    for (let i = 0; i < 5; i++) {
      const x = ((i * 0.23 + 0.08) * W) + Math.sin(t * 0.3 + i) * 30;
      const rg = ctx.createLinearGradient(0, yWater, 0, yWater + 520);
      rg.addColorStop(0, `rgba(255,255,255,${0.08 * fade})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(x - 20, yWater); ctx.lineTo(x + 20, yWater);
      ctx.lineTo(x + 90, yWater + 520); ctx.lineTo(x - 10, yWater + 520);
      ctx.fill();
    }
    ctx.restore();
  }

  // tiles: snow, glow, creatures
  const i0 = Math.floor(Math.max(0, cam) / TILE), i1 = Math.floor((cam + H) / TILE);
  for (let i = i0; i <= i1; i++) {
    const tl = tile(i), base = i * TILE - cam;
    const tm = (i * TILE) / PX_PER_M;
    ctx.fillStyle = tm < 400 ? 'rgba(255,255,255,0.35)' : 'rgba(200,220,255,0.28)';
    for (const s of tl.snow) {
      const y = base + ((s.y - t * 6 * s.s) % TILE + TILE) % TILE;
      if (y < yWater) continue;
      ctx.beginPath(); ctx.arc(s.x * W + Math.sin(t + s.p) * 4, y, s.s, 0, 6.28); ctx.fill();
    }
    for (const gl of tl.glow) {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.7 + gl.p));
      const x = gl.x * W + Math.sin(t * 0.5 + gl.p) * 12, y = base + gl.y;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, gl.s * 6);
      rg.addColorStop(0, `hsla(${gl.hue},100%,75%,${a})`);
      rg.addColorStop(1, `hsla(${gl.hue},100%,60%,0)`);
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(x, y, gl.s * 6, 0, 6.28); ctx.fill();
    }
    for (const f of tl.fish) {
      const span = W + 120;
      const x = (((f.x * span + f.dir * t * f.v * span) % span) + span) % span - 60;
      const y = base + f.y + Math.sin(t * 1.5 + f.p) * 6;
      const depthFade = tm > 1000 ? 0.55 : 0.9;
      ctx.save();
      ctx.globalAlpha = depthFade;
      ctx.translate(x, y);
      if (f.dir > 0) ctx.scale(-1, 1);
      ctx.font = `${f.s}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(f.e, 0, 0);
      ctx.restore();
    }
  }

  // depth ruler + zone lines
  ctx.save();
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const step = 100;
  for (let m = Math.ceil(topM / step) * step; m <= botM; m += step) {
    if (m <= 0 || m > BOTTOM_M) continue;
    const y = m * PX_PER_M - cam;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, y, m % 500 === 0 ? 16 : 9, 1.5);
    if (m % 500 === 0) { ctx.textAlign = 'left'; ctx.fillText(m.toLocaleString('en-US') + 'm', 20, y); }
  }
  for (const z of ZONES.slice(1)) {
    const y = z.from * PX_PER_M - cam;
    if (y < -20 || y > H + 20) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(z.name.toUpperCase() + ' · ' + z.from.toLocaleString('en-US') + 'm', W - 14, y - 12);
    ctx.font = '600 11px system-ui, sans-serif';
  }
  ctx.restore();

  // seabed at the bottom of the trench
  const yBed = BOTTOM_M * PX_PER_M - cam + 46;
  if (yBed < H) {
    ctx.fillStyle = '#14131c';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, yBed + Math.sin(x * 0.05) * 8 + Math.sin(x * 0.13) * 5);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CHALLENGER DEEP · 10,935m', W / 2, yBed + 34);
  }

  // surface line + boat + fishing line
  let tip = { x: W * 0.5, y: yWater - 58 };
  if (yWater > -80) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.moveTo(0, yWater);
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, yWater + Math.sin(x * 0.04 + t * 2) * 2.2);
    ctx.lineTo(W, yWater + 3); ctx.lineTo(0, yWater + 3); ctx.fill();
    tip = drawBoat(yWater, t);
  }
  const swing = Math.sin(t * 1.1) * (sinking ? 0.02 : 0.08);
  const hx = W * 0.5 + Math.sin(t * 0.9) * (sinking ? 2 : 7);
  const hy = hookPx - cam;
  ctx.strokeStyle = 'rgba(235,245,255,0.75)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(tip.x, Math.max(tip.y, -10));
  ctx.quadraticCurveTo((tip.x + hx) / 2 + Math.sin(t) * 6, (Math.max(tip.y, 0) + hy) / 2, hx, hy - 3);
  ctx.stroke();

  // hook light in the dark
  const dark = Math.min(1, Math.max(0, (view.hookM - 300) / 900));
  if (dark > 0) {
    const rg = ctx.createRadialGradient(hx, hy + 20, 0, hx, hy + 20, 130);
    rg.addColorStop(0, `rgba(160,220,255,${0.22 * dark})`);
    rg.addColorStop(1, 'rgba(160,220,255,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(hx, hy + 20, 130, 0, 6.28); ctx.fill();
  }
  drawHook(hx, hy, swing);

  // bubbles
  if (sinking && Math.random() < 0.6) view.bubbles.push({ x: hx + (Math.random() - 0.5) * 16, y: hookPx + 10, r: 1.5 + Math.random() * 3, v: 40 + Math.random() * 60, life: 1.4 });
  ctx.strokeStyle = 'rgba(220,240,255,0.6)'; ctx.lineWidth = 1;
  view.bubbles = view.bubbles.filter(b => (b.life -= dt) > 0);
  for (const b of view.bubbles) {
    b.y -= b.v * dt; b.x += Math.sin(b.y * 0.05) * 0.4;
    ctx.globalAlpha = Math.min(1, b.life);
    ctx.beginPath(); ctx.arc(b.x, b.y - cam, b.r, 0, 6.28); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // catch popups
  view.popups = view.popups.filter(p => (p.t += dt) < 2.2);
  for (const p of view.popups) {
    const k = p.t / 2.2;
    ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
    ctx.textAlign = 'center';
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color; ctx.shadowBlur = 14;
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.fillText(p.big, W / 2 + 64, hy - 30 - k * 40);
    ctx.shadowBlur = 0;
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(p.small, W / 2 + 64, hy - 6 - k * 40);
  }
  ctx.globalAlpha = 1;

  // tier flash
  if (view.flash) {
    view.flash.t += dt;
    const a = Math.max(0, 0.35 - view.flash.t * 0.5);
    if (a <= 0) view.flash = null;
    else { ctx.fillStyle = view.flash.color; ctx.globalAlpha = a; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  }

  if (game) {
    $('depthVal').textContent = fmt(view.hookM);
    $('zoneName').textContent = zoneAt(view.hookM);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Screens ----------
const screens = ['menu', 'picker', 'game', 'results'];
let current = 'menu';
function show(name) {
  current = name;
  screens.forEach(s => $(s).classList.toggle('hidden', s !== name));
  if (name === 'menu') { refreshMenu(); view.targetM = 20; view.anchorTarget = 0.5; }
}
function refreshMenu() {
  const n = dailyNumber();
  const cat = dailyCategory();
  const done = store.get('daily.' + todayKey(), null);
  $('dailyInfo').textContent = done
    ? `#${n} · ${cat.emoji} ${cat.name} · ${fmt(done.depth)} ✓`
    : `#${n} · ${cat.emoji} ${cat.name}`;
  $('soundBtn').textContent = soundOn ? '🔊' : '🔇';
}

// ---------- Game ----------
let game = null;

function startGame(cat, mode) {
  game = { cat, mode, casts: CASTS, bait: BAIT, depth: 0, caught: [], seen: new Set(), over: false };
  view.targetM = 0; view.hookM = 0; view.anchorTarget = 0.42;
  $('catEmoji').textContent = cat.emoji;
  $('catName').textContent = cat.name;
  $('catPrompt').textContent = (mode === 'daily' ? `Daily #${dailyNumber()} · ` : '') + cat.prompt;
  $('catches').innerHTML = '';
  $('guess').value = '';
  $('guess').disabled = false; $('castBtn').disabled = false;
  renderStatus();
  show('game');
  setTimeout(() => $('guess').focus(), 60);
}

function renderStatus() {
  const casts = $('casts');
  casts.innerHTML = '';
  for (let i = 0; i < CASTS; i++) {
    const d = document.createElement('div');
    d.className = 'cast-dot';
    const c = game.caught[i];
    if (c) { d.style.background = TIERS[c.tier].color; d.style.borderColor = TIERS[c.tier].color; }
    casts.appendChild(d);
  }
  $('bait').innerHTML = Array.from({ length: BAIT }, (_, i) => `<span class="${i < game.bait ? '' : 'gone'}">🦐</span>`).join('');
}

let toastTimer = 0;
function toast(msg, bad) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('bad', !!bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}
function shake() {
  const f = $('guessForm');
  f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
}

function chip(entry) {
  const t = TIERS[entry.tier];
  const li = document.createElement('li');
  li.className = 'chip';
  li.style.setProperty('--c', t.color);
  li.innerHTML = `<i></i>${escapeHtml(entry.name)} <b>+${t.meters}</b>`;
  return li;
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function submitGuess() {
  if (!game || game.over) return;
  const input = $('guess');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sfx.plop();
  const entry = lookup(game.cat, text);
  if (!entry) {
    game.bait--;
    renderStatus();
    shake(); sfx.miss(); buzz(120);
    toast(game.bait > 0 ? `“${text}” isn't on our list. Lost a shrimp!` : `“${text}” isn't on our list. Out of shrimp!`, true);
    if (game.bait <= 0) endGame();
    return;
  }
  if (game.seen.has(entry)) {
    sfx.dupe(); shake();
    toast(`Already caught ${entry.name}`);
    return;
  }
  game.seen.add(entry);
  game.caught.push(entry);
  game.casts--;
  const tier = TIERS[entry.tier];
  game.depth = Math.min(BOTTOM_M, game.depth + tier.meters);
  view.targetM = game.depth;
  view.popups.push({ big: `+${tier.meters}m`, small: tier.name.toUpperCase(), color: tier.color, t: 0 });
  if (entry.tier >= 2) view.flash = { color: tier.color, t: 0 };
  sfx.catch(entry.tier);
  buzz(entry.tier >= 3 ? 60 + entry.tier * 40 : 25);
  const norm1 = norm(text);
  if (!entry.keys.some(k => variants(norm1).includes(k))) toast(`Reeled in: ${entry.name}`);
  $('catches').prepend(chip(entry));
  renderStatus();
  if (game.casts <= 0 || game.depth >= BOTTOM_M) endGame();
}

function endGame() {
  game.over = true;
  $('guess').disabled = true; $('castBtn').disabled = true;
  $('guess').blur();
  const g = game;
  const bestKey = 'best.' + g.cat.id;
  const prevBest = store.get(bestKey, 0);
  if (g.depth > prevBest) store.set(bestKey, g.depth);
  if (g.mode === 'daily') store.set('daily.' + todayKey(), { depth: g.depth, bait: g.bait, caught: g.caught.map(e => e.name) });
  // let the hook finish sinking before showing results
  const wait = Math.min(2600, 900 + Math.abs(view.targetM - view.hookM) * 1.2);
  setTimeout(() => { if (game === g) { sfx.end(); showResults(g, prevBest); } }, wait);
}

function showResults(g, prevBest) {
  const tiers = g.caught.map(e => e.tier);
  $('resCat').textContent = `${g.cat.emoji} ${g.cat.name}${g.mode === 'daily' ? ` · Daily #${dailyNumber()}` : ''}`;
  $('resDepth').textContent = fmt(g.depth);
  $('resZone').textContent = g.depth >= BOTTOM_M ? '🏆 You hit the bottom of the Challenger Deep!' : zoneAt(g.depth);
  $('resBest').textContent = g.depth > prevBest && prevBest > 0 ? `New personal best! (was ${fmt(prevBest)})`
    : prevBest > 0 ? `Your best here: ${fmt(Math.max(prevBest, g.depth))}` : '';
  $('resSquares').textContent = tiers.map(t => TIERS[t].square).join('') + (g.bait <= 0 ? '💀' : '');
  const list = $('resList'); list.innerHTML = '';
  g.caught.forEach(e => list.appendChild(chip(e)));
  // deep cuts: a few of the rarest answers the player didn't use
  const { entries } = book(g.cat);
  const missed = [];
  for (let tier = 4; tier >= 3 && missed.length < 5; tier--) {
    const pool = shuffle(entries.filter(e => e.tier === tier && !g.seen.has(e)), Math.random);
    missed.push(...pool.slice(0, 5 - missed.length));
  }
  const m = $('resMissed'); m.innerHTML = '';
  missed.forEach(e => m.appendChild(chip(e)));
  $('againBtn').textContent = g.mode === 'daily' ? 'Free Dive' : 'Dive again';
  show('results');
  view.anchorTarget = 0.5;
}

function shareText(g) {
  const head = g.mode === 'daily' ? `🦐 Shrimple Daily #${dailyNumber()}` : '🦐 Shrimple';
  const squares = g.caught.map(e => TIERS[e.tier].square).join('') + (g.bait <= 0 ? '💀' : '');
  return `${head} — ${g.cat.emoji} ${g.cat.name}\n🪝 ${fmt(g.depth)} · ${g.depth >= BOTTOM_M ? 'Challenger Deep!' : zoneAt(g.depth)}\n${squares}`;
}
async function share() {
  if (!game) return;
  const text = shareText(game);
  try {
    if (window.ShrimpleAndroid) { window.ShrimpleAndroid.share(text); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    $('shareBtn').textContent = 'Copied!';
    setTimeout(() => { $('shareBtn').textContent = 'Share'; }, 1500);
  } catch {}
}

// ---------- Picker ----------
function buildPicker() {
  const grid = $('catGrid');
  grid.innerHTML = '';
  for (const cat of CATEGORIES) {
    const b = document.createElement('button');
    b.className = 'cat-card';
    const best = store.get('best.' + cat.id, 0);
    b.innerHTML = `<span class="e">${cat.emoji}</span><span>${escapeHtml(cat.name)}<small>${best ? 'Best ' + fmt(best) : 'Not fished yet'}</small></span>`;
    b.onclick = () => startGame(cat, 'free');
    grid.appendChild(b);
  }
}

// ---------- Wiring ----------
$('dailyBtn').onclick = () => {
  const done = store.get('daily.' + todayKey(), null);
  const cat = dailyCategory();
  if (done) {
    // replay the saved daily result
    const b = book(cat);
    const caught = done.caught.map(n => b.entries.find(e => e.name === n)).filter(Boolean);
    game = { cat, mode: 'daily', casts: 0, bait: done.bait, depth: done.depth, caught, seen: new Set(caught), over: true };
    view.targetM = done.depth;
    showResults(game, store.get('best.' + cat.id, 0));
    $('resBest').textContent = 'Come back tomorrow for a new Daily Dive!';
    return;
  }
  startGame(cat, 'daily');
};
$('freeBtn').onclick = () => { buildPicker(); show('picker'); };
$('randomCat').onclick = () => startGame(CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)], 'free');
$('helpBtn').onclick = () => $('help').classList.remove('hidden');
$('helpClose').onclick = () => { $('help').classList.add('hidden'); store.set('seenHelp', true); };
$('soundBtn').onclick = () => { soundOn = !soundOn; store.set('sound', soundOn); refreshMenu(); if (soundOn) sfx.plop(); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('menu'));
$('quitBtn').onclick = () => { game = null; show('menu'); };
$('menuBtn').onclick = () => { game = null; show('menu'); };
$('againBtn').onclick = () => {
  if (game && game.mode === 'free') startGame(game.cat, 'free');
  else { buildPicker(); show('picker'); }
};
$('shareBtn').onclick = share;
$('guessForm').addEventListener('submit', (e) => { e.preventDefault(); submitGuess(); $('guess').focus(); });
// keep the keyboard open when tapping Cast
$('castBtn').addEventListener('pointerdown', (e) => e.preventDefault());

$('tierLegend').innerHTML = TIERS.map(t => `<li style="--c:${t.color}"><span>${t.square} ${t.name}</span>+${t.meters} m</li>`).join('');

// Android back button hook: returns true when handled in-page.
window.shrimpleBack = () => {
  if (!$('help').classList.contains('hidden')) { $('help').classList.add('hidden'); return true; }
  if (current !== 'menu') { game = null; show('menu'); return true; }
  return false;
};

show('menu');
if (!store.get('seenHelp', false)) $('help').classList.remove('hidden');
})();
