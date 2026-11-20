import * as THREE from 'three';

// Seeded RNG so textures are stable between loads
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function tex(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, w, h, n, alpha, r, rand, dark = true) {
  for (let i = 0; i < n; i++) {
    const v = dark ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    const s = rand() * r + 0.5;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
}

function blot(ctx, x, y, rad, color, alpha, rand) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
  g.addColorStop(0, color.replace('A', alpha));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.6 + rand() * 0.6), rand() * 3, 0, Math.PI * 2); ctx.fill();
}

const cache = {};

export function brick(seed = 3, tint = [120, 58, 42]) {
  const key = 'brick' + seed + tint;
  if (cache[key]) return cache[key];
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  const [hc, hx] = canvas(W, H);
  const rand = rng(seed);
  x.fillStyle = '#5a554e'; x.fillRect(0, 0, W, H);
  hx.fillStyle = '#000'; hx.fillRect(0, 0, W, H);
  const bw = 128, bh = 48, m = 6;
  for (let row = 0; row < H / bh; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < W / bw + 1; col++) {
      const bx = col * bw + off, by = row * bh;
      const v = 0.7 + rand() * 0.45;
      const r = tint[0] * v + rand() * 20, g = tint[1] * v + rand() * 10, b = tint[2] * v + rand() * 8;
      x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      x.fillRect(bx + m / 2, by + m / 2, bw - m, bh - m);
      const hv = 180 + rand() * 75 | 0;
      hx.fillStyle = `rgb(${hv},${hv},${hv})`;
      hx.fillRect(bx + m / 2, by + m / 2, bw - m, bh - m);
      // chips
      for (let k = 0; k < 4; k++) {
        x.fillStyle = `rgba(40,30,25,${0.2 + rand() * 0.3})`;
        const cx = bx + rand() * bw, cy = by + rand() * bh;
        x.beginPath(); x.arc(cx, cy, rand() * 6 + 1, 0, 7); x.fill();
        hx.fillStyle = 'rgba(0,0,0,.6)'; hx.beginPath(); hx.arc(cx, cy, rand() * 5 + 1, 0, 7); hx.fill();
      }
    }
  }
  speckle(x, W, H, 9000, 0.25, 2.5, rand);
  // grime streaks from top + damp at bottom
  for (let i = 0; i < 40; i++) {
    const sx = rand() * W, len = rand() * H * 0.6;
    const g = x.createLinearGradient(sx, 0, sx, len);
    g.addColorStop(0, 'rgba(15,12,10,.35)'); g.addColorStop(1, 'rgba(15,12,10,0)');
    x.fillStyle = g; x.fillRect(sx, 0, 6 + rand() * 30, len);
  }
  const dg = x.createLinearGradient(0, H * 0.7, 0, H);
  dg.addColorStop(0, 'rgba(20,18,14,0)'); dg.addColorStop(1, 'rgba(20,18,14,.55)');
  x.fillStyle = dg; x.fillRect(0, 0, W, H);
  const res = { map: tex(c), bump: tex(hc, { srgb: false }) };
  cache[key] = res;
  return res;
}

export function woodPlanks(seed = 7, base = [92, 58, 34], plank = 128) {
  const key = 'wood' + seed + base + plank;
  if (cache[key]) return cache[key];
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  const [rc, rx] = canvas(W, H);
  const rand = rng(seed);
  rx.fillStyle = '#888'; rx.fillRect(0, 0, W, H);
  for (let p = 0; p < W / plank; p++) {
    const v = 0.75 + rand() * 0.4;
    let y = 0;
    while (y < H) {
      const len = 300 + rand() * 500;
      const r = base[0] * v, g = base[1] * v, b = base[2] * v;
      x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      x.fillRect(p * plank, y, plank, len);
      // grain lines
      for (let k = 0; k < 26; k++) {
        const gx = p * plank + rand() * plank;
        x.strokeStyle = `rgba(${rand() < .5 ? '30,18,8' : '160,110,70'},${0.08 + rand() * 0.14})`;
        x.lineWidth = 0.5 + rand() * 2;
        x.beginPath(); x.moveTo(gx, y);
        for (let yy = y; yy < y + len; yy += 30) x.lineTo(gx + Math.sin(yy * 0.01 + k) * 3, yy);
        x.stroke();
      }
      // knots
      if (rand() < 0.4) { blot(x, p * plank + rand() * plank, y + rand() * len, 6 + rand() * 10, 'rgba(35,20,10,A)', 0.7, rand); }
      x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(p * plank, y, plank, 2);
      y += len;
    }
    x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(p * plank, 0, 2, H);
    // rough variation: worn paths glossier
    const rv = 90 + rand() * 80 | 0; rx.fillStyle = `rgb(${rv},${rv},${rv})`; rx.fillRect(p * plank, 0, plank, H);
  }
  // spilt beer / wear
  for (let i = 0; i < 30; i++) blot(x, rand() * W, rand() * H, 20 + rand() * 80, 'rgba(20,12,5,A)', 0.25, rand);
  for (let i = 0; i < 40; i++) blot(rx, rand() * W, rand() * H, 20 + rand() * 70, 'rgba(30,30,30,A)', 0.6, rand);
  speckle(x, W, H, 5000, 0.2, 2, rand);
  const res = { map: tex(c), rough: tex(rc, { srgb: false }) };
  cache[key] = res;
  return res;
}

export function concrete(seed = 11) {
  const key = 'conc' + seed;
  if (cache[key]) return cache[key];
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  const rand = rng(seed);
  x.fillStyle = '#4a4744'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) blot(x, rand() * W, rand() * H, 20 + rand() * 120, rand() < 0.5 ? 'rgba(20,18,16,A)' : 'rgba(110,104,96,A)', 0.18, rand);
  speckle(x, W, H, 30000, 0.3, 1.8, rand);
  speckle(x, W, H, 8000, 0.15, 1.5, rand, false);
  // cracks
  x.strokeStyle = 'rgba(10,10,10,.5)';
  for (let i = 0; i < 14; i++) {
    let px = rand() * W, py = rand() * H; x.lineWidth = 0.5 + rand() * 1.5; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 20; k++) { px += (rand() - 0.5) * 50; py += (rand() - 0.5) * 50; x.lineTo(px, py); }
    x.stroke();
  }
  const res = { map: tex(c) };
  cache[key] = res;
  return res;
}

export function ringCanvas(label = 'ASHCROFT', sub = 'BARE KNUCKLE', seed = 5, color = '#c8102e') {
  const W = 1024, H = 1024;
  const [c, x] = canvas(W, H);
  const rand = rng(seed);
  x.fillStyle = '#d9d1bf'; x.fillRect(0, 0, W, H);
  // weave
  for (let i = 0; i < W; i += 3) { x.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.03})`; x.fillRect(i, 0, 1, H); x.fillRect(0, i, W, 1); }
  // logo circle
  x.save(); x.translate(W / 2, H / 2);
  x.strokeStyle = color; x.lineWidth = 14; x.globalAlpha = 0.75;
  x.beginPath(); x.arc(0, 0, 250, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 222, 0, Math.PI * 2); x.stroke();
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '120px Anton, Impact, sans-serif'; x.fillText(label, 0, -10);
  x.font = '44px "Barlow Condensed", sans-serif'; x.fillText(sub, 0, 90);
  x.restore();
  x.globalAlpha = 1;
  // scuffs, sweat, blood
  for (let i = 0; i < 90; i++) blot(x, rand() * W, rand() * H, 10 + rand() * 70, 'rgba(70,55,40,A)', 0.12, rand);
  for (let i = 0; i < 22; i++) {
    const bx = W * 0.2 + rand() * W * 0.6, by = H * 0.2 + rand() * H * 0.6;
    for (let k = 0; k < 6; k++) blot(x, bx + (rand() - .5) * 40, by + (rand() - .5) * 40, 2 + rand() * 9, 'rgba(110,8,12,A)', 0.55, rand);
  }
  speckle(x, W, H, 6000, 0.12, 2, rand);
  return tex(c);
}

export function noiseTex(seed = 2, size = 256) {
  const key = 'noise' + seed + size;
  if (cache[key]) return cache[key];
  const [c, x] = canvas(size, size);
  const img = x.createImageData(size, size);
  const rand = rng(seed);
  for (let i = 0; i < size * size; i++) { const v = 150 + rand() * 80 | 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  const t = tex(c, { srgb: false, repeat: [4, 4] });
  cache[key] = t;
  return t;
}

// Torso bump: pecs + abs. Lathe UVs: u wraps (front at 0.5), v from waist (0) to neck (1).
export function torsoBump() {
  if (cache.torso) return cache.torso;
  const W = 512, H = 512;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
  const cx = W * 0.5;
  // abs: 3 rows x 2
  x.filter = 'blur(6px)';
  for (let r = 0; r < 3; r++) for (let s = -1; s <= 1; s += 2) {
    const yy = H * (0.72 - r * 0.11);
    const g = x.createRadialGradient(cx + s * 22, yy, 2, cx + s * 22, yy, 26);
    g.addColorStop(0, 'rgba(200,200,200,1)'); g.addColorStop(1, 'rgba(128,128,128,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(cx + s * 22, yy, 22, 26, 0, 0, 7); x.fill();
  }
  // linea alba
  x.fillStyle = 'rgba(60,60,60,1)'; x.fillRect(cx - 2, H * 0.4, 4, H * 0.45);
  // pec line
  for (let s = -1; s <= 1; s += 2) {
    const g = x.createRadialGradient(cx + s * 60, H * 0.3, 10, cx + s * 60, H * 0.3, 80);
    g.addColorStop(0, 'rgba(190,190,190,1)'); g.addColorStop(1, 'rgba(128,128,128,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(cx + s * 60, H * 0.3, 80, 52, 0, 0, 7); x.fill();
  }
  x.strokeStyle = 'rgba(50,50,50,1)'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(cx - 130, H * 0.44); x.quadraticCurveTo(cx - 50, H * 0.5, cx, H * 0.4); x.quadraticCurveTo(cx + 50, H * 0.5, cx + 130, H * 0.44); x.stroke();
  // spine groove at back (u=0/1)
  x.fillStyle = 'rgba(70,70,70,1)'; x.fillRect(0, H * 0.1, 5, H * 0.8); x.fillRect(W - 5, H * 0.1, 5, H * 0.8);
  x.filter = 'none';
  const t = tex(c, { srgb: false });
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  cache.torso = t;
  return t;
}

// Per-fighter face damage canvas (multiplied over skin). Sphere UV: front (+z) at u=0.25
export class FaceDamage {
  constructor() {
    [this.c, this.x] = canvas(512, 256);
    this.reset();
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.rand = Math.random;
  }
  reset() { this.x.fillStyle = '#fff'; this.x.fillRect(0, 0, 512, 256); if (this.tex) this.tex.needsUpdate = true; this.level = 0; }
  hit(amount, side = 0) {
    // side: -1 left of face, 1 right, 0 centre
    const x = this.x, r = this.rand;
    this.level += amount;
    const cx = 128 + side * 34 + (r() - 0.5) * 40;
    const cy = 100 + (r() - 0.5) * 50;
    // bruise (purple-red)
    blot(x, cx, cy, 14 + amount * 1.6, 'rgba(150,60,70,A)', Math.min(0.5, 0.08 + amount * 0.02), r);
    if (this.level > 35 && r() < 0.35 + amount * 0.02) {
      // cut + drip
      const bx = 128 + (r() - 0.5) * 70, by = 82 + (r() - 0.5) * 20;
      x.fillStyle = 'rgba(120,0,8,0.9)';
      x.beginPath(); x.ellipse(bx, by, 7 + r() * 6, 2.2, (r() - 0.5) * 0.8, 0, 7); x.fill();
      x.strokeStyle = 'rgba(110,0,8,0.7)';
      x.lineWidth = 2 + r() * 2;
      x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + (r() - 0.5) * 6, by + 25 + r() * 50); x.stroke();
    }
    this.tex.needsUpdate = true;
  }
}

export function poster(lines, colors = ['#e8dcc0', '#111', '#c8102e'], seed = 1) {
  const W = 512, H = 720;
  const [c, x] = canvas(W, H);
  const rand = rng(seed);
  x.fillStyle = colors[0]; x.fillRect(0, 0, W, H);
  x.fillStyle = colors[2]; x.fillRect(0, 0, W, 120);
  x.textAlign = 'center';
  let y = 90;
  lines.forEach((ln, i) => {
    const size = ln.size || 60;
    x.font = `${size}px ${ln.font || 'Anton, Impact, sans-serif'}`;
    x.fillStyle = ln.color || (i === 0 ? colors[0] : colors[1]);
    y = ln.y || (y + size * 1.1);
    x.fillText(ln.t, W / 2, y);
  });
  // aging
  for (let i = 0; i < 40; i++) blot(x, rand() * W, rand() * H, 30 + rand() * 100, 'rgba(90,70,40,A)', 0.16, rand);
  speckle(x, W, H, 4000, 0.18, 2, rand);
  x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, H - 6, W, 6);
  return tex(c);
}

export function textSign(text, { w = 1024, h = 256, bg = '#16301f', fg = '#d9b45a', font = 'Anton, Impact, sans-serif', size = 140, border = true } = {}) {
  const [c, x] = canvas(w, h);
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  if (border) { x.strokeStyle = fg; x.lineWidth = 10; x.strokeRect(14, 14, w - 28, h - 28); }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `${size}px ${font}`;
  x.fillText(text, w / 2, h / 2 + 6);
  return tex(c);
}

export function chalkboard(lines) {
  const W = 512, H = 640;
  const [c, x] = canvas(W, H);
  x.fillStyle = '#1d2220'; x.fillRect(0, 0, W, H);
  const rand = rng(4);
  for (let i = 0; i < 30; i++) blot(x, rand() * W, rand() * H, 40 + rand() * 90, 'rgba(200,200,200,A)', 0.05, rand);
  x.fillStyle = '#e9e5da'; x.textAlign = 'center';
  let y = 80;
  lines.forEach(l => { x.font = `${l.s || 40}px ${l.f || '"Barlow Condensed", sans-serif'}`; x.fillStyle = l.c || '#e9e5da'; x.fillText(l.t, W / 2, y); y += (l.s || 40) * 1.35; });
  x.strokeStyle = '#6b4a2a'; x.lineWidth = 26; x.strokeRect(0, 0, W, H);
  return tex(c);
}

export function dartboard() {
  const S = 512; const [c, x] = canvas(S, S);
  x.translate(S / 2, S / 2);
  x.fillStyle = '#111'; x.beginPath(); x.arc(0, 0, 250, 0, 7); x.fill();
  const rings = [[200, 0], [180, 1], [120, 0], [104, 1], [24, 2], [10, 3]];
  for (let i = 0; i < 20; i++) {
    const a0 = (i / 20) * Math.PI * 2 - Math.PI / 20, a1 = a0 + Math.PI / 10;
    rings.forEach(([r, k], j) => {
      if (k >= 2) return;
      const col = k ? (i % 2 ? '#1c6b34' : '#b3121c') : (i % 2 ? '#e8dcc0' : '#121212');
      x.fillStyle = col; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, r, a0, a1); x.closePath(); x.fill();
    });
  }
  x.fillStyle = '#1c6b34'; x.beginPath(); x.arc(0, 0, 24, 0, 7); x.fill();
  x.fillStyle = '#b3121c'; x.beginPath(); x.arc(0, 0, 10, 0, 7); x.fill();
  return tex(c, { repeat: [1, 1] });
}

export function rainWindow() {
  const W = 256, H = 512; const [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1a2c'); g.addColorStop(1, '#1d2a35');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // street light glow
  const sg = x.createRadialGradient(W * 0.7, H * 0.35, 4, W * 0.7, H * 0.35, 140);
  sg.addColorStop(0, 'rgba(255,170,80,.9)'); sg.addColorStop(1, 'rgba(255,170,80,0)');
  x.fillStyle = sg; x.fillRect(0, 0, W, H);
  const rand = rng(9);
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(200,220,255,${0.1 + rand() * 0.35})`; const px = rand() * W, py = rand() * H; x.beginPath(); x.ellipse(px, py, 1 + rand() * 2, 2 + rand() * 4, 0, 0, 7); x.fill(); }
  const t = tex(c); return t;
}

export function glowSprite() {
  if (cache.glow) return cache.glow;
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  cache.glow = new THREE.CanvasTexture(c);
  return cache.glow;
}

export function fabric(color = '#222', seed = 3) {
  const key = 'fab' + color + seed;
  if (cache[key]) return cache[key];
  const S = 256; const [c, x] = canvas(S, S);
  x.fillStyle = color; x.fillRect(0, 0, S, S);
  const rand = rng(seed);
  for (let i = 0; i < S; i += 2) { x.fillStyle = `rgba(255,255,255,${rand() * 0.04})`; x.fillRect(0, i, S, 1); x.fillStyle = `rgba(0,0,0,${rand() * 0.06})`; x.fillRect(i, 0, 1, S); }
  speckle(x, S, S, 1500, 0.15, 1.5, rand);
  const t = tex(c, { repeat: [3, 3] });
  cache[key] = t; return t;
}
