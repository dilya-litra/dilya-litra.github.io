/* =========================================================
   dilya.litra: игра «Лесная дорога»
   Машина спокойно едет по лесу и останавливается у развилок.
   На указателе вопрос, ученица выбирает табличку, и машина сворачивает туда.
   ========================================================= */
(function(){
'use strict';

/* ---------- настройки ---------- */
const SEG = 200;              // длина сегмента дороги
const DRAW = 170;             // сколько сегментов видно вперёд
const CAM_H = 1000;           // высота камеры
const FOV = 100;
const DEPTH = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const LANES = [-0.66, 0, 0.66];
const FORKS = 10;             // развилок за одну поездку
const CRUISE = 2800, MAX_SPEED = 4000, DECEL = 1400, GAP = 17000;
const HEARTS = 3;

let cv, ctx, W = 0, H = 0, DPR = 1, K = 1, HOR = 0, ROAD_W = 500;
let segs = [], trackLen = 0, S = null, raf = 0, last = 0, running = false;
const SPR = {}; const HERO_SPR = {};
let BG = null;

/* ---------- маленькие помощники ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => -Math.cos(Math.PI * t) / 2 + 0.5;
function rnd(a, b){ return a + Math.random() * (b - a); }
function hash(s){ let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed){ let s = seed || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function mk(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function blob(c, x, y, r, col){ c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function shade(hex, f){
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
function mixCol(a, b, t){
  const p = x => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
  const A = p(a), B = p(b);
  return 'rgb(' + Math.round(lerp(A[0], B[0], t)) + ',' + Math.round(lerp(A[1], B[1], t)) + ',' + Math.round(lerp(A[2], B[2], t)) + ')';
}

/* =========================================================
   РИСУЕМ СПРАЙТЫ (один раз, потом только масштабируем)
   ========================================================= */
function groundShadow(c, cx, cy, rx, ry){
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0, 'rgba(20,30,15,.45)'); g.addColorStop(1, 'rgba(20,30,15,0)');
  c.save(); c.scale(1, ry / rx); c.fillStyle = g; c.beginPath(); c.arc(cx, cy * rx / ry, rx, 0, Math.PI * 2); c.fill(); c.restore();
}

function makePine(seed, tone){
  const r = seeded(seed), w = 360, h = 760, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 14, 150, 22);
  // ствол
  const tg = c.createLinearGradient(cx - 18, 0, cx + 18, 0);
  tg.addColorStop(0, '#3b2416'); tg.addColorStop(.45, '#6b4429'); tg.addColorStop(1, '#2a180e');
  c.fillStyle = tg; c.fillRect(cx - 16, h - 150, 32, 140);
  for (let i = 0; i < 9; i++) { c.strokeStyle = 'rgba(20,10,5,.35)'; c.lineWidth = 2; c.beginPath(); const y = h - 145 + i * 15; c.moveTo(cx - 14, y); c.lineTo(cx + 12, y + r() * 6 - 3); c.stroke(); }
  // ярусы хвои
  const base = tone || ['#1f4a2c', '#2c5e35', '#3f7a43', '#5c9650'];
  const tiers = 8, top = 30, bottom = h - 120;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const y0 = lerp(bottom, top + 70, k), half = lerp(165, 34, k), th = lerp(150, 95, k);
    c.beginPath(); c.moveTo(cx, y0 - th);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const x = cx - half + (2 * half) * (i / n), dip = (i % 2 ? 0 : 18) + r() * 10;
      c.lineTo(x, y0 - (i % 2 ? 6 : 0) + dip * .4);
    }
    c.closePath();
    const g = c.createLinearGradient(cx - half, 0, cx + half, 0);
    g.addColorStop(0, base[2]); g.addColorStop(.35, base[1]); g.addColorStop(1, base[0]);
    c.fillStyle = g; c.fill();
    // светлые иголки слева (солнце)
    c.strokeStyle = base[3]; c.lineWidth = 2.2; c.globalAlpha = .55;
    for (let i = 0; i < 26; i++) {
      const x = cx - half * r() * .95, y = y0 - r() * th * .8;
      if (Math.abs(x - cx) / half > (y0 - y) / th * 1.05 + .05) continue;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 7 - r() * 6, y + 6 + r() * 5); c.stroke();
    }
    c.globalAlpha = 1;
    // тень от следующего яруса
    c.fillStyle = 'rgba(10,25,12,.28)'; c.beginPath(); c.ellipse(cx, y0 - th + 18, half * .45, 10, 0, 0, Math.PI * 2); c.fill();
  }
  // макушка
  c.fillStyle = base[1]; c.beginPath(); c.moveTo(cx, 6); c.lineTo(cx - 22, 70); c.lineTo(cx + 22, 70); c.fill();
  // шишки
  for (let i = 0; i < 5; i++) { c.fillStyle = '#6b4024'; c.beginPath(); c.ellipse(cx + rnd(-60, 60), rnd(220, 520), 5, 9, 0, 0, Math.PI * 2); c.fill(); }
  return c.canvas;
}

function makeBirch(seed){
  const r = seeded(seed), w = 340, h = 760, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 14, 120, 20);
  // ствол
  const lean = (r() - .5) * 24;
  c.save(); c.translate(cx, h - 12);
  const tg = c.createLinearGradient(-14, 0, 14, 0);
  tg.addColorStop(0, '#d9d4c8'); tg.addColorStop(.4, '#fbf8f0'); tg.addColorStop(1, '#a9a395');
  c.fillStyle = tg;
  c.beginPath(); c.moveTo(-15, 0); c.quadraticCurveTo(-10 + lean / 2, -300, -6 + lean, -620); c.lineTo(6 + lean, -620); c.quadraticCurveTo(10 + lean / 2, -300, 15, 0); c.closePath(); c.fill();
  // чёрные чёрточки
  c.fillStyle = '#2b2622';
  for (let i = 0; i < 24; i++) {
    const y = -20 - r() * 560, t = -y / 620, x = lerp(0, lean, t), ww = lerp(14, 6, t);
    c.beginPath(); c.ellipse(x + (r() - .5) * ww, y, ww * (.3 + r() * .5), 2 + r() * 2.5, (r() - .5) * .3, 0, Math.PI * 2); c.fill();
  }
  // ветки
  c.strokeStyle = '#4a3a2c'; c.lineWidth = 3;
  for (let i = 0; i < 7; i++) { const y = -300 - r() * 300, s = r() > .5 ? 1 : -1, x = lerp(0, lean, -y / 620); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + s * 40, y - 30, x + s * (70 + r() * 40), y - 10 - r() * 40); c.stroke(); }
  c.restore();
  // листва: много мелких пятнышек
  const cols = ['#6f9a3a', '#86b04a', '#a3c45c', '#c3d977', '#56802f', '#e0d27a'];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 180; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      const x = cx + lean + Math.cos(a) * d * 130, y = 250 + Math.sin(a) * d * 190 - layer * 10;
      c.globalAlpha = .85;
      blob(c, x, y, 7 + r() * 9, layer === 2 ? cols[2 + (r() * 4 | 0)] : cols[layer === 0 ? 4 : (r() * 3 | 0)]);
    }
  }
  c.globalAlpha = 1;
  return c.canvas;
}

function makeOak(seed){
  const r = seeded(seed), w = 460, h = 700, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 14, 190, 26);
  const tg = c.createLinearGradient(cx - 30, 0, cx + 30, 0);
  tg.addColorStop(0, '#4a2f1d'); tg.addColorStop(.5, '#7a5233'); tg.addColorStop(1, '#341f12');
  c.fillStyle = tg; c.beginPath(); c.moveTo(cx - 34, h - 12); c.quadraticCurveTo(cx - 14, h - 180, cx - 22, h - 320); c.lineTo(cx + 22, h - 320); c.quadraticCurveTo(cx + 14, h - 180, cx + 38, h - 12); c.fill();
  c.strokeStyle = 'rgba(25,12,5,.4)'; c.lineWidth = 2;
  for (let i = 0; i < 8; i++) { c.beginPath(); const x = cx - 20 + i * 5; c.moveTo(x, h - 20); c.quadraticCurveTo(x + 4, h - 160, x - 2, h - 300); c.stroke(); }
  const clusters = [[0, 260, 170], [-110, 300, 110], [110, 300, 110], [-60, 180, 110], [70, 170, 115], [0, 120, 100]];
  const cols = ['#2d5a2a', '#3d7034', '#4f8a3e', '#6aa54b', '#86bb5c'];
  clusters.forEach(([dx, dy, rad]) => {
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
      const x = cx + dx + Math.cos(a) * d, y = dy + Math.sin(a) * d * .8;
      const light = clamp(((cx - x) / 230 + (300 - y) / 300) * .5 + .3 + r() * .25, 0, .99);
      blob(c, x, y, 12 + r() * 14, cols[Math.floor(light * cols.length)]);
    }
  });
  return c.canvas;
}

function makeBush(seed, berries){
  const r = seeded(seed), w = 260, h = 170, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 10, 120, 16);
  const cols = ['#2f5f2c', '#3f7536', '#548c43', '#72a650', '#93c06a'];
  for (let i = 0; i < 160; i++) {
    const a = Math.PI + r() * Math.PI, d = Math.sqrt(r());
    const x = cx + Math.cos(a) * d * 115, y = h - 18 + Math.sin(a) * d * 120;
    const light = clamp((h - y) / 140 * .7 + r() * .3, 0, .99);
    blob(c, x, y, 8 + r() * 11, cols[Math.floor(light * cols.length)]);
  }
  if (berries) for (let i = 0; i < 18; i++) { const x = cx + rnd(-90, 90), y = rnd(50, h - 30); blob(c, x, y, 5, berries); blob(c, x - 1.5, y - 1.5, 1.6, 'rgba(255,255,255,.7)'); }
  return c.canvas;
}

function makeMushroom(seed){
  const r = seeded(seed), w = 120, h = 130, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 8, 46, 9);
  const sg = c.createLinearGradient(cx - 14, 0, cx + 14, 0); sg.addColorStop(0, '#fffaf0'); sg.addColorStop(1, '#d8cbb4');
  c.fillStyle = sg; rr(c, cx - 13, 60, 26, h - 66, 10); c.fill();
  const cg = c.createRadialGradient(cx - 14, 30, 4, cx, 50, 60); cg.addColorStop(0, '#ff7a6b'); cg.addColorStop(.7, '#d0312a'); cg.addColorStop(1, '#8e1c18');
  c.fillStyle = cg; c.beginPath(); c.ellipse(cx, 62, 52, 44, 0, Math.PI, 0); c.fill();
  c.fillStyle = '#f3e7d6'; c.beginPath(); c.ellipse(cx, 62, 52, 7, 0, 0, Math.PI * 2); c.fill();
  [[-26, 44, 6], [4, 30, 7], [26, 46, 5], [-8, 52, 4], [-34, 56, 3.5], [32, 58, 3.5], [14, 44, 3]].forEach(([x, y, s]) => blob(c, cx + x, y, s, '#fff8ee'));
  return c.canvas;
}

function makeFlowers(seed){
  const r = seeded(seed), w = 220, h = 110, c = mk(w, h).getContext('2d');
  const pal = [['#f6c1cc', '#fff'], ['#fffaf2', '#f2c94c'], ['#c9a3e6', '#fff3c4'], ['#f49aa8', '#ffe9a8']];
  for (let i = 0; i < 26; i++) {
    const x = 16 + r() * (w - 32), y = 40 + r() * (h - 50), p = pal[r() * pal.length | 0];
    c.strokeStyle = '#4f7f3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - .5) * 6, h - 4); c.stroke();
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; blob(c, x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.2, p[0]); }
    blob(c, x, y, 3, p[1]);
  }
  for (let i = 0; i < 30; i++) { c.strokeStyle = r() > .5 ? '#5e9443' : '#78ad52'; c.lineWidth = 2; const x = r() * w; c.beginPath(); c.moveTo(x, h - 2); c.quadraticCurveTo(x + 4, h - 20, x + (r() - .5) * 16, h - 30 - r() * 20); c.stroke(); }
  return c.canvas;
}

function makeFern(seed){
  const r = seeded(seed), w = 220, h = 160, c = mk(w, h).getContext('2d'), cx = w / 2;
  for (let f = 0; f < 9; f++) {
    const ang = -Math.PI / 2 + (f - 4) * .3 + (r() - .5) * .15, len = 90 + r() * 50;
    c.save(); c.translate(cx, h - 6); c.rotate(ang + Math.PI / 2);
    c.strokeStyle = '#3e6e2e'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(10, -len / 2, 0, -len); c.stroke();
    for (let i = 1; i < 14; i++) {
      const t = i / 14, y = -len * t, l = (1 - t) * 26 + 4;
      c.fillStyle = i % 2 ? '#5d9a45' : '#4d873a';
      c.beginPath(); c.ellipse(-l / 2 + 2, y, l / 2, 3.5, -.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(l / 2 + 2, y, l / 2, 3.5, .5, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
  return c.canvas;
}

function makeRock(seed){
  const r = seeded(seed), w = 220, h = 140, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 10, 100, 14);
  c.beginPath(); c.moveTo(20, h - 12);
  const pts = 9; for (let i = 0; i <= pts; i++) { const a = Math.PI + i / pts * Math.PI; c.lineTo(cx + Math.cos(a) * (85 + r() * 15), h - 12 + Math.sin(a) * (80 + r() * 25)); }
  c.closePath();
  const g = c.createLinearGradient(30, 20, 180, 130); g.addColorStop(0, '#b7b3a8'); g.addColorStop(.6, '#86837a'); g.addColorStop(1, '#5c5a54');
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  for (let i = 0; i < 60; i++) blob(c, cx - 70 + r() * 110, 30 + r() * 30, 6 + r() * 8, r() > .5 ? '#6f9a44' : '#88b257');
  c.restore();
  return c.canvas;
}

function makeStump(){
  const w = 160, h = 130, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 10, 74, 12);
  const g = c.createLinearGradient(cx - 50, 0, cx + 50, 0); g.addColorStop(0, '#5a3a22'); g.addColorStop(.5, '#8a5f3b'); g.addColorStop(1, '#3f2716');
  c.fillStyle = g; c.beginPath(); c.moveTo(cx - 52, h - 10); c.lineTo(cx - 44, 40); c.lineTo(cx + 44, 40); c.lineTo(cx + 54, h - 10); c.fill();
  c.fillStyle = '#d9b07a'; c.beginPath(); c.ellipse(cx, 40, 44, 13, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#a97a48'; c.lineWidth = 1.5; for (let i = 1; i < 5; i++) { c.beginPath(); c.ellipse(cx, 40, 44 * i / 5, 13 * i / 5, 0, 0, Math.PI * 2); c.stroke(); }
  blob(c, cx - 40, 84, 9, '#7fae53'); blob(c, cx - 30, 92, 7, '#97c068');
  return c.canvas;
}

function makeLantern(){
  const w = 110, h = 420, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 10, 40, 8);
  const g = c.createLinearGradient(cx - 6, 0, cx + 6, 0); g.addColorStop(0, '#2b1a14'); g.addColorStop(.5, '#5a3a2e'); g.addColorStop(1, '#1d110c');
  c.fillStyle = g; c.fillRect(cx - 5, 80, 10, h - 90);
  const glow = c.createRadialGradient(cx, 60, 2, cx, 60, 55); glow.addColorStop(0, 'rgba(255,214,140,.9)'); glow.addColorStop(1, 'rgba(255,190,120,0)');
  c.fillStyle = glow; c.beginPath(); c.arc(cx, 60, 55, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3a2620'; rr(c, cx - 18, 36, 36, 46, 6); c.fill();
  c.fillStyle = '#ffe2a6'; rr(c, cx - 13, 41, 26, 36, 4); c.fill();
  c.fillStyle = '#3a2620'; c.beginPath(); c.moveTo(cx - 22, 38); c.lineTo(cx, 20); c.lineTo(cx + 22, 38); c.fill();
  // бантик
  c.fillStyle = '#e48fa0'; c.beginPath(); c.ellipse(cx - 9, 92, 9, 5, -.3, 0, Math.PI * 2); c.ellipse(cx + 9, 92, 9, 5, .3, 0, Math.PI * 2); c.fill(); blob(c, cx, 92, 3.5, '#c76b80');
  return c.canvas;
}

function makeSignpost(){
  const w = 300, h = 520, c = mk(w, h).getContext('2d'), cx = w / 2;
  groundShadow(c, cx, h - 12, 70, 12);
  const pg = c.createLinearGradient(cx - 12, 0, cx + 12, 0); pg.addColorStop(0, '#5a3a22'); pg.addColorStop(.5, '#9a6a42'); pg.addColorStop(1, '#4a2e1a');
  c.fillStyle = pg; c.fillRect(cx - 11, 60, 22, h - 72);
  const board = (y, dir, tilt) => {
    c.save(); c.translate(cx, y); c.rotate(tilt);
    const bw = 220, bh = 54, x0 = dir < 0 ? -bw + 40 : -40;
    const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2); g.addColorStop(0, '#c9935c'); g.addColorStop(1, '#8e5c33');
    c.fillStyle = g; c.beginPath();
    if (dir < 0) { c.moveTo(x0, 0); c.lineTo(x0 + 30, -bh / 2); c.lineTo(x0 + bw, -bh / 2); c.lineTo(x0 + bw, bh / 2); c.lineTo(x0 + 30, bh / 2); }
    else if (dir > 0) { c.moveTo(x0, -bh / 2); c.lineTo(x0 + bw - 30, -bh / 2); c.lineTo(x0 + bw, 0); c.lineTo(x0 + bw - 30, bh / 2); c.lineTo(x0, bh / 2); }
    else { c.moveTo(-bw / 2, -bh / 2); c.lineTo(bw / 2, -bh / 2); c.lineTo(bw / 2, bh / 2); c.lineTo(-bw / 2, bh / 2); }
    c.closePath(); c.fill(); c.strokeStyle = '#5e3a1f'; c.lineWidth = 4; c.stroke();
    c.strokeStyle = 'rgba(90,55,25,.35)'; c.lineWidth = 2; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(dir < 0 ? x0 + 34 : (dir > 0 ? x0 + 6 : -bw / 2 + 6), i * 13); c.lineTo(dir > 0 ? x0 + bw - 36 : (dir < 0 ? x0 + bw - 6 : bw / 2 - 6), i * 13 + 2); c.stroke(); }
    blob(c, 0, 0, 5, '#4a2e1a');
    c.restore();
  };
  board(110, -1, -.06); board(185, 0, .02); board(260, 1, .05);
  c.fillStyle = '#e48fa0'; c.beginPath(); c.ellipse(cx - 14, 330, 15, 8, -.3, 0, Math.PI * 2); c.ellipse(cx + 14, 330, 15, 8, .3, 0, Math.PI * 2); c.fill(); blob(c, cx, 330, 6, '#c76b80');
  c.fillStyle = '#6aa54b'; for (let i = 0; i < 14; i++) blob(c, cx + rnd(-30, 30), h - 20 - rnd(0, 26), 7 + rnd(0, 6), i % 2 ? '#6aa54b' : '#86bb5c');
  return c.canvas;
}

function makeOrb(){
  const s = 180, c = mk(s, s).getContext('2d'), m = s / 2;
  const glow = c.createRadialGradient(m, m, 10, m, m, m); glow.addColorStop(0, 'rgba(255,236,170,.95)'); glow.addColorStop(.45, 'rgba(255,196,150,.45)'); glow.addColorStop(1, 'rgba(255,180,190,0)');
  c.fillStyle = glow; c.beginPath(); c.arc(m, m, m, 0, Math.PI * 2); c.fill();
  const g = c.createRadialGradient(m - 14, m - 16, 4, m, m, 44); g.addColorStop(0, '#fff7d6'); g.addColorStop(.5, '#f5c15a'); g.addColorStop(1, '#c98425');
  c.fillStyle = g; c.beginPath(); c.arc(m, m, 42, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#fff3c9'; c.lineWidth = 4; c.stroke();
  c.fillStyle = '#7a3b16'; c.font = '800 34px Manrope, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('XP', m, m + 2);
  c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.ellipse(m - 16, m - 20, 12, 6, -.6, 0, Math.PI * 2); c.fill();
  return c.canvas;
}

function makeCar(){
  const w = 560, h = 360, c = mk(w, h).getContext('2d'), cx = w / 2;
  // тень
  groundShadow(c, cx, h - 22, 260, 34);
  // колёса
  const tire = x => { const g = c.createLinearGradient(x - 40, 0, x + 40, 0); g.addColorStop(0, '#0f0d0d'); g.addColorStop(.5, '#3a3434'); g.addColorStop(1, '#0f0d0d'); c.fillStyle = g; rr(c, x - 42, h - 108, 84, 86, 20); c.fill(); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(x - 34 + i * 13, h - 100); c.lineTo(x - 34 + i * 13, h - 30); c.stroke(); } };
  tire(cx - 170); tire(cx + 170);
  // нижний корпус
  const body = c.createLinearGradient(0, 120, 0, 300);
  body.addColorStop(0, '#f6c3cc'); body.addColorStop(.45, '#e48a9c'); body.addColorStop(1, '#a9455c');
  c.fillStyle = body;
  c.beginPath(); c.moveTo(cx - 250, 270); c.quadraticCurveTo(cx - 262, 190, cx - 222, 160); c.lineTo(cx + 222, 160); c.quadraticCurveTo(cx + 262, 190, cx + 250, 270); c.quadraticCurveTo(cx + 250, 296, cx + 220, 298); c.lineTo(cx - 220, 298); c.quadraticCurveTo(cx - 250, 296, cx - 250, 270); c.fill();
  // кабина
  const cab = c.createLinearGradient(0, 30, 0, 170); cab.addColorStop(0, '#fbe3e6'); cab.addColorStop(1, '#e9a3b1');
  c.fillStyle = cab; c.beginPath(); c.moveTo(cx - 200, 166); c.quadraticCurveTo(cx - 190, 52, cx - 120, 44); c.lineTo(cx + 120, 44); c.quadraticCurveTo(cx + 190, 52, cx + 200, 166); c.fill();
  // заднее стекло
  const gl = c.createLinearGradient(0, 60, 0, 160); gl.addColorStop(0, '#9fc2d8'); gl.addColorStop(1, '#3f5f78');
  c.fillStyle = gl; c.beginPath(); c.moveTo(cx - 170, 156); c.quadraticCurveTo(cx - 162, 72, cx - 110, 64); c.lineTo(cx + 110, 64); c.quadraticCurveTo(cx + 162, 72, cx + 170, 156); c.closePath(); c.fill();
  // водитель (Диля с пучком)
  c.save(); c.clip();
  c.fillStyle = '#2b1712'; c.beginPath(); c.arc(cx - 52, 130, 34, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(cx - 52, 86, 17, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f2a7b5'; c.beginPath(); c.ellipse(cx - 74, 92, 10, 6, -.5, 0, Math.PI * 2); c.ellipse(cx - 58, 84, 10, 6, .4, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3b2620'; rr(c, cx - 110, 150, 120, 20, 8); c.fill();
  // подголовник пассажира
  c.fillStyle = '#5a3a32'; rr(c, cx + 34, 112, 50, 46, 14); c.fill();
  // ароматизатор-сердечко
  c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx + 6, 64); c.lineTo(cx + 6, 92); c.stroke();
  c.fillStyle = '#ff6f91'; c.beginPath(); c.moveTo(cx + 6, 112); c.bezierCurveTo(cx - 14, 98, cx - 6, 84, cx + 6, 94); c.bezierCurveTo(cx + 18, 84, cx + 26, 98, cx + 6, 112); c.fill();
  // блик
  c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.moveTo(cx - 150, 156); c.lineTo(cx - 70, 64); c.lineTo(cx - 30, 64); c.lineTo(cx - 110, 156); c.fill();
  c.fillStyle = 'rgba(255,255,255,.14)'; c.beginPath(); c.moveTo(cx - 90, 156); c.lineTo(cx - 10, 64); c.lineTo(cx + 6, 64); c.lineTo(cx - 74, 156); c.fill();
  c.restore();
  c.strokeStyle = '#f9d9de'; c.lineWidth = 5; c.beginPath(); c.moveTo(cx - 170, 156); c.quadraticCurveTo(cx - 162, 72, cx - 110, 64); c.lineTo(cx + 110, 64); c.quadraticCurveTo(cx + 162, 72, cx + 170, 156); c.closePath(); c.stroke();
  // бантик на крыше
  c.fillStyle = '#c94d6b'; c.beginPath(); c.moveTo(cx, 40); c.bezierCurveTo(cx - 40, 10, cx - 56, 50, cx, 42); c.bezierCurveTo(cx + 56, 50, cx + 40, 10, cx, 40); c.fill();
  c.fillStyle = '#e8738f'; c.beginPath(); c.moveTo(cx, 40); c.bezierCurveTo(cx - 30, 20, cx - 40, 44, cx, 41); c.fill(); c.beginPath(); c.moveTo(cx, 40); c.bezierCurveTo(cx + 30, 20, cx + 40, 44, cx, 41); c.fill();
  blob(c, cx, 40, 7, '#a83a57');
  // линия багажника и блик корпуса
  c.strokeStyle = 'rgba(120,30,50,.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - 200, 186); c.quadraticCurveTo(cx, 176, cx + 200, 186); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(cx - 120, 176, 70, 7, 0, 0, Math.PI * 2); c.fill();
  // фары
  const light = x => { const g = c.createLinearGradient(0, 196, 0, 236); g.addColorStop(0, '#ff8a8a'); g.addColorStop(1, '#b3161f'); c.fillStyle = g; rr(c, x - 36, 194, 72, 40, 14); c.fill(); c.fillStyle = 'rgba(255,255,255,.45)'; rr(c, x - 28, 199, 30, 9, 4); c.fill(); c.strokeStyle = '#7d1e2c'; c.lineWidth = 3; rr(c, x - 36, 194, 72, 40, 14); c.stroke(); };
  light(cx - 192); light(cx + 192);
  // номер
  c.fillStyle = '#fbf8f4'; rr(c, cx - 82, 200, 164, 46, 8); c.fill(); c.strokeStyle = '#6b2633'; c.lineWidth = 3; c.stroke();
  c.fillStyle = '#6b2633'; c.font = '700 26px "Marck Script", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('dilya.litra', cx, 224);
  // хромированный бампер
  const ch = c.createLinearGradient(0, 258, 0, 286); ch.addColorStop(0, '#ffffff'); ch.addColorStop(.4, '#c9c3c3'); ch.addColorStop(1, '#6f6767');
  c.fillStyle = ch; rr(c, cx - 246, 258, 492, 26, 13); c.fill();
  // выхлопная труба
  c.fillStyle = '#5b5454'; rr(c, cx + 120, 286, 40, 14, 6); c.fill(); c.fillStyle = '#211d1d'; c.beginPath(); c.ellipse(cx + 158, 293, 5, 6, 0, 0, Math.PI * 2); c.fill();
  // сердечки-наклейки
  const heart = (x, y, s, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x, y + s * .9); c.bezierCurveTo(x - s * 1.2, y, x - s * .6, y - s * .8, x, y - s * .2); c.bezierCurveTo(x + s * .6, y - s * .8, x + s * 1.2, y, x, y + s * .9); c.fill(); };
  heart(cx - 226, 176, 10, '#fff'); heart(cx + 228, 178, 8, '#fff'); heart(cx + 210, 170, 6, '#ffd3dc');
  return c.canvas;
}

/* герои: милые бумажные куколки, у каждого свой наряд */
const FEM_W = /(дочка|дочь|мать|матушка|старуха|бабушка|княжна|княгиня|царица|царевна|барыня|графиня|вдова|девочка|девушка|жена|сестра|невеста|няня|королева|баба|тётка|тетка|красавица|госпожа|мадам|леди|принцесса|фея|ведьма|хозяйка|кухарка|служанка|горничная|помещица)/i;
const MALE_FIRST = /^(Петрушка|Ванька|Гришка|Яшка|Мишка|Сашка|Федька|Митька|Тимошка|Прошка|Илья|Добрыня|Никита|Фома|Кузьма|Савва|Лука|Петруша|Ванюша|Ваня|Миша|Саша|Гриша|Федя|Петя|Коля|Вася|Митя|Сеня|Костя|Лёня|Паша|Ерёма|Хома|Емеля|Мазай|Данила|Гаврила|Михаила|Кирила|Фока|Сеня|Алёша|Альоша|Яша|Ефимушка|Пётра|Вожатый|Дед|Старик|Капитан|Отец|Батя|Папа|Дядя|Лёва|Вова|Дима|Тоня$)/;
function isFem(name){
  if (FEM_W.test(name)) return true;
  const first = name.split(/[\s,]+/)[0];
  if (MALE_FIRST.test(first)) return /Тоня/.test(first);
  return /[ая]$/i.test(first) && !/ий$|ой$/.test(first);
}
const COATS = ['#7b2d3c', '#355c7d', '#5d7b4a', '#8a5a3c', '#6c4a7d', '#2f4a5a', '#a05a6a', '#4a5a7a', '#7a6a3a', '#3e5e52'];
const DRESS = ['#d98aa0', '#9cb6d8', '#c3a3d9', '#e8b48a', '#a7c99a', '#e6a3a3', '#f0c7a0', '#b59cc8'];
const HAIR = ['#2b1a14', '#4a2e1e', '#7a4a28', '#b07a3e', '#d9b36a', '#8c8c8c', '#1d1d24', '#5a3326'];
const SKIN = ['#f6d5bf', '#efc4a7', '#e3b08c', '#f9dccb'];
function makeHero(name){
  if (HERO_SPR[name]) return HERO_SPR[name];
  const r = seeded(hash(name) % 2147483646 + 1), w = 240, h = 420, c = mk(w, h).getContext('2d'), cx = w / 2;
  const fem = isFem(name), old = /стар|дед|бабушка|старуха|отец|мать|генерал|князь|граф/i.test(name);
  const skin = SKIN[r() * SKIN.length | 0], hair = old ? (r() > .5 ? '#c9c4bc' : '#9a948c') : HAIR[r() * HAIR.length | 0];
  const coat = fem ? DRESS[r() * DRESS.length | 0] : COATS[r() * COATS.length | 0];
  groundShadow(c, cx, h - 12, 82, 14);
  if (fem) {
    // платье
    const g = c.createLinearGradient(cx - 80, 0, cx + 80, 0); g.addColorStop(0, shade(coat, .15)); g.addColorStop(.5, coat); g.addColorStop(1, shade(coat, -.3));
    c.fillStyle = g; c.beginPath(); c.moveTo(cx - 38, 200); c.quadraticCurveTo(cx - 90, 330, cx - 84, h - 22); c.quadraticCurveTo(cx, h - 6, cx + 84, h - 22); c.quadraticCurveTo(cx + 90, 330, cx + 38, 200); c.fill();
    c.strokeStyle = shade(coat, -.35); c.lineWidth = 2; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(cx + i * 12, 220); c.quadraticCurveTo(cx + i * 26, 320, cx + i * 32, h - 20); c.stroke(); }
    c.fillStyle = '#fbf3ea'; c.beginPath(); c.moveTo(cx - 84, h - 22); c.quadraticCurveTo(cx, h - 6, cx + 84, h - 22); c.lineTo(cx + 84, h - 32); c.quadraticCurveTo(cx, h - 16, cx - 84, h - 32); c.fill();
  } else {
    // ноги и сапоги
    c.fillStyle = '#2f2a2a'; rr(c, cx - 34, 320, 28, 80, 8); c.fill(); rr(c, cx + 6, 320, 28, 80, 8); c.fill();
    c.fillStyle = '#1a1414'; rr(c, cx - 38, 384, 36, 22, 8); c.fill(); rr(c, cx + 2, 384, 36, 22, 8); c.fill();
    // кафтан/сюртук
    const g = c.createLinearGradient(cx - 70, 0, cx + 70, 0); g.addColorStop(0, shade(coat, .2)); g.addColorStop(.5, coat); g.addColorStop(1, shade(coat, -.35));
    c.fillStyle = g; c.beginPath(); c.moveTo(cx - 44, 196); c.lineTo(cx - 66, 350); c.lineTo(cx + 66, 350); c.lineTo(cx + 44, 196); c.fill();
    c.strokeStyle = shade(coat, -.45); c.lineWidth = 3; c.beginPath(); c.moveTo(cx, 206); c.lineTo(cx, 350); c.stroke();
    for (let i = 0; i < 4; i++) blob(c, cx + 8, 226 + i * 30, 4, '#e7c66e');
    c.fillStyle = shade(coat, -.5); c.fillRect(cx - 60, 280, 120, 9);
  }
  // руки
  c.fillStyle = fem ? shade(coat, -.1) : shade(coat, -.15);
  c.save(); c.translate(cx - 46, 206); c.rotate(.25); rr(c, -13, 0, 26, 92, 12); c.fill(); c.restore();
  c.save(); c.translate(cx + 46, 206); c.rotate(-.25); rr(c, -13, 0, 26, 92, 12); c.fill(); c.restore();
  blob(c, cx - 68, 296, 12, skin); blob(c, cx + 68, 296, 12, skin);
  // шея и воротник
  c.fillStyle = skin; c.fillRect(cx - 12, 176, 24, 30);
  c.fillStyle = '#fbf3ea'; c.beginPath(); c.moveTo(cx - 30, 196); c.lineTo(cx, 222); c.lineTo(cx + 30, 196); c.lineTo(cx + 18, 190); c.lineTo(cx, 206); c.lineTo(cx - 18, 190); c.fill();
  // волосы сзади
  if (fem) { c.fillStyle = hair; c.beginPath(); c.ellipse(cx, 150, 64, 82, 0, 0, Math.PI * 2); c.fill(); }
  // голова
  const hg = c.createRadialGradient(cx - 14, 104, 8, cx, 120, 62); hg.addColorStop(0, shade(skin, .25)); hg.addColorStop(1, skin);
  c.fillStyle = hg; c.beginPath(); c.ellipse(cx, 120, 54, 58, 0, 0, Math.PI * 2); c.fill();
  // волосы спереди
  c.fillStyle = hair; c.beginPath(); c.ellipse(cx, 84, 56, 34, 0, Math.PI, 0); c.fill();
  c.beginPath(); c.ellipse(cx - 30, 92, 24, 18, -.5, 0, Math.PI * 2); c.ellipse(cx + 32, 94, 22, 16, .5, 0, Math.PI * 2); c.fill();
  // лицо
  c.fillStyle = '#2b1a14';
  c.beginPath(); c.ellipse(cx - 20, 124, 6.5, 8.5, 0, 0, Math.PI * 2); c.ellipse(cx + 20, 124, 6.5, 8.5, 0, 0, Math.PI * 2); c.fill();
  blob(c, cx - 18, 121, 2.4, '#fff'); blob(c, cx + 22, 121, 2.4, '#fff');
  c.fillStyle = 'rgba(240,120,140,.45)'; c.beginPath(); c.ellipse(cx - 34, 142, 10, 6, 0, 0, Math.PI * 2); c.ellipse(cx + 34, 142, 10, 6, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#7a3b2e'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.arc(cx, 142, 8, .2, Math.PI - .2); c.stroke();
  if (!fem && (old || r() > .6)) { c.fillStyle = hair; c.beginPath(); c.moveTo(cx - 30, 148); c.quadraticCurveTo(cx, old ? 210 : 176, cx + 30, 148); c.quadraticCurveTo(cx, 160, cx - 30, 148); c.fill(); }
  // головной убор
  const hat = r();
  if (fem) {
    if (hat < .35) { // кокошник
      c.fillStyle = '#c94d6b'; c.beginPath(); c.moveTo(cx - 56, 86); c.quadraticCurveTo(cx, 6, cx + 56, 86); c.quadraticCurveTo(cx, 66, cx - 56, 86); c.fill();
      for (let i = -3; i <= 3; i++) blob(c, cx + i * 12, 60 - Math.cos(i / 3) * 10, 3.5, '#f7e2a6');
    } else if (hat < .7) { // бант
      c.fillStyle = '#f08aa3'; c.beginPath(); c.moveTo(cx + 30, 70); c.bezierCurveTo(cx + 4, 40, cx - 2, 86, cx + 30, 72); c.bezierCurveTo(cx + 60, 86, cx + 58, 40, cx + 30, 70); c.fill(); blob(c, cx + 30, 71, 6, '#d6577a');
    } else { // платочек
      c.fillStyle = shade(coat, -.15); c.beginPath(); c.moveTo(cx - 60, 110); c.quadraticCurveTo(cx, 20, cx + 60, 110); c.quadraticCurveTo(cx, 76, cx - 60, 110); c.fill();
      for (let i = 0; i < 6; i++) blob(c, cx - 30 + i * 12, 70 + Math.abs(i - 2.5) * 5, 3, '#fff6ea');
    }
  } else {
    if (hat < .3) { // цилиндр
      c.fillStyle = '#1f1a1a'; c.fillRect(cx - 34, 16, 68, 58); c.beginPath(); c.ellipse(cx, 74, 58, 10, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#7b2d3c'; c.fillRect(cx - 34, 58, 68, 9);
    } else if (hat < .55) { // картуз
      c.fillStyle = shade(coat, -.3); c.beginPath(); c.ellipse(cx, 72, 54, 24, 0, Math.PI, 0); c.fill(); c.fillStyle = '#1f1a1a'; c.beginPath(); c.ellipse(cx + 14, 74, 40, 8, 0, 0, Math.PI); c.fill();
    } else if (hat < .7) { // шлем богатыря / шапка
      c.fillStyle = '#b9a88a'; c.beginPath(); c.moveTo(cx - 52, 82); c.quadraticCurveTo(cx - 40, 30, cx, 12); c.quadraticCurveTo(cx + 40, 30, cx + 52, 82); c.fill(); c.fillStyle = '#8f7f62'; c.fillRect(cx - 54, 76, 108, 10);
    }
  }
  HERO_SPR[name] = c.canvas;
  return c.canvas;
}

/* фон: небо, горы, дальний лес */
function makeBG(){
  const far = mk(2048, 360), f = far.getContext('2d');
  const r = seeded(7);
  // далёкие холмы
  const hill = (base, amp, col, step) => { f.fillStyle = col; f.beginPath(); f.moveTo(0, 360); for (let x = 0; x <= 2048; x += step) f.lineTo(x, base - Math.sin(x / 2048 * Math.PI * 4) * amp - Math.sin(x / 2048 * Math.PI * 10 + 1) * amp * .4); f.lineTo(2048, 360); f.fill(); };
  hill(170, 40, '#b8aecb', 16); hill(210, 30, '#9fa9b8', 16);
  const near = mk(2048, 360), n = near.getContext('2d');
  // дальний лес: силуэты ёлок
  const row = (base, hmin, hmax, col, gap) => {
    n.fillStyle = col; n.fillRect(0, base, 2048, 360 - base);
    for (let x = -20; x < 2068; x += gap * (0.6 + r() * .8)) {
      const hh = hmin + r() * (hmax - hmin), ww = hh * .36;
      n.beginPath(); n.moveTo(x, base - hh); for (let k = 1; k <= 5; k++) { const yy = base - hh + hh * k / 5; n.lineTo(x - ww * k / 5, yy); n.lineTo(x - ww * k / 5 * .55, yy - 4); } n.lineTo(x, base); for (let k = 5; k >= 1; k--) { const yy = base - hh + hh * k / 5; n.lineTo(x + ww * k / 5 * .55, yy - 4); n.lineTo(x + ww * k / 5, yy); } n.closePath(); n.fill();
    }
    // аккуратно склеиваем края
  };
  row(250, 70, 140, '#6f8a73', 26); row(290, 90, 170, '#4b6b52', 22); row(330, 110, 200, '#33503c', 20);
  BG = { far, near };
}

function buildSprites(){
  if (SPR.ready) return;
  SPR.pines = [makePine(11), makePine(23, ['#1b4030', '#275a3e', '#3a7550', '#5a9566']), makePine(37), makePine(41, ['#24482a', '#335f33', '#4a7d40', '#6c9d55'])];
  SPR.birches = [makeBirch(5), makeBirch(9), makeBirch(17)];
  SPR.oaks = [makeOak(3), makeOak(13)];
  SPR.bushes = [makeBush(2), makeBush(8, '#c2334b'), makeBush(19), makeBush(29, '#6a4ab0')];
  SPR.small = [makeMushroom(1), makeMushroom(6), makeFlowers(4), makeFlowers(12), makeFlowers(31), makeFern(3), makeFern(14), makeRock(5), makeStump()];
  SPR.lantern = makeLantern();
  SPR.orb = makeOrb();
  SPR.sign = makeSignpost();
  SPR.car = makeCar();
  makeBG();
  SPR.ready = true;
}

/* =========================================================
   ДОРОГА
   ========================================================= */
function lastY(){ return segs.length ? segs[segs.length - 1].p2.world.y : 0; }
function addSeg(curve, y){
  const n = segs.length;
  segs.push({ index: n, p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} }, p2: { world: { y, z: (n + 1) * SEG }, camera: {}, screen: {} }, curve, sprites: [], items: [], dark: Math.floor(n / 3) % 2 });
}
function addRoad(enter, hold, leave, curve, hill){
  const sy = lastY(), ey = sy + hill * SEG, total = enter + hold + leave;
  for (let i = 0; i < enter; i++) addSeg(lerp(0, curve, easeIO(i / enter)), lerp(sy, ey, easeIO(i / total)));
  for (let i = 0; i < hold; i++) addSeg(curve, lerp(sy, ey, easeIO((enter + i) / total)));
  for (let i = 0; i < leave; i++) addSeg(lerp(curve, 0, easeIO(i / leave)), lerp(sy, ey, easeIO((enter + hold + i) / total)));
}
function buildRoad(){
  segs = [];
  const L = { s: 25, m: 50, l: 100 };
  addRoad(L.m, L.m, L.m, 0, 0);
  addRoad(L.m, L.m, L.m, 2.5, 20);
  addRoad(L.m, L.l, L.m, 0, -10);
  addRoad(L.m, L.m, L.m, -3, 30);
  addRoad(L.s, L.m, L.s, 0, -20);
  addRoad(L.m, L.m, L.m, 3.5, -25);
  addRoad(L.l, L.m, L.l, -2, 20);
  addRoad(L.m, L.l, L.m, 1.5, 15);
  addRoad(L.m, L.m, L.m, -4, -20);
  addRoad(L.m, L.m, L.m, 0, 0);
  addRoad(L.m, L.l, L.m, 2.5, -10);
  // плавно возвращаемся к нулевой высоте
  addRoad(L.l, 0, L.l, 0, -lastY() / SEG);
  trackLen = segs.length * SEG;
  // деревья и всякие лесные мелочи
  const r = seeded(99);
  segs.forEach((s, i) => {
    if (i % 2 === 0) [-1, 1].forEach(side => {
      if (r() < .78) { const t = r(), spr = t < .5 ? pick(SPR.pines) : t < .75 ? pick(SPR.birches) : pick(SPR.oaks); s.sprites.push({ img: spr, x: side * (1.55 + r() * 2.6), h: spr === SPR.oaks[0] || spr === SPR.oaks[1] ? 4.2 + r() * 1.4 : 5 + r() * 2.2 }); }
      if (r() < .35) s.sprites.push({ img: pick(SPR.pines), x: side * (4.4 + r() * 3), h: 6 + r() * 2 });
    });
    if (r() < .5) { const side = r() < .5 ? -1 : 1; s.sprites.push({ img: pick(SPR.bushes), x: side * (1.25 + r() * .6), h: .55 + r() * .3 }); }
    if (r() < .5) { const side = r() < .5 ? -1 : 1; const sm = pick(SPR.small); s.sprites.push({ img: sm, x: side * (1.12 + r() * .9), h: sm.height < 120 ? .22 : .28 + r() * .12 }); }
    if (i % 60 === 30) s.sprites.push({ img: SPR.lantern, x: (i % 120 ? -1 : 1) * 1.18, h: 1.5, glow: true });
  });
}
function findSeg(z){ return segs[Math.floor(z / SEG) % segs.length]; }

/* =========================================================
   ГЕРОИ ДЛЯ ИГРЫ
   ========================================================= */
let POOL = null;
function cleanName(n){ return n.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); }
function buildPool(){
  if (POOL) return POOL;
  const all = (typeof HEROES !== 'undefined' && HEROES) || [];
  const cnt = {};
  all.forEach(h => { const n = cleanName(h[1]); cnt[n] = (cnt[n] || new Set()).add(h[0]); });
  const list = all.map(h => ({ w: h[0], name: cleanName(h[1]), desc: h[2] || '' }))
    .filter(h => h.name.length >= 3 && h.name.length <= 32 && cnt[h.name].size === 1 && !/\sи\s|^(Гости|Толпа|Французы|Мужики|Народ|Люди|Солдаты|Крестьяне|Дети)/.test(h.name));
  const byW = {};
  list.forEach(h => (byW[h.w] = byW[h.w] || []).push(h));
  POOL = { list, byW, works: Object.keys(byW).filter(w => byW[w].length >= 4 && byId(w)) };
  return POOL;
}
function workTitle(id){ const L = byId(id); return L ? '«' + L.title.replace(/[«»]/g, '') + '»' : ''; }
function chooseWorks(){
  const P = buildPool();
  const started = P.works.filter(w => lessonStarted(w));
  const upto = P.works.filter(w => { const L = byId(w); return L && L.week && L.week <= curWeek(); });
  const base = started.length >= 3 ? started : upto.length >= 3 ? upto : P.works;
  return mix(base);
}

/* =========================================================
   ИГРОВОЕ СОСТОЯНИЕ
   ========================================================= */
function newState(work){
  const order = chooseWorks();
  if (work) { const i = order.indexOf(work); if (i >= 0) order.splice(i, 1); order.unshift(work); }
  return {
    pos: 0, dist: 0, speed: 0, target: CRUISE, x: 0, tilt: 0, idle: false,
    hearts: HEARTS, score: 0, xp: 0, right: 0, works: order, work: order[0],
    qs: [], qi: 0, res: [], mode: 'drive', forkAt: 0, signSeg: null, bend: null,
    nextZ: SEG * 20, shake: 0, flash: 0, flashCol: '', banner: null,
    pops: [], parts: [], mistakes: [], skyX: 0, time: 0, paused: false, over: false, puff: 0, brake: 0, endAt: 0
  };
}
function short(t){ return '«' + t.replace(/[«»]/g, '') + '»'; }
function makeQuestions(w){
  const P = buildPool(), mine = mix(P.byW[w]), names = new Set(mine.map(h => h.name));
  const others = mix(P.list.filter(h => h.w !== w && !names.has(h.name)));
  const otherWorks = mix(P.works.filter(x => x !== w));
  const withDesc = mine.filter(h => h.desc && h.desc.length > 25);
  let types = mix(['who', 'who', 'who', 'who', 'from', 'from', 'from', 'desc', 'desc', 'desc']);
  if (withDesc.length < 3 || mine.length < 3) types = types.map(t => t === 'desc' ? 'who' : t);
  const used = new Set(); let oi = 0, wi = 0;
  const nextMine = pool => { const h = pool.find(x => !used.has(x.name)) || pick(pool); used.add(h.name); return h; };
  const qs = types.map(t => {
    if (t === 'who') {
      const h = nextMine(mine), wrong = [others[oi++ % others.length], others[oi++ % others.length]];
      const opts = mix([{ t: h.name, ok: true }].concat(wrong.map(o => ({ t: o.name, ok: false, note: o.name + ' это герой ' + workTitle(o.w) }))));
      return { kind: 'Развилка', text: 'Кто из этих героев есть в произведении ' + workTitle(w) + '?', opts, right: h.name };
    }
    if (t === 'from') {
      const h = nextMine(mine), ws = [otherWorks[wi++ % otherWorks.length], otherWorks[wi++ % otherWorks.length]];
      const lab = x => short(byId(x).title) + ' · ' + byId(x).author;
      const opts = mix([{ t: lab(w), ok: true }].concat(ws.map(x => ({ t: lab(x), ok: false }))));
      return { kind: 'Развилка', text: 'Из какого произведения этот герой?', hero: h.name, opts, right: workTitle(w), note: h.name + ' это герой ' + workTitle(w) };
    }
    const h = nextMine(withDesc), rest = mix(mine.filter(x => x.name !== h.name)).slice(0, 2);
    const opts = mix([{ t: h.name, ok: true }].concat(rest.map(o => ({ t: o.name, ok: false }))));
    const txt = typeof maskName === 'function' ? maskName(h.name, h.desc) : h.desc;
    return { kind: 'Развилка', text: 'Кто это?', desc: txt, opts, right: h.name, note: 'Это ' + h.name };
  });
  return qs;
}
function placeItem(z, item){ const s = findSeg(z); s.items.push(item); }
function spawnOrbs(z){ const n = 3 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) placeItem(z + i * SEG * 3, { kind: 'xp', lane: 1, taken: false }); }
function planFork(from){
  S.forkAt = from;
  const seg = findSeg((S.forkAt + CAM_H * DEPTH + SEG * 9) % trackLen);
  const spr = { img: SPR.sign, x: 1.22, h: 1.35, fork: true };
  seg.sprites.push(spr); S.signSeg = { seg, spr };
}
function dropSign(){ if (S && S.signSeg) { const a = S.signSeg.seg.sprites, i = a.indexOf(S.signSeg.spr); if (i >= 0) a.splice(i, 1); S.signSeg = null; } }

/* =========================================================
   ЗВУК
   ========================================================= */
let AU = null, MUTE = false;
try { MUTE = localStorage.getItem('dilyaRaceMute') === '1'; } catch (e) {}
function audioOn(){
  try {
    if (!AU) {
      const A = new (window.AudioContext || window.webkitAudioContext)();
      const g = A.createGain(); g.gain.value = 0; g.connect(A.destination);
      const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.connect(g);
      const o1 = A.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 48; o1.connect(lp); o1.start();
      const o2 = A.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 96; o2.connect(lp); o2.start();
      // лесной фон: мягкий шум ветра
      const len = A.sampleRate * 2, buf = A.createBuffer(1, len, A.sampleRate), d = buf.getChannelData(0);
      let lastv = 0; for (let i = 0; i < len; i++) { lastv = lastv * .985 + (Math.random() * 2 - 1) * .015; d[i] = lastv * 3; }
      const ns = A.createBufferSource(); ns.buffer = buf; ns.loop = true; const ng = A.createGain(); ng.gain.value = 0; ns.connect(ng); ng.connect(A.destination); ns.start();
      AU = { A, g, o1, o2, ng };
    }
    if (AU.A.state === 'suspended') AU.A.resume();
  } catch (e) { AU = null; }
}
function audioTick(){
  if (!AU) return;
  const on = running && !S.paused && !S.over && !MUTE, k = S.speed / MAX_SPEED, t = AU.A.currentTime;
  AU.g.gain.setTargetAtTime(on ? .035 + k * .02 : 0, t, .1);
  AU.ng.gain.setTargetAtTime(on ? .05 : 0, t, .3);
  AU.o1.frequency.setTargetAtTime(44 + k * 40, t, .2); AU.o2.frequency.setTargetAtTime(88 + k * 80, t, .2);
}
function blip(f1, f2, dur, type, vol){
  if (!AU || MUTE) return;
  const A = AU.A, o = A.createOscillator(), g = A.createGain(), t = A.currentTime;
  o.type = type || 'sine'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol || .12, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(A.destination); o.start(t); o.stop(t + dur + .02);
}
const SND = {
  xp: () => blip(880, 1760, .12, 'sine', .09),
  good: () => { blip(523, 784, .14, 'triangle', .14); setTimeout(() => blip(784, 1046, .18, 'triangle', .14), 110); },
  bad: () => { blip(220, 90, .35, 'sawtooth', .12); },
  level: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, f * 1.01, .22, 'triangle', .13), i * 120)); },
  over: () => { [523, 440, 349, 262].forEach((f, i) => setTimeout(() => blip(f, f * .98, .3, 'triangle', .12), i * 180)); }
};

/* =========================================================
   ЭКРАН
   ========================================================= */
function resize(){
  if (!cv) return;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  HOR = H * .44; K = H - HOR - 6;
  // ширина дороги у машины ~ 90% узкого экрана, но не больше 0.55 высоты
  const half = Math.min(W * .46, H * .5);
  ROAD_W = half * CAM_H / K;
}

function project(p, cx, cy, cz){
  p.camera.x = -cx; p.camera.y = (p.world.y || 0) - cy; p.camera.z = (p.world.z || 0) - cz;
  p.screen.scale = DEPTH / p.camera.z;
  p.screen.x = W / 2 + p.screen.scale * p.camera.x * K;
  p.screen.y = HOR - p.screen.scale * p.camera.y * K;
  p.screen.w = p.screen.scale * ROAD_W * K;
}

function poly(x1, y1, x2, y2, x3, y3, x4, y4, col){ ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill(); }

const FOG = '#dfe3cf';
function drawSegment(seg, fog){
  const a0 = seg.p1.screen, b = seg.p2.screen, a = { x: a0.x, y: a0.y + 1.2, w: a0.w };
  const dark = seg.dark;
  const grass = mixCol(dark ? '#5d8a3e' : '#679846', FOG, fog);
  ctx.fillStyle = grass; ctx.fillRect(0, b.y, W, a0.y - b.y + 1);
  // обочина: тропинка из земли
  const dirt = mixCol(dark ? '#9a7a55' : '#a8875f', FOG, fog);
  poly(a.x - a.w * 1.16, a.y, a.x - a.w, a.y, b.x - b.w, b.y, b.x - b.w * 1.16, b.y, dirt);
  poly(a.x + a.w * 1.16, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x + b.w * 1.16, b.y, dirt);
  // бордюр: розовый и кремовый
  const rum = mixCol(dark ? '#e7a2b0' : '#fbf3ea', FOG, fog), rw1 = a.w * .07, rw2 = b.w * .07;
  poly(a.x - a.w - rw1, a.y, a.x - a.w, a.y, b.x - b.w, b.y, b.x - b.w - rw2, b.y, rum);
  poly(a.x + a.w + rw1, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x + b.w + rw2, b.y, rum);
  // асфальт
  poly(a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y, mixCol(dark ? '#6d6563' : '#736b68', FOG, fog));
  // разметка
  if (dark) {
    const l1 = a.w * .022, l2 = b.w * .022, col = mixCol('#fbf3ea', FOG, fog);
    [-1 / 3, 1 / 3].forEach(k => { const ax = a.x + a.w * k, bx = b.x + b.w * k; poly(ax - l1, a.y, ax + l1, a.y, bx + l2, b.y, bx - l2, b.y, col); });
  }
}

function drawBG(){
  // небо: золотой час
  const sky = ctx.createLinearGradient(0, 0, 0, HOR + 10);
  sky.addColorStop(0, '#9cc3df'); sky.addColorStop(.55, '#f3d9cf'); sky.addColorStop(1, '#fbe7c6');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, HOR + 12);
  // солнце
  const sx = W * .72, sy = HOR - H * .1;
  const sun = ctx.createRadialGradient(sx, sy, 2, sx, sy, H * .4);
  sun.addColorStop(0, 'rgba(255,250,225,1)'); sun.addColorStop(.06, 'rgba(255,240,200,.95)'); sun.addColorStop(.25, 'rgba(255,215,170,.35)'); sun.addColorStop(1, 'rgba(255,215,170,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, HOR + 12);
  // облака
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 337 - S.skyX * 60 - S.time * 6) % (W + 400) + W + 400) % (W + 400) - 200, cy = HOR * (.18 + (i % 3) * .14), s = 30 + (i % 3) * 14;
    ctx.beginPath(); ctx.ellipse(cx, cy, s * 2.2, s * .55, 0, 0, Math.PI * 2); ctx.ellipse(cx - s * .8, cy - s * .3, s, s * .6, 0, 0, Math.PI * 2); ctx.ellipse(cx + s * .7, cy - s * .35, s * 1.1, s * .7, 0, 0, Math.PI * 2); ctx.fill();
  }
  // слои леса с параллаксом
  const layer = (img, speed, hgt, yOff) => {
    const sc = hgt / img.height, iw = img.width * sc;
    let off = (-(S.skyX * speed) % iw + iw) % iw - iw;
    for (let x = off; x < W; x += iw - 1) ctx.drawImage(img, x, HOR - hgt + yOff, iw, hgt);
  };
  layer(BG.far, 120, H * .3, H * .02);
  layer(BG.near, 260, H * .34, H * .045);
  // дымка у горизонта
  const haze = ctx.createLinearGradient(0, HOR - H * .12, 0, HOR + 8);
  haze.addColorStop(0, 'rgba(223,227,207,0)'); haze.addColorStop(1, 'rgba(223,227,207,.9)');
  ctx.fillStyle = haze; ctx.fillRect(0, HOR - H * .12, W, H * .12 + 10);
}

function drawSprite(img, sx, sy, scale, worldH, clipY, alpha){
  const h = scale * worldH * ROAD_W * K, w = h * img.width / img.height;
  if (h < 1.5) return null;
  const x = sx - w / 2, y = sy - h;
  const clipH = clipY ? Math.max(0, y + h - clipY) : 0;
  if (clipH >= h) return null;
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (clipH > 0) ctx.drawImage(img, 0, 0, img.width, img.height - img.height * clipH / h, x, y, w, h - clipH);
  else ctx.drawImage(img, x, y, w, h);
  ctx.globalAlpha = 1;
  return { x, y, w, h };
}

function nameTag(text, cx, top, hgt){
  const fs = clamp(hgt * .2, 10, 20), lines = text.length > 15 ? splitName(text) : [text];
  ctx.font = '800 ' + fs + 'px Manrope, sans-serif';
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width)) + fs * 1.3, th = lines.length * fs * 1.2 + fs * .7;
  const x = cx - tw / 2, y = top - th - fs * .4;
  ctx.fillStyle = 'rgba(46,29,27,.25)'; rr(ctx, x + 2, y + 3, tw, th, fs * .7); ctx.fill();
  ctx.fillStyle = '#fbf8f4'; rr(ctx, x, y, tw, th, fs * .7); ctx.fill();
  ctx.strokeStyle = '#6b2633'; ctx.lineWidth = Math.max(1.5, fs * .12); ctx.stroke();
  ctx.fillStyle = '#6b2633'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cx, y + fs * .35 + fs * 1.2 * (i + .5)));
}
const SPLIT = {};
function splitName(t){
  if (SPLIT[t]) return SPLIT[t];
  const w = t.split(' '); if (w.length < 2) return (SPLIT[t] = [t]);
  let best = null, bd = 1e9;
  for (let i = 1; i < w.length; i++) { const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), d = Math.abs(a.length - b.length); if (d < bd) { bd = d; best = [a, b]; } }
  return (SPLIT[t] = best);
}

function render(){
  const shx = S.shake > 0 ? (Math.random() - .5) * S.shake * 16 : 0, shy = S.shake > 0 ? (Math.random() - .5) * S.shake * 10 : 0;
  ctx.save(); ctx.translate(shx, shy);
  drawBG();
  const base = findSeg(S.pos), bp = (S.pos % SEG) / SEG;
  const pz = CAM_H * DEPTH, ps = findSeg(S.pos + pz), pp = ((S.pos + pz) % SEG) / SEG;
  const py = lerp(ps.p1.world.y, ps.p2.world.y, pp);
  let maxy = H, x = 0, dx = -(base.curve * bp);
  const camX = S.x * ROAD_W, camY = py + CAM_H;
  for (let n = 0; n < DRAW; n++) {
    const seg = segs[(base.index + n) % segs.length];
    seg.looped = seg.index < base.index;
    seg.fog = Math.pow(n / DRAW, 1.6);
    seg.clip = maxy;
    const zOff = S.pos - (seg.looped ? trackLen : 0);
    project(seg.p1, camX - x, camY, zOff);
    project(seg.p2, camX - x - dx, camY, zOff);
    seg.x1 = x; x += dx; dx += seg.curve + (S.bendNow || 0);
    if (seg.p1.camera.z <= DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
    drawSegment(seg, seg.fog);
    maxy = seg.p2.screen.y;
  }
  // спрайты и герои: от дальних к ближним
  const tags = [];
  for (let n = DRAW - 1; n > 0; n--) {
    const seg = segs[(base.index + n) % segs.length], sc = seg.p1.screen.scale;
    if (!(sc > 0)) continue;
    const alpha = n > DRAW * .7 ? clamp((DRAW - n) / (DRAW * .3), 0, 1) : 1;
    for (const sp of seg.sprites) {
      const sx = seg.p1.screen.x + sc * sp.x * ROAD_W * K;
      if (sx < -W || sx > W * 2) continue;
      drawSprite(sp.img, sx, seg.p1.screen.y, sc, sp.h, seg.clip, alpha);
    }
    for (const it of seg.items) {
      if (it.taken) continue;
      const sx = seg.p1.screen.x + sc * LANES[it.lane] * ROAD_W * K;
      if (it.kind === 'xp') {
        const bob = Math.sin(S.time * 5 + it.lane + seg.index) * .05;
        drawSprite(SPR.orb, sx, seg.p1.screen.y - sc * (0.12 + bob) * ROAD_W * K, sc, .3, seg.clip, alpha);
      } else {
        const img = makeHero(it.h.name), hop = Math.abs(Math.sin(S.time * 3 + it.wiggle)) * .04;
        const box = drawSprite(img, sx, seg.p1.screen.y - sc * hop * ROAD_W * K, sc, .5, seg.clip, alpha);
        if (box && box.h > 10 && box.y > 0) tags.push([it.h.name, sx, box.y, box.h, alpha]);
      }
    }
  }
  tags.forEach(t => { ctx.globalAlpha = t[4]; nameTag(t[0], t[1], t[2], t[3]); ctx.globalAlpha = 1; });
  drawCar();
  drawParticles();
  ctx.restore();
  drawRays();
  if (S.flash > 0) { ctx.fillStyle = S.flashCol.replace('A', S.flash.toFixed(2)); ctx.fillRect(0, 0, W, H); }
  drawPops();
}

function drawCar(){
  const img = SPR.car, wPx = Math.min(W * .46, H * .5) * .68, hPx = wPx * img.height / img.width;
  const bounce = Math.sin(S.time * 18) * (S.speed / MAX_SPEED) * 1.6;
  const cx = W / 2, cy = H - 8 - hPx / 2 + bounce;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(S.tilt * .08);
  if (S.inv > 0 && Math.floor(S.inv * 8) % 2) ctx.globalAlpha = .45;
  ctx.drawImage(img, -wPx / 2, -hPx / 2, wPx, hPx);
  ctx.globalAlpha = 1;
  if (S.brake > 0) {
    ctx.globalCompositeOperation = 'lighter';
    [-.343, .343].forEach(k => { const gx = k * wPx, gy = -hPx / 2 + hPx * .59, g = ctx.createRadialGradient(gx, gy, 0, gx, gy, wPx * .14); g.addColorStop(0, 'rgba(255,60,60,' + (.8 * S.brake) + ')'); g.addColorStop(1, 'rgba(255,60,60,0)'); ctx.fillStyle = g; ctx.fillRect(gx - wPx * .14, gy - wPx * .14, wPx * .28, wPx * .28); });
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  S.carBox = { cx, cy, w: wPx, h: hPx };
}

function drawParticles(){
  for (const p of S.parts) {
    ctx.globalAlpha = clamp(p.life, 0, 1) * (p.a || 1);
    if (p.kind === 'puff') { ctx.fillStyle = 'rgba(240,236,230,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    else if (p.kind === 'spark') { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    else if (p.kind === 'heart') { ctx.fillStyle = p.col; const s = p.r, x = p.x, y = p.y; ctx.beginPath(); ctx.moveTo(x, y + s * .9); ctx.bezierCurveTo(x - s * 1.2, y, x - s * .6, y - s * .8, x, y - s * .2); ctx.bezierCurveTo(x + s * .6, y - s * .8, x + s * 1.2, y, x, y + s * .9); ctx.fill(); }
    else if (p.kind === 'pollen') { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3); g.addColorStop(0, 'rgba(255,245,200,.9)'); g.addColorStop(1, 'rgba(255,245,200,0)'); ctx.fillStyle = g; ctx.fillRect(p.x - p.r * 3, p.y - p.r * 3, p.r * 6, p.r * 6); }
    else if (p.kind === 'leaf') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
}
function drawRays(){
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const ox = W * .78, oy = -H * .05;
  for (let i = 0; i < 4; i++) {
    const a = .9 + i * .22 + Math.sin(S.time * .3 + i) * .03, len = H * 1.3, wid = .05 + (i % 2) * .03;
    const g = ctx.createLinearGradient(ox, oy, ox + Math.cos(a + Math.PI / 2) * len, oy + Math.sin(a + Math.PI / 2) * len);
    g.addColorStop(0, 'rgba(255,236,200,' + (.1 + .04 * Math.sin(S.time * .7 + i)) + ')'); g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(a + Math.PI / 2 - wid) * len, oy + Math.sin(a + Math.PI / 2 - wid) * len);
    ctx.lineTo(ox + Math.cos(a + Math.PI / 2 + wid) * len, oy + Math.sin(a + Math.PI / 2 + wid) * len); ctx.fill();
  }
  ctx.restore();
}
function drawPops(){
  for (const p of S.pops) {
    const t = 1 - p.life / p.max, y = p.y - t * 40;
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.font = '800 ' + p.fs + 'px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = p.text.split('\n');
    const tw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 28, th = lines.length * p.fs * 1.25 + 14;
    ctx.fillStyle = p.bg; rr(ctx, p.x - tw / 2, y - th / 2, tw, th, 16); ctx.fill();
    ctx.fillStyle = p.col; lines.forEach((l, i) => ctx.fillText(l, p.x, y - th / 2 + 7 + p.fs * 1.25 * (i + .5)));
  }
  ctx.globalAlpha = 1;
}
function pop(text, good, long){
  S.pops = S.pops.filter(p => p.y > H * .2 || p.life < .3);
  const fs = clamp(W * .04, 14, 20);
  S.pops.push({ text, x: W / 2, y: H * .3 + S.pops.length * 8, life: long ? 2.4 : 1.1, max: long ? 2.4 : 1.1, fs, col: good ? '#2f5a2a' : '#7e1f2f', bg: good ? 'rgba(232,246,224,.95)' : 'rgba(253,231,233,.97)' });
}

/* =========================================================
   ЛОГИКА
   ========================================================= */
function update(dt){
  S.time += dt;
  if (S.paused) return;
  // скорость: плавно тормозим перед развилкой
  let want = S.idle ? 1600 : S.mode === 'ask' ? 0 : CRUISE;
  if (!S.idle && S.mode === 'drive') { const rem = S.forkAt - S.dist; want = Math.min(want, Math.sqrt(Math.max(0, 2 * DECEL * rem))); if (rem <= 4) { S.dist = S.forkAt; ask(); want = 0; } }
  S.speed = S.mode === 'drive' && !S.idle ? Math.min(lerp(S.speed, want, 1 - Math.pow(.3, dt)), want + 1) : lerp(S.speed, want, 1 - Math.pow(.05, dt));
  if (S.speed < 2) S.speed = S.mode === 'ask' ? 0 : S.speed;
  const prevPos = S.pos, step = S.speed * dt;
  S.pos = (S.pos + step) % trackLen; S.dist += step;
  const seg = findSeg(S.pos + CAM_H * DEPTH);
  // поворот на развилке
  S.bendNow = 0;
  if (S.bend) {
    S.bend.t += dt / 2.4;
    const e = Math.sin(Math.PI * clamp(S.bend.t, 0, 1));
    S.bendNow = S.bend.dir * 3.2 * e * (S.speed / CRUISE);
    if (S.bend.t >= 1) S.bend = null;
  }
  S.skyX += (seg.curve + S.bendNow * 4) * (S.speed / MAX_SPEED) * dt * .5;
  S.tilt = lerp(S.tilt, -(seg.curve + S.bendNow * 3) * .08 * (S.speed / CRUISE), 1 - Math.pow(.02, dt));
  // XP на дороге
  while (S.nextZ < S.dist + DRAW * SEG * .8) {
    const z = S.nextZ, near = Math.abs(z - S.forkAt) < SEG * 18;
    if (!S.idle && !near) spawnOrbs(z % trackLen);
    S.nextZ += SEG * (12 + Math.random() * 10);
  }
  const pz = CAM_H * DEPTH, from = Math.floor((prevPos + pz) / SEG), to = Math.floor((S.pos + pz + (S.pos < prevPos ? trackLen : 0)) / SEG);
  for (let i = from + 1; i <= to; i++) {
    const sg = segs[i % segs.length];
    for (const it of sg.items) if (!it.taken && !S.idle) grab(it);
    sg.items = [];
  }
  // конец поездки
  if (S.endAt && S.dist >= S.endAt && !S.over) gameOver();
  // эффекты
  S.shake = Math.max(0, S.shake - dt * 2.5); S.flash = Math.max(0, S.flash - dt * 1.8); S.brake = S.mode === 'ask' || (S.mode === 'drive' && S.speed < want - 50) ? Math.min(1, S.brake + dt * 3) : Math.max(0, S.brake - dt * 2);
  S.pops.forEach(p => p.life -= dt); S.pops = S.pops.filter(p => p.life > 0);
  S.puff -= dt;
  if (S.puff <= 0 && S.carBox) { S.puff = S.speed > 50 ? .07 : .25; S.parts.push({ kind: 'puff', x: S.carBox.cx + S.carBox.w * .25, y: S.carBox.cy + S.carBox.h * .36, vx: 20 + Math.random() * 30, vy: -4 + Math.random() * 10, r: 3 + Math.random() * 3, gr: 22, life: .7, a: .45 }); }
  if (Math.random() < dt * 6) S.parts.push({ kind: 'pollen', x: Math.random() * W, y: Math.random() * H * .8, vx: (Math.random() - .5) * 20, vy: -5 - Math.random() * 8, r: 1.2 + Math.random() * 1.8, life: 2 + Math.random() * 2, gr: 0 });
  if (Math.random() < dt * 1.6) S.parts.push({ kind: 'leaf', x: Math.random() * W, y: -10, vx: -30 + Math.random() * 60, vy: 40 + Math.random() * 40, r: 5 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - .5) * 4, col: pick(['#d9a441', '#c8742e', '#9cbb4c', '#e2b25c', '#b5552f']), life: 5, gr: 0 });
  for (const p of S.parts) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.kind === 'puff') p.r += p.gr * dt;
    if (p.kind === 'leaf') { p.rot += p.vr * dt; p.vx += Math.sin(S.time * 2 + p.r) * 30 * dt; if (p.y > H) p.life = 0; }
    if (p.kind === 'spark' || p.kind === 'heart') p.vy += 260 * dt;
  }
  S.parts = S.parts.filter(p => p.life > 0);
  if (S.parts.length > 260) S.parts.splice(0, S.parts.length - 260);
  if (S.banner) { S.banner.t -= dt; if (S.banner.t <= 0) { S.banner = null; hud(); } }
}

function burst(kind, n, cols){
  if (!S.carBox) return;
  for (let i = 0; i < n; i++) S.parts.push({ kind, x: S.carBox.cx + (Math.random() - .5) * S.carBox.w * .6, y: S.carBox.cy - S.carBox.h * .4, vx: (Math.random() - .5) * 260, vy: -180 - Math.random() * 200, r: kind === 'heart' ? 6 + Math.random() * 5 : 2 + Math.random() * 3, col: pick(cols), life: .9 + Math.random() * .5, gr: 0 });
}
function grab(it){
  it.taken = true; S.xp++; S.score += 1; SND.xp(); burst('spark', 6, ['#ffe08a', '#ffd1dc', '#fff6d6']); hud();
}

/* ---------- развилка ---------- */
function ask(){
  if (S.mode === 'ask') return;
  S.mode = 'ask'; S.speed = 0;
  const q = S.qs[S.qi], box = document.getElementById('rask'); if (!box || !q) return;
  const dirs = [['left', '⬅', 'налево'], ['up', '⬆', 'прямо'], ['right', '➡', 'направо']];
  const portrait = q.hero ? `<img class="rq-hero" src="${makeHero(q.hero).toDataURL()}" alt="">` : '';
  box.innerHTML = `
    <div class="rq">
      <p class="rq-k">Развилка ${S.qi + 1} из ${S.qs.length}</p>
      ${portrait}
      ${q.hero ? `<h2 class="rq-name">${esc(q.hero)}</h2>` : ''}
      <p class="rq-t">${esc(q.text)}</p>
      ${q.desc ? `<p class="rq-d">${esc(q.desc)}</p>` : ''}
    </div>
    <div class="rsigns"><i class="rpole"></i>
      ${q.opts.map((o, i) => `<button class="rsign ${dirs[i][0]}" data-i="${i}"><span class="ra">${dirs[i][1]}</span><b>${esc(o.t)}</b></button>`).join('')}
    </div>`;
  box.classList.add('on');
  box.querySelectorAll('.rsign').forEach(b => b.onclick = () => answer(+b.dataset.i));
  blip(660, 520, .18, 'triangle', .08);
}
function fb(ok, main, sub){
  const q = document.querySelector('#rask .rq'); if (!q) return;
  const d = document.createElement('div'); d.className = 'rfb ' + (ok ? 'ok' : 'bad');
  d.innerHTML = '<b>' + (ok ? '✓ ' : '✕ ') + esc(main) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '');
  q.appendChild(d); q.scrollTop = q.scrollHeight;
}
function answer(i){
  if (!S || S.mode !== 'ask') return;
  const q = S.qs[S.qi], o = q.opts[i], box = document.getElementById('rask');
  S.mode = 'answered';
  box.querySelectorAll('.rsign').forEach((b, k) => { b.disabled = true; if (q.opts[k].ok) b.classList.add('ok'); else if (k === i) b.classList.add('bad'); });
  if (o.ok) {
    S.right++; S.score += 10; S.res.push(true);
    SND.good(); burst('heart', 16, ['#f08aa3', '#ffd1dc', '#e2577c', '#fff']);
    fb(true, 'Верно! 💗');
  } else {
    S.hearts--; S.res.push(false); S.shake = .8; S.flash = .3; S.flashCol = 'rgba(200,40,60,A)';
    S.mistakes.push({ q: q.hero ? q.hero + ': из какого произведения?' : q.desc ? 'Кто это? ' + q.desc : q.text, right: q.right, note: o.note || q.note || '' });
    SND.bad(); if (navigator.vibrate) try { navigator.vibrate(100); } catch (e) {}
    fb(false, 'Правильно: ' + q.right, o.note || '');
  }
  hud();
  setTimeout(() => {
    if (!S || !running) return;
    box.classList.remove('on');
    S.bend = { dir: i - 1, t: 0 }; S.mode = 'drive'; S.qi++;
    S.signPassAt = S.dist + CAM_H * DEPTH + SEG * 14;
    if (S.hearts <= 0 || S.qi >= S.qs.length) { S.endAt = S.dist + 4500; S.forkAt = 1e12; }
    else { const keep = S.signSeg; S.signSeg = null; setTimeout(() => { if (keep) { const a = keep.seg.sprites, k = a.indexOf(keep.spr); if (k >= 0) a.splice(k, 1); } }, 4000); planFork(S.dist + GAP); }
  }, o.ok ? 900 : 2800);
}

/* =========================================================
   HUD, управление, циклы
   ========================================================= */
function hud(){
  const el = document.getElementById('rhud'); if (!el || !S) return;
  el.querySelector('.rh-hearts').innerHTML = Array.from({ length: HEARTS }, (_, i) => `<i class="${i < S.hearts ? '' : 'off'}">❤</i>`).join('');
  el.querySelector('.rh-score b').textContent = S.score;
  el.querySelector('.rh-xp b').textContent = S.xp;
  el.querySelector('.rh-task b').textContent = workTitle(S.work);
  el.querySelector('.rh-prog').innerHTML = Array.from({ length: FORKS }, (_, i) => `<i class="${S.res[i] === true ? 'on' : S.res[i] === false ? 'bad' : ''}"></i>`).join('');
  const bn = document.getElementById('rbanner');
  if (bn) { if (S.banner) { bn.innerHTML = `<p>${esc(S.banner.head)}</p><h2>Поездка по<br>${esc(workTitle(S.work))}</h2>`; bn.classList.add('on'); } else bn.classList.remove('on'); }
}

function loop(t){
  if (!running) return;
  const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
  update(dt); render(); audioTick();
  raf = requestAnimationFrame(loop);
}

function onKey(e){
  if (!running || !S) return;
  if (S.mode === 'ask') {
    const m = { ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2, '1': 0, '2': 1, '3': 2 }[e.key];
    if (m != null && S.qs[S.qi] && S.qs[S.qi].opts[m]) { answer(m); e.preventDefault(); return; }
  }
  if (e.key === ' ' || e.key === 'Escape' || e.key === 'p') { togglePause(); e.preventDefault(); }
}
function togglePause(){
  if (!S || S.over || S.idle || !running) return;
  S.paused = !S.paused;
  const p = document.getElementById('rpause'); if (p) p.classList.toggle('on', S.paused);
  const b = document.getElementById('rpbtn'); if (b) b.textContent = S.paused ? '▶' : '❚❚';
}
function onVis(){ if (document.hidden && S && !S.paused && !S.over && running && S.mode !== 'ask') togglePause(); }

/* =========================================================
   ЭКРАНЫ
   ========================================================= */
function shell(){
  document.body.classList.add('duo-test', 'race-on');
  app.innerHTML = `
  <div class="race" id="race">
    <canvas id="rcv"></canvas>
    <div class="rhud" id="rhud">
      <div class="rh-top">
        <a class="rbtn" href="#/games" aria-label="Выйти">✕</a>
        <div class="rh-hearts"></div>
        <div class="rh-score">⭐ <b>0</b></div>
        <div class="rh-xp">⚡ <b>0</b></div>
        <button class="rbtn" id="rsnd" aria-label="Звук">${MUTE ? '🔇' : '🔊'}</button>
        <button class="rbtn" id="rpbtn" aria-label="Пауза">❚❚</button>
      </div>
      <div class="rh-task"><span>Поездка по</span><b></b><div class="rh-prog"></div></div>
    </div>
    <div class="rbanner" id="rbanner"></div>
    <div class="rask" id="rask"></div>
    <div class="rpause" id="rpause"><div class="rcard"><h2>Пауза</h2><button class="dbtn" id="rcont">Продолжить</button><a class="dbtn ghost" href="#/games">Выйти</a></div></div>
    <div class="rstart" id="rstart"></div>
  </div>`;
  cv = document.getElementById('rcv'); ctx = cv.getContext('2d');
  resize();
  document.getElementById('rpbtn').onclick = togglePause;
  document.getElementById('rcont').onclick = togglePause;
  document.getElementById('rsnd').onclick = e => { MUTE = !MUTE; try { localStorage.setItem('dilyaRaceMute', MUTE ? '1' : '0'); } catch (x) {} e.currentTarget.textContent = MUTE ? '🔇' : '🔊'; audioOn(); };
}

function startScreen(){
  const P = buildPool(), works = chooseWorks();
  S = newState(works[0]); S.idle = true; S.target = 1600;
  const st = document.getElementById('rstart');
  document.getElementById('race').classList.add('pre');
  const opts = P.works.slice().sort((a, b) => ((byId(a).week || 99) - (byId(b).week || 99)) || byId(a).title.localeCompare(byId(b).title, 'ru'))
    .map(w => `<option value="${w}">${esc(byId(w).title.replace(/[«»]/g, ''))} · ${esc(byId(w).author)}</option>`).join('');
  st.innerHTML = `
    <div class="rcard">
      <p class="label">Мини-игра</p>
      <h1>Лесная дорога</h1>
      <p class="rlead">Спокойно едешь по лесу и собираешь <b>⚡ XP</b>. На каждой развилке указатель с вопросом: выбери правильную табличку, и машина свернёт туда. Торопиться некуда 💗</p>
      <label class="rsel"><span>Произведение</span>
        <select id="rwork"><option value="">🎲 Случайное произведение</option>${opts}</select></label>
      <div class="rhow"><span>🪧 10 развилок</span><span>❤ 3 сердечка</span><span>⏳ без таймера</span></div>
      <button class="dbtn" id="rgo">Поехали! 🚗</button>
      <p class="rrec">${(store.games || {}).race ? 'Твой рекорд: ⭐ ' + store.games.race : 'Здесь появится твой рекорд'}</p>
    </div>`;
  document.getElementById('rgo').onclick = () => {
    const w = document.getElementById('rwork').value;
    st.classList.add('hide');
    audioOn(); go(w || null);
  };
  hud();
}

function go(work){
  const keep = S ? { pos: S.pos, dist: S.dist, speed: S.speed, skyX: S.skyX, time: S.time } : null;
  segs.forEach(sg => { sg.items = []; sg.sprites = sg.sprites.filter(x => !x.fork); });
  if (S) { const a = askBox(); a && a.classList.remove('on'); }
  S = newState(work);
  if (keep) Object.assign(S, keep);
  S.nextZ = S.dist + SEG * 10;
  S.qs = makeQuestions(S.work);
  planFork(S.dist + GAP * .8);
  S.banner = { t: 2.2, head: 'Начинаем' };
  const p = document.getElementById('rpause'); if (p) p.classList.remove('on');
  const rc = document.getElementById('race'); if (rc) rc.classList.remove('pre');
  hud();
}

function askBox(){ return document.getElementById('rask'); }
function gameOver(){
  if (!S || S.over) return;
  S.over = true; S.idle = true; dropSign();
  const best = (store.games || {}).race || 0, rec = S.score > best;
  store.games = store.games || {}; if (rec) store.games.race = S.score;
  store.gameRight = (store.gameRight || 0) + S.right;
  const earned = S.xp + S.right * 2;
  store.gxp = store.gxp || {}; const used = store.gxp[today()] || 0, gain = Math.max(0, Math.min(earned, GAME_XP_DAY - used));
  Object.keys(store.gxp).forEach(d => { if (d !== today()) delete store.gxp[d]; });
  store.gxp[today()] = used + gain; addBonus(gain); save();
  const all = S.right === S.qs.length, lost = S.hearts <= 0;
  if (all) SND.level(); else SND.over();
  const mis = S.mistakes.map(m => `<li><span>${esc(m.q.length > 120 ? m.q.slice(0, 120).replace(/\s\S*$/, '') + '…' : m.q)}</span><b>${esc(m.right)}</b>${m.note && m.note.indexOf(m.right) < 0 ? `<em>${esc(m.note)}</em>` : ''}</li>`).join('');
  const st = document.getElementById('rstart'); if (!st) return;
  st.classList.remove('hide');
  st.innerHTML = `
    <div class="rcard rend">${all || (rec && S.score) ? confetti() : ''}
      ${MASCOT(all ? 'happy' : lost ? 'sad' : 'wave')}
      <h1>${all ? 'Без единой ошибки!' : lost ? 'Сердечки закончились' : 'Приехали!'}</h1>
      <p class="rrec">${esc(workTitle(S.work))}</p>
      <div class="endstats"><div><span>Верно</span><b>✅ ${S.right}/${S.qs.length}</b></div><div><span>Очки</span><b>⭐ ${S.score}</b></div><div><span>Опыт</span><b>⚡ ${gain}</b></div></div>
      <p class="rrec">Рекорд: <b>⭐ ${Math.max(best, S.score)}</b>${rec && S.score ? ' · новый!' : ''}</p>
      ${gain < earned ? '<p class="endnote">Дневной лимит XP за игры набран, но рекорды считаются всегда 💗</p>' : ''}
      ${mis ? `<div class="rmis"><p class="label">Запомни</p><ul>${mis}</ul></div>` : ''}
      <div class="endbtns"><button class="dbtn" id="rnext">Новая поездка 🚗</button><button class="dbtn ghost" id="ragain">Это же произведение ещё раз</button><a class="dbtn ghost" href="#/games">Другие игры</a></div>
    </div>`;
  const w = S.work;
  document.getElementById('rnext').onclick = () => { st.classList.add('hide'); audioOn(); go(pick(chooseWorks().filter(x => x !== w)) || null); };
  document.getElementById('ragain').onclick = () => { st.classList.add('hide'); audioOn(); go(w); };
}

function start(){
  stop();
  loader('Завожу машину…');
  loadHeroes().then(() => {
    buildSprites(); buildRoad(); POOL = null; buildPool();
    if (!buildPool().works.length) { app.innerHTML = '<div class="wrap page"><div class="card">Пока нет героев для игры.</div></div>'; return; }
    shell(); startScreen();
    running = true; last = performance.now();
    window.addEventListener('resize', resize); window.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(loop);
  }).catch(e => { console.error(e); typeof loadFail === 'function' ? loadFail() : (app.innerHTML = '<p>Не получилось загрузить игру</p>'); });
}
function stop(){
  if (!running) return;
  running = false; cancelAnimationFrame(raf);
  window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
  document.body.classList.remove('race-on');
  if (AU) { try { AU.g.gain.value = 0; AU.ng.gain.value = 0; } catch (e) {} }
  if (S && !S.over && !S.idle && (S.score || S.xp)) { // вышла посреди игры: всё равно засчитываем
    const best = (store.games || {}).race || 0; store.games = store.games || {}; if (S.score > best) store.games.race = S.score;
    store.gameRight = (store.gameRight || 0) + S.right;
    const earned = S.xp + S.right * 2; store.gxp = store.gxp || {}; const used = store.gxp[today()] || 0, gain = Math.max(0, Math.min(earned, GAME_XP_DAY - used));
    store.gxp[today()] = used + gain; addBonus(gain); save();
  }
  S = null;
}

window.RACE = { start, stop, get on(){ return running; } };
})();
