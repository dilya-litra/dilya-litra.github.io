/* =========================================================
   dilya.litra: основная логика сайта
   ========================================================= */
'use strict';
const app = document.getElementById('app');
const KEY = 'dilyaLitra.v1';
let store = {};
try { store = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { store = {}; }
store.lessons = store.lessons || {};

/* ---------- мелочи ---------- */
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function shuffle(a, seed){ a = a.slice(); let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor(s / 233280 * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function mix(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pick(a){ return a[Math.floor(Math.random() * a.length)]; }
function plural(n, a, b, c){ n = Math.abs(n) % 100; const d = n % 10; return (n > 10 && n < 20) ? c : d === 1 ? a : (d >= 2 && d <= 4) ? b : c; }
function ytId(url){ const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ''; }
function dkey(d){ return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function today(){ return dkey(new Date()); }
function parseKey(k){ const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(k, n){ const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); }
function dayDiff(a, b){ return Math.round((parseKey(b) - parseKey(a)) / 864e5); }
function opt(k){ const s = store.set || {}; return s[k] == null ? ({ sound: true, vib: true, theme: 'auto' })[k] : s[k]; }
function setOpt(k, v){ store.set = store.set || {}; store.set[k] = v; persist(); }

/* ---------- уроки и расписание ---------- */
const META = {}; LESSONS.forEach(L => { META[L.id] = L; L.subtitle = L.sub; });
function byId(id){ return META[id]; }
const WEEKS = SCHEDULE.map((w, wi) => w.map(([num, text]) => {
  const id = READY[(wi + 1) + '/' + num] || null;
  const m = text.match(/^((?:[А-ЯЁA-Z]\.\s?)+[^.«:]+?)\s*[.:]?\s*(«.*|Лирика.*|Басни.*|Цикл.*|Стихи.*|Сонеты.*)$/);
  return { week: wi + 1, num, id, author: m ? m[1] : '', title: m ? m[2] : text };
}));
const ALL = WEEKS.flat();
LESSONS.forEach(L => { const s = ALL.find(x => x.id === L.id); if (s) L.week = s.week; });
const READY_ORDER = ALL.filter(x => x.id && byId(x.id));

const LCACHE = {};
function loadLesson(id){
  if (LCACHE[id]) return Promise.resolve(LCACHE[id]);
  const M = byId(id); if (!M) return Promise.reject(new Error('нет урока'));
  return fetch('data/l/' + id + '.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => (LCACHE[id] = Object.assign({}, M, d)));
}
function loadMany(ids, onp){
  let n = 0;
  return Promise.all(ids.map(id => loadLesson(id).then(L => { onp && onp(++n, ids.length); return L; }).catch(() => null))).then(a => a.filter(Boolean));
}
function loader(t){ app.innerHTML = `<div class="loading">${MASCOT('wave')}<p>${esc(t || 'Загружаю…')}</p><div class="lbar"><i id="lbar"></i></div></div>`; }
function loadFail(){ app.innerHTML = `<div class="loading">${MASCOT('sad')}<p>Не получилось загрузить. Проверь интернет и обнови страницу 💗</p><a class="dbtn" href="#/">На главную</a></div>`; }

/* ---------- прогресс ---------- */
function prog(id){ return store.lessons[id] = store.lessons[id] || {}; }
function qPoints(q){ return q.type === 'match' ? q.pairs.length : (q.type === 'many' ? 2 : 1); }
function lessonDone(id){ const p = store.lessons[id], M = byId(id); return !!(p && (p.video || !(M && M.video)) && p.notes && p.test != null); }
function lessonStarted(id){ const p = store.lessons[id] || {}; return !!(p.video || p.notes || p.test != null); }
function xpLessons(){ return Object.keys(store.lessons || {}).reduce((s, id) => { const p = store.lessons[id] || {}; return s + (p.video ? 10 : 0) + (p.notes ? 10 : 0) + (p.test != null ? p.test + 10 : 0); }, 0); }
function xpTotal(){ return xpLessons() + (store.bonus || 0); }
function addBonus(n){ store.bonus = (store.bonus || 0) + n; }
function weekXp(){ const log = store.xpLog || {}, d = new Date(), day = (d.getDay() + 6) % 7; let s = 0; for (let i = 0; i <= day; i++) s += log[dkey(new Date(Date.now() - i * 864e5))] || 0; return s; }
function todayXp(){ return (store.xpLog || {})[today()] || 0; }
const GOAL = 30;

function persist(){ try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
function save(active){
  if (active !== false) { store.days = store.days || {}; store.days[today()] = 1; }
  let t = xpTotal(); const prev = store.xpPrev == null ? t : store.xpPrev, tx0 = todayXp();
  if (t > prev && boostOn()) { const d = t - prev; addBonus(d); t += d; }
  if (t > prev) {
    store.xpLog = store.xpLog || {}; store.xpLog[today()] = tx0 + (t - prev);
    if (tx0 < GOAL && todayXp() >= GOAL) setTimeout(() => { toast('🎯', 'Задание дня выполнено!', '+' + GOAL + ' XP за сегодня, умница'); sfx('done'); }, 600);
  }
  store.xpPrev = t;
  const lg = store.xpLog || {}; Object.keys(lg).forEach(k => { if (dayDiff(k, today()) > 60) delete lg[k]; });
  store.best = Math.max(store.best || 0, streak());
  freezeEarn(); persist(); push();
  clearTimeout(save._b); save._b = setTimeout(checkBadges, 400);
}
if (store.xpPrev == null) store.xpPrev = xpTotal();

/* ---------- серия с заморозкой ---------- */
function streak(){
  const days = store.days || {}, fr = store.frozen || {}; let n = 0; const d = new Date();
  if (!days[dkey(d)]) d.setDate(d.getDate() - 1);
  for (let g = 0; g < 3000; g++) { const k = dkey(d); if (days[k]) n++; else if (!fr[k]) break; d.setDate(d.getDate() - 1); }
  return n;
}
function lastActive(){ const k = Object.keys(store.days || {}); return k.length ? k.sort((a, b) => parseKey(b) - parseKey(a))[0] : ''; }
function freezeCheck(){
  const days = store.days || {}; if (!Object.keys(days).length) return;
  const fr = store.frozen = store.frozen || {}, missed = [], d = new Date(); d.setDate(d.getDate() - 1);
  while (missed.length < 8) { const k = dkey(d); if (days[k] || fr[k]) break; missed.push(k); d.setDate(d.getDate() - 1); }
  if (!missed.length || missed.length >= 8) return;
  if ((store.freezes || 0) >= missed.length) {
    missed.forEach(k => fr[k] = 1); store.freezes -= missed.length; persist();
    setTimeout(() => toast('❄️', 'Заморозка спасла серию!', 'Вчера ты пропустила, но серия ' + streak() + ' 🔥 цела'), 900);
  }
}
function freezeEarn(){
  const s = streak();
  if (s > 0 && s % 7 === 0 && store.fzAt !== today()) {
    store.fzAt = today();
    if ((store.freezes || 0) < 2) { store.freezes = (store.freezes || 0) + 1; setTimeout(() => toast('❄️', 'Новая заморозка!', s + ' ' + plural(s, 'день', 'дня', 'дней') + ' подряд. Если пропустишь день, серия не сгорит'), 1200); }
  }
}

/* ---------- эпохи и неделя потока ---------- */
const ERAS = [
  { name: 'Теория литературы', c: '#8A3442', from: 1, to: 2, note: 'роды, жанры, тропы и всё, без чего не обойтись' },
  { name: 'Классика XVIII–XIX века', c: '#8A3442', from: 3, to: 15, note: 'от Фонвизина до Гончарова' },
  { name: 'Литература XX века', c: '#B0704A', from: 16, to: 25, note: 'от Горького и Есенина до Вампилова' },
  { name: 'О войне', c: '#6E7550', from: 26, to: 28, note: 'Быков, Васильев, Твардовский, Окуджава' },
  { name: 'Литература Казахстана', c: '#A9823A', from: 29, to: 31, note: 'Шаханов, Сулейменов, Жунусов, Айтматов' },
  { name: 'Зарубежная литература', c: '#5F6F86', from: 32, to: 34, note: 'от Андерсена до Ремарка' }
];
const MYTH = { name: 'Мифы и фольклор', c: '#946387' };
function eraOfWeek(w){ return ERAS.find(e => w >= e.from && w <= e.to) || ERAS[0]; }
function eraOf(x){ return (!x.author && /миф|Притча|Вавилон|Соломон|Илье Муромце/i.test(x.title)) ? MYTH : eraOfWeek(x.week); }
function eraBadge(e){ return `<span class="era" style="--c:${e.c}">${esc(e.name)}</span>`; }
function stream(){ return store.stream || ''; }
function weekFor(st){
  const S = CONFIG.streams[st]; if (!S) return CONFIG.currentWeek;
  const diff = Math.floor((Date.now() - new Date(S.monday + 'T00:00:00').getTime()) / 6048e5);
  return Math.min(Math.max(diff < 0 ? S.before : S.week + diff, 1), WEEKS.length);
}
function curWeek(){ return weekFor(stream()); }
function weekNames(w){ const out = []; w.forEach(x => { const t = x.author ? x.author.trim().split(/\s+/).pop() : x.title.replace(/\s*\(.*$/, '').split(':')[0]; if (!out.includes(t)) out.push(t); }); return out.join(', '); }
function setStream(s){ store.stream = s; persist(); push(); route(); }

/* ---------- звуки и вибрация ---------- */
let AC = null;
function sfx(kind){
  if (opt('vib') && navigator.vibrate) navigator.vibrate(({ right: 25, wrong: [60, 40, 60], done: [30, 40, 30, 40, 80], chest: [20, 30, 20, 30, 120] })[kind] || 0);
  if (!opt('sound')) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const notes = ({ right: [[880, 0, .09], [1318.5, .08, .16]], wrong: [[220, 0, .14, 'square'], [185, .12, .2, 'square']], done: [[523.3, 0, .12], [659.3, .1, .12], [784, .2, .12], [1046.5, .3, .3]], chest: [[784, 0, .08], [987.8, .07, .08], [1174.7, .14, .08], [1568, .21, .35]], tap: [[660, 0, .05]] })[kind] || [];
    const t0 = AC.currentTime;
    notes.forEach(([f, at, len, type]) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(type ? 0.05 : 0.18, t0 + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g); g.connect(AC.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
    });
  } catch (e) {}
}

/* ---------- тема ---------- */
const darkMQ = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme(){ const t = opt('theme'); document.documentElement.dataset.theme = t === 'auto' ? (darkMQ && darkMQ.matches ? 'dark' : 'light') : t; }
darkMQ && darkMQ.addEventListener && darkMQ.addEventListener('change', applyTheme);
applyTheme();

/* ---------- всплывашки ---------- */
function toast(icon, title, text){
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span class="ti">${icon}</span><div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
  t.addEventListener('click', () => t.remove());
  box.appendChild(t); setTimeout(() => t.classList.add('out'), 4200); setTimeout(() => t.remove(), 4700);
}

/* ---------- Диля и наряды ---------- */
const OUTFITS = [
  { k: 'glasses', name: 'Очки отличницы', xp: 100, svg: '<g fill="rgba(255,255,255,.18)" stroke="#6B2633" stroke-width="4"><circle cx="78" cy="132" r="19"/><circle cx="122" cy="132" r="19"/></g><path d="M97 130q3-4 6 0M59 128l-20-6M141 128l20-6" fill="none" stroke="#6B2633" stroke-width="4" stroke-linecap="round"/><path d="M68 121l8-4" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>' },
  { k: 'scarf', name: 'Шарфик', xp: 250, svg: '<path d="M44 166q56 22 112 0l3 17q-59 24-118 0z" fill="#8A3442"/><path d="M58 172l5 17M78 177l3 17M100 179v17M122 177l-3 17M142 172l-5 17" stroke="#F4D9D2" stroke-width="5"/><path d="M120 182l20 4-6 42-18-3z" fill="#8A3442"/><path d="M122 196l15 3M120 210l15 3" stroke="#F4D9D2" stroke-width="5"/><path d="M116 225l2 8M122 226l1 8M128 227l1 8M134 228l0 8" stroke="#8A3442" stroke-width="3" stroke-linecap="round"/>' },
  { k: 'flowers', name: 'Цветочный венок', xp: 500, svg: '<path d="M30 92Q100 20 170 92" fill="none" stroke="#7FA36B" stroke-width="5" stroke-linecap="round"/>' + [[34, 86, '#F6B7C6'], [52, 64, '#FFF3C9'], [74, 50, '#F59AB0'], [100, 45, '#FFFFFF'], [126, 50, '#F59AB0'], [148, 64, '#FFF3C9'], [166, 86, '#F6B7C6']].map(([x, y, c]) => `<g transform="translate(${x} ${y})"><circle cx="0" cy="-6" r="5.5" fill="${c}"/><circle cx="5.7" cy="-1.9" r="5.5" fill="${c}"/><circle cx="3.5" cy="4.9" r="5.5" fill="${c}"/><circle cx="-3.5" cy="4.9" r="5.5" fill="${c}"/><circle cx="-5.7" cy="-1.9" r="5.5" fill="${c}"/><circle r="3.6" fill="#F2B84B"/></g>`).join('') },
  { k: 'headphones', name: 'Наушники', xp: 900, svg: '<path d="M30 118Q24 22 100 24Q176 22 170 118" fill="none" stroke="#8A3442" stroke-width="10" stroke-linecap="round"/><rect x="12" y="98" width="28" height="48" rx="13" fill="#B84A5E"/><rect x="160" y="98" width="28" height="48" rx="13" fill="#B84A5E"/><rect x="18" y="106" width="10" height="32" rx="5" fill="#F6B7C6"/><rect x="172" y="106" width="10" height="32" rx="5" fill="#F6B7C6"/>' },
  { k: 'cap', name: 'Шапочка выпускницы', xp: 1500, svg: '<path d="M70 44h60v18q-30 10-60 0z" fill="#2E2326"/><path d="M36 38L100 14l64 24-64 24z" fill="#3A2C30"/><path d="M40 38l60 22 60-22" fill="none" stroke="#5A464B" stroke-width="2"/><path d="M100 37l46 8v26" fill="none" stroke="#E5B545" stroke-width="3"/><path d="M141 70h10l-2 16h-6z" fill="#E5B545"/><circle cx="100" cy="37" r="4" fill="#E5B545"/>' },
  { k: 'crown', name: 'Корона', xp: 2500, svg: '<path d="M66 58l-6-38 22 18 18-26 18 26 22-18-6 38z" fill="#F2C14E" stroke="#C9912A" stroke-width="3" stroke-linejoin="round"/><rect x="64" y="54" width="72" height="11" rx="4" fill="#E5A93A"/><circle cx="100" cy="42" r="5" fill="#C2566A"/><circle cx="80" cy="46" r="3.5" fill="#7FB7D9"/><circle cx="120" cy="46" r="3.5" fill="#7FB7D9"/><circle cx="60" cy="20" r="3" fill="#F2C14E"/><circle cx="140" cy="20" r="3" fill="#F2C14E"/><circle cx="100" cy="12" r="3" fill="#F2C14E"/>' },
  { k: 'hearts', name: 'Очки-сердечки', xp: 4000, svg: '<g fill="#E0475F" stroke="#8A1F35" stroke-width="2.5" opacity=".95"><path d="M78 150c-14-9-22-16-22-25 0-6 5-11 11-11 5 0 9 3 11 7 2-4 6-7 11-7 6 0 11 5 11 11 0 9-8 16-22 25z"/><path d="M122 150c-14-9-22-16-22-25 0-6 5-11 11-11 5 0 9 3 11 7 2-4 6-7 11-7 6 0 11 5 11 11 0 9-8 16-22 25z"/></g><path d="M60 122l-20-6M140 122l20-6" stroke="#8A1F35" stroke-width="3.5" stroke-linecap="round"/><path d="M64 121q4-4 9-3M108 121q4-4 9-3" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/>' }
];
function owned(k){ const o = OUTFITS.find(x => x.k === k); return !!o && (xpTotal() >= o.xp || !!(store.owned || {})[k]); }
function outfitSvg(k){ const o = OUTFITS.find(x => x.k === k); return o ? `<svg class="acc" viewBox="0 0 200 240" aria-hidden="true">${o.svg}</svg>` : ''; }
function MASCOT(mood, outfit, force){
  const f = ({ sad: 'sad', happy: 'happy', wave: 'wave', sleep: 'sleep' })[mood] || 'idle';
  const k = outfit === undefined ? store.outfit : outfit;
  return `<span class="cat catw"><img src="mascot/${f}.svg" alt="" aria-hidden="true">${k && (force || owned(k)) ? outfitSvg(k) : ''}</span>`;
}
const MASCOT_NAME = 'Диля';

/* ---------- аватарка: рамка + поза ---------- */
const FRAMES = [
  { k: 'straw', name: 'Клубничная', cond: 'есть у всех', t: () => true },
  { k: 'honey', name: 'Медовая', cond: 'серия 3 дня подряд', t: () => (store.best || 0) >= 3 },
  { k: 'mint', name: 'Мятная с лягушонком', cond: 'пройти 10 уроков', t: () => doneCount() >= 10 },
  { k: 'garden', name: 'Цветочный садик', cond: 'открыть 5 сундучков', t: () => Object.keys(store.chests || {}).length >= 5 },
  { k: 'pixel', name: 'Пиксельная', cond: 'пройти 50 уроков', t: () => doneCount() >= 50 },
  { k: 'books', name: 'Читаю!', cond: '10 тестов на максимум', t: () => Object.keys(store.perf || {}).length >= 10 },
  { k: 'sweet', name: 'Мило', cond: 'серия 30 дней подряд', t: () => (store.best || 0) >= 30 },
  { k: 'royal', name: 'Королева лиги', cond: 'попасть в топ-3 лиги недели', t: () => !!store.top3 }
];
const POSES = [
  { k: 'idle', name: 'Обычная' }, { k: 'read', name: 'Читает' }, { k: 'sleepbook', name: 'Спит на книжке' }, { k: 'love', name: 'Влюбилась' },
  { k: 'wow', name: 'Ух ты!' }, { k: 'think', name: 'Думает' }, { k: 'star', name: 'Отличница' }
];
const BGS = [{ k: '', name: 'Обычный' }, { k: 'night', name: 'Звёздная ночь' }, { k: 'sakura', name: 'Сакура' }, { k: 'winter', name: 'Зимняя сказка' }];
function frameOwned(k){ const f = FRAMES.find(x => x.k === k); return !!f && (f.t() || !!(store.ownF || {})[k]); }
function poseOwned(k){ return k === 'idle' || !!(store.ownP || {})[k]; }
function bgOwned(k){ return !k || !!(store.ownB || {})[k]; }
function myFrame(){ return frameOwned(store.frame) ? store.frame : 'straw'; }
function myPose(){ return poseOwned(store.pose) ? store.pose : 'idle'; }
function AVATAR(size, frame, pose){
  frame = frame || 'straw'; pose = POSES.some(p => p.k === pose) ? pose : 'idle';
  return `<span class="ava" style="--s:${size}px"><span class="avin"><img src="mascot/${pose}.svg" alt=""></span><img class="avf" src="img/frames/${FRAMES.some(f => f.k === frame) ? frame : 'straw'}.svg" alt=""></span>`;
}
function boostOn(){ return (store.boost || 0) > Date.now(); }
function boostLeft(){ const ms = Math.max(0, (store.boost || 0) - Date.now()); return Math.floor(ms / 60e3) + ':' + String(Math.floor(ms % 60e3 / 1e3)).padStart(2, '0'); }
setInterval(() => {
  const els = document.querySelectorAll('.boostleft');
  if (!els.length) return;
  if (!boostOn()) { els.forEach(e => e.closest('.pill') && e.closest('.pill').remove()); return; }
  els.forEach(e => e.textContent = boostLeft());
}, 1000);

/* ---------- работа над ошибками ---------- */
const STEPS = [1, 3, 7];
function addMistake(id, qi){
  store.mist = store.mist || {}; store.wrong = store.wrong || {};
  store.mist[id + ':' + qi] = { s: 0, due: addDays(today(), 1) };
  const w = store.wrong[id] = store.wrong[id] || {}; w[qi] = (w[qi] || 0) + 1;
}
function mistakes(){ return Object.keys(store.mist || {}); }
function dueMistakes(){ const t = today(); return mistakes().filter(k => dayDiff(store.mist[k].due, t) >= 0); }
function nextDueIn(){ const t = today(), ds = mistakes().map(k => dayDiff(t, store.mist[k].due)).filter(n => n > 0); return ds.length ? Math.min(...ds) : 0; }
function mistakeRight(k){
  const m = (store.mist || {})[k]; if (!m || (D && D.practice)) return false;
  m.s++;
  if (m.s >= STEPS.length) { delete store.mist[k]; store.fixed = (store.fixed || 0) + 1; return true; }
  m.due = addDays(today(), STEPS[m.s]); return false;
}
function mistakeWrong(k){ const m = (store.mist || {})[k]; if (m && !(D && D.practice)) { m.s = 0; m.due = addDays(today(), 1); } }

/* ---------- личные кабинеты ---------- */
function api(body){ return fetch(CONFIG.api, { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()); }
function stats(){
  const tests = LESSONS.filter(L => (store.lessons[L.id] || {}).test != null);
  return {
    done: READY_ORDER.filter(x => lessonDone(x.id)).length, tests: tests.length,
    got: tests.reduce((s, L) => s + store.lessons[L.id].test, 0), max: tests.reduce((s, L) => s + L.max, 0),
    streak: streak(), best: store.best || 0, xp: xpTotal(), weekXp: weekXp(), lastDay: lastActive(),
    mist: mistakes().length, fixed: store.fixed || 0, mock: (store.mocks || []).slice(-1).map(m => m.score)[0] || '', frame: myFrame(), pose: myPose()
  };
}
const SYNC = ['lessons', 'days', 'best', 'bonus', 'freezes', 'frozen', 'fzAt', 'mist', 'fixed', 'badges', 'owned', 'outfit', 'mocks', 'games', 'chests', 'spare', 'xpLog', 'gxp', 'perf', 'kindN', 'gameRight', 'ownF', 'ownP', 'ownB', 'frame', 'pose', 'pathbg', 'boost', 'top3', 'plan', 'focus', 'fxp'];
let pushTimer = null;
function push(){
  if (!CONFIG.api || !store.code) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const data = {}; SYNC.forEach(k => { if (store[k] != null) data[k] = store[k]; });
    api({ action: 'save', code: store.code, data, wrong: store.wrong || {}, stats: stats() }).catch(() => {});
  }, 1500);
}
function mergeRemote(d){
  d = d || {};
  const lessons = Object.assign({}, d.lessons || {});
  Object.keys(store.lessons).forEach(id => { const a = store.lessons[id], b = lessons[id] || {}; lessons[id] = { video: a.video || b.video, notes: a.notes || b.notes, test: Math.max(a.test == null ? -1 : a.test, b.test == null ? -1 : b.test) }; if (lessons[id].test < 0) delete lessons[id].test; });
  const obj = k => Object.assign({}, d[k] || {}, store[k] || {});
  const max = k => Math.max(store[k] || 0, d[k] || 0);
  const mocks = (d.mocks || []).concat(store.mocks || []).filter((m, i, a) => a.findIndex(x => x.d === m.d && x.score === m.score) === i).slice(-30);
  return { lessons, days: obj('days'), frozen: obj('frozen'), mist: Object.assign({}, d.mist || {}, store.mist || {}), badges: obj('badges'), owned: obj('owned'), chests: obj('chests'), games: obj('games'), xpLog: obj('xpLog'), gxp: obj('gxp'),
    perf: obj('perf'), ownF: obj('ownF'), ownP: obj('ownP'), ownB: obj('ownB'), frame: store.frame || d.frame, pose: store.pose || d.pose, pathbg: store.pathbg != null ? store.pathbg : d.pathbg, boost: max('boost'), top3: store.top3 || d.top3, plan: obj('plan'), focus: obj('focus'), fxp: obj('fxp'), kindN: max('kindN'), gameRight: max('gameRight'), best: max('best'), bonus: max('bonus'), freezes: max('freezes'), fixed: max('fixed'), spare: max('spare'), outfit: store.outfit || d.outfit, mocks };
}
function renderLogin(err){
  app.innerHTML = `
  <div class="wrap">
    <section class="card login">
      ${MASCOT('wave')}
      <p class="kicker">привет!</p>
      <h1 class="h1">Вход в личный кабинет</h1>
      <p class="lead">Введи свой личный код. Его тебе дала Диля или куратор.</p>
      <form id="lf" class="namebox" autocomplete="off">
        <input id="lc" placeholder="например, aziza-4821" aria-label="Личный код" required autocapitalize="off">
        <button class="btn btn-dark" id="lb">Войти</button>
      </form>
      ${err ? `<p class="lerr">${esc(err)}</p>` : ''}
    </section>
  </div>`;
  document.getElementById('lf').addEventListener('submit', ev => {
    ev.preventDefault();
    const code = document.getElementById('lc').value.trim().toLowerCase();
    const b = document.getElementById('lb'); b.disabled = true; b.textContent = 'Входим…';
    api({ action: 'login', code }).then(r => {
      if (!r.ok) return renderLogin(r.error || 'Не получилось войти');
      store = Object.assign({}, store, mergeRemote(r.data), { code: r.code, name: r.name, stream: r.stream || store.stream });
      store.xpPrev = xpTotal(); persist(); push(); headerUser(); route();
    }).catch(() => renderLogin('Нет связи. Проверь интернет и попробуй ещё раз.'));
  });
}
function logout(){ if (!confirm('Выйти из кабинета на этом устройстве?')) return; store = { lessons: {}, set: store.set }; persist(); headerUser(); location.hash = '#/'; route(); }
function headerUser(){
  const u = document.getElementById('me'); if (!u) return;
  u.textContent = store.code ? (store.name || '').split(' ')[0] : 'Я';
}
function firstName(){ return store.name ? store.name.split(' ')[0] : ''; }

/* =========================================================
   ГЛАВНАЯ: ТРОПИНКА
   ========================================================= */
function topbar(){
  const sk = streak(), fz = store.freezes || 0;
  return `<div class="duobar">
    <a class="pill fire${store.days && store.days[today()] ? '' : ' off'}" href="#/me" title="Серия: дней подряд">🔥 ${sk}</a>
    <a class="pill ice" href="#/me" title="Заморозки серии">❄️ ${fz}</a>
    <a class="pill xp" href="#/me" title="Опыт">⚡ ${xpTotal()}</a>
    ${boostOn() ? '<span class="pill boost" title="Двойной опыт">x2 <b class="boostleft">' + boostLeft() + '</b></span>' : ''}
  </div>`;
}
function weekReady(n){ return WEEKS[n - 1].filter(x => x.id && byId(x.id)); }
function chestState(n){ const r = weekReady(n); if ((store.chests || {})[n]) return 'open'; return r.length && r.every(x => lessonDone(x.id)) ? 'ready' : 'locked'; }
function chestSvg(open){
  return `<svg viewBox="0 0 80 70" class="chsvg" aria-hidden="true">
    <rect x="8" y="30" width="64" height="34" rx="6" fill="#B0704A"/><rect x="8" y="30" width="64" height="34" rx="6" fill="url(#chg)" opacity=".35"/>
    <rect x="8" y="44" width="64" height="6" fill="#8E5534"/><rect x="34" y="38" width="12" height="16" rx="3" fill="#F2C14E" stroke="#C9912A" stroke-width="2"/><circle cx="40" cy="45" r="2.4" fill="#6B3A22"/>
    <g class="lid"${open ? ' transform="rotate(-28 10 30)"' : ''}><path d="M8 30q0-20 32-20t32 20z" fill="#C98157"/><rect x="8" y="26" width="64" height="6" rx="2" fill="#8E5534"/></g>
    ${open ? '<g fill="#F2C14E"><path d="M40 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><circle cx="22" cy="14" r="2"/><circle cx="58" cy="12" r="2.5"/></g>' : ''}
    <defs><linearGradient id="chg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs></svg>`;
}
const OFFS = [0, 44, 74, 44, 0, -44, -74, -44];
function renderHome(){
  document.body.classList.remove('duo-test');
  const cw = curWeek(), cur = READY_ORDER.find(x => !lessonDone(x.id)) || READY_ORDER[0];
  let k = 0;
  const units = WEEKS.map((w, wi) => {
    const n = wi + 1, e = eraOfWeek(n);
    const nodes = w.map(x => {
      const L = x.id && byId(x.id), off = OFFS[k++ % OFFS.length];
      const done = L && lessonDone(L.id), isCur = cur && L && cur.id === L.id;
      const p = (L && store.lessons[L.id]) || {};
      const part = !done && L && lessonStarted(L.id);
      const icon = done ? '✓' : (/Лирика|Стих|Сонет|«[^»]*»,\s*«/.test((L ? L.title : '') + x.title) ? '✎' : '★');
      return `<div class="nodewrap" style="transform:translateX(${off}px)">
        ${isCur ? '<div class="startbub">НАЧАТЬ</div>' : ''}
        <button class="node${done ? ' done' : ''}${isCur ? ' cur' : ''}${part ? ' part' : ''}" style="--c:${eraOf(x).c}" data-id="${L ? L.id : ''}" aria-label="${esc(x.title)}">${icon}</button>
        <div class="pop" hidden>
          <p class="pl">Неделя ${n} · урок ${x.num}</p>
          <b>${esc(L ? L.title : x.title)}</b><span>${esc(L ? L.author : x.author)}</span>
          ${L ? `<div class="popbtns">
            <a href="#/lesson/${L.id}/video" class="${p.video ? 'ok' : ''}">▶ Видео ${p.video ? '✓' : L.video ? '+10' : '(скоро)'}</a>
            <a href="#/lesson/${L.id}/notes" class="${p.notes ? 'ok' : ''}">📖 Конспект ${p.notes ? '✓' : '+10'}</a>
            <a href="#/lesson/${L.id}/test" class="main">${p.test != null ? 'Тест ✓ ' + p.test + '/' + L.max : 'Тест ⚡ +XP'}</a>
          </div>` : '<p class="soonp">Скоро откроется</p>'}
        </div>
      </div>`;
    }).join('');
    const cs = chestState(n), coff = OFFS[k % OFFS.length];
    const chest = weekReady(n).length ? `<div class="nodewrap chestwrap" style="transform:translateX(${coff}px)"><button class="chest ${cs}" data-w="${n}" aria-label="Сундучок недели ${n}">${chestSvg(cs === 'open')}</button></div>` : '';
    return `<section class="unit${n === cw ? ' curu' : ''}" id="w${n}" style="--c:${e.c}">
      <div class="ubanner"><div><p>${esc(e.name)} · неделя ${n}</p><h3>${esc(weekNames(w))}</h3></div><button class="ubook" onclick="toggleWeek(${n})" aria-label="Список уроков недели">☰</button></div>
      <div class="uweek" hidden>${w.map(x => { const L = x.id && byId(x.id); return `<a ${L ? `href="#/lesson/${L.id}"` : ''}>${x.num}. ${x.author ? '<b>' + esc(x.author) + '</b> ' : ''}${esc(x.title)}</a>`; }).join('')}</div>
      <div class="nodes">${nodes}${chest}</div>
    </section>`;
  }).join('');
  const tx = todayXp(), name = firstName(), sk = streak();
  const msg = !store.days || !store.days[today()]
    ? (sk ? `${name ? name + ', с' : 'С'}егодня ты ещё не занималась. Сохрани серию ${sk} 🔥, пройди хоть один урок!` : `${name ? 'Привет, ' + name + '! ' : 'Привет! '}Начнём серию? Одного урока в день достаточно 💗`)
    : `Умница${name ? ', ' + name : ''}! Сегодня +${tx} XP. Серия ${sk} 🔥`;
  const due = dueMistakes().length, all = mistakes().length;
  const fc = forecast();
  app.innerHTML = `
  <div class="duo">
    <main class="pathcol">
      ${topbar()}
      <div class="path">${units}</div>
    </main>
    <aside class="duoside">
      ${topbar()}
      <div class="card catcard">${MASCOT(catMood())}<div><b>${MASCOT_NAME}</b><p>${esc(msg)}</p></div></div>
      <div class="card"><p class="label">Задание дня</p><h4>${tx >= GOAL ? 'Выполнено! 🎯' : 'Заработай ' + GOAL + ' XP'}</h4><div class="qbar"><i style="width:${Math.min(100, Math.round(tx / GOAL * 100))}%"></i><span>${Math.min(tx, GOAL)} / ${GOAL}</span></div></div>
      <a class="card sidelink" href="#/review"><span class="si">🩹</span><div><p class="label">Работа над ошибками</p><b>${due ? due + ' ' + plural(due, 'вопрос ждёт', 'вопроса ждут', 'вопросов ждут') : all ? 'Сегодня всё повторено' : 'Ошибок пока нет'}</b><span>${due ? 'Повтори, пока не забыла' : all ? 'Следующие вернутся через ' + nextDueIn() + ' ' + plural(nextDueIn(), 'день', 'дня', 'дней') : 'Ошибки из тестов появятся здесь'}</span></div>${due ? `<em class="dot">${due}</em>` : ''}</a>
      <a class="card sidelink" href="#/mock"><span class="si">📝</span><div><p class="label">Пробный ЕНТ</p><b>${fc ? 'Прогноз: ' + fc + ' из 50' : '40 заданий, как на экзамене'}</b><span>${fc ? 'По последним пробникам' : 'С таймером и баллом в конце'}</span></div></a>
      <a class="card sidelink" href="#/games"><span class="si">🎮</span><div><p class="label">Мини-игры</p><b>Угадай героя и другие</b><span>Минутка между уроками</span></div></a>
      <div class="card" id="league"><a class="morelink" href="#/rating">Весь рейтинг →</a><p class="label">Лига недели${store.stream ? ' · ' + esc(store.stream) + ' поток' : ''}</p><h4>⚡ ${weekXp()} XP за неделю</h4><div id="leaguel" class="boardl">${CONFIG.api && store.code ? '<p class="muted">Загружаем…</p>' : '<p class="muted">Рейтинг появится, когда включим личные кабинеты. Топ-3 недели получают корону 👑</p>'}</div></div>
      ${store.code ? '' : `<div class="card"><p class="label">Мой поток</p><div class="stream" role="group">${['2', '3'].map(s => `<button type="button" aria-pressed="${stream() === s}" onclick="setStream('${s}')">${s} поток</button>`).join('')}</div></div>`}
      <a class="card sidelink" href="#/map"><span class="si">🗺️</span><div><p class="label">Карта ЕНТ</p><b>Пройдено ${specPct()}% списка</b><span>Что уже знаешь, а что впереди</span></div></a>
    </aside>
  </div>`;
  document.querySelectorAll('.node').forEach(b => b.addEventListener('click', () => {
    const pop = b.parentElement.querySelector('.pop'), open = !pop.hidden;
    document.querySelectorAll('.pop').forEach(p => { p.hidden = true; p.parentElement.classList.remove('open'); });
    pop.hidden = open; if (!open) { b.parentElement.classList.add('open'); sfx('tap'); }
  }));
  document.querySelectorAll('.chest').forEach(b => b.addEventListener('click', () => openChest(+b.dataset.w)));
  if (CONFIG.api && store.code) loadLeague();
  setTimeout(placeHopper, 120);
  setTimeout(() => { const m = location.hash.match(/#\/w(\d+)/); const c = m ? document.getElementById('w' + m[1]) : (document.querySelector('.node.cur') || document.getElementById('w' + cw)); if (c) c.scrollIntoView({ block: m ? 'start' : 'center' }); }, 50);
}
function catMood(){
  const days = store.days || {};
  if (days[today()]) return 'happy';
  const y = new Date(Date.now() - 864e5), y2 = new Date(Date.now() - 2 * 864e5);
  if (Object.keys(days).length && !days[dkey(y)] && !days[dkey(y2)]) return 'sleep';
  return 'wave';
}
function toggleWeek(n){ const u = document.querySelector('#w' + n + ' .uweek'); if (u) u.hidden = !u.hidden; }
function loadLeague(){
  api({ action: 'board', code: store.code }).then(r => {
    const el = document.getElementById('leaguel'); if (!el || !r.ok) return;
    const list = (r.list || []).slice().sort((a, b) => (b.weekXp || 0) - (a.weekXp || 0));
    const meI = list.findIndex(x => x.me); if (meI >= 0 && meI < 3 && (list[meI].weekXp || 0) > 0 && !store.top3) { store.top3 = 1; persist(); setTimeout(checkBadges, 300); }
    el.innerHTML = list.slice(0, 10).map((x, i) => `<div class="brow${x.me ? ' mine' : ''}"><span class="bpl">${i < 3 ? '👑' : i + 1}</span>${AVATAR(34, x.me ? myFrame() : x.frame, x.me ? myPose() : x.pose)}<span class="bnm">${esc(x.name)}${x.me ? ' (ты)' : ''}</span><span class="bst">${x.weekXp || 0} XP</span><span class="bbe">🔥 ${x.streak}</span></div>`).join('') || '<p class="muted">Пока пусто. Будь первой!</p>';
  }).catch(() => {});
}

/* ---------- сундучки ---------- */
function openChest(n){
  const st = chestState(n);
  if (st === 'locked') { const left = weekReady(n).filter(x => !lessonDone(x.id)).length; toast('🔒', 'Сундучок недели ' + n + ' закрыт', 'Пройди ещё ' + left + ' ' + plural(left, 'урок', 'урока', 'уроков') + ' этой недели, и ключик Дили его откроет'); return; }
  if (st === 'open') { const r = store.chests[n]; toast('🎁', 'Уже открыт', 'Там было: ' + rewardText(r)); return; }
  const r = rollReward();
  store.chests = store.chests || {}; store.chests[n] = r;
  giveReward(r);
  save(false);
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="chestbox"><div class="bigchest">${chestSvg(false)}<svg class="key" viewBox="0 0 60 24" aria-hidden="true"><circle cx="10" cy="12" r="8" fill="none" stroke="#C9912A" stroke-width="5"/><path d="M18 12h38M46 12v8M54 12v6" stroke="#C9912A" stroke-width="5" stroke-linecap="round"/></svg></div>
    <div class="reward" hidden><div class="rbig">${rewardIcon(r)}</div><h2>${esc(rewardTitle(r))}</h2><p>${esc(rewardText(r))}</p><button class="dbtn" id="rok">Ура!</button></div></div>`;
  document.body.appendChild(ov);
  const big = ov.querySelector('.bigchest');
  setTimeout(() => big.classList.add('unlock'), 700);
  setTimeout(() => { big.classList.add('opened'); big.querySelector('.chsvg').outerHTML = chestSvg(true); sfx('chest'); }, 1500);
  setTimeout(() => { ov.querySelector('.reward').hidden = false; }, 1900);
  ov.addEventListener('click', e => { if (e.target.id === 'rok' || e.target === ov) { ov.remove(); route(); } });
}
function rollReward(){
  const opts = [];
  const add = (w, r) => opts.push([w, r]);
  add(2, { t: 'x2' });
  const lp = POSES.filter(p => !poseOwned(p.k)); if (lp.length) add(1.6, { t: 'pose', k: pick(lp).k });
  const lf = FRAMES.filter(f => !frameOwned(f.k) && f.k !== 'royal'); if (lf.length) add(1.4, { t: 'frame', k: pick(lf).k });
  const lb = BGS.filter(b => !bgOwned(b.k)); if (lb.length) add(1.2, { t: 'bg', k: pick(lb).k });
  const lo = OUTFITS.filter(o => !owned(o.k)); if (lo.length) add(.9, { t: 'outfit', k: lo[0].k });
  if ((store.freezes || 0) < 2) add(.9, { t: 'freeze' });
  add(.8, { t: 'heart' });
  add(1.2, { t: 'xp', v: pick([20, 30, 30, 50]) });
  let x = Math.random() * opts.reduce((s, o) => s + o[0], 0);
  for (const [w, r] of opts) { if ((x -= w) <= 0) return r; }
  return opts[opts.length - 1][1];
}
function giveReward(r){
  if (r.t === 'freeze') store.freezes = (store.freezes || 0) + 1;
  if (r.t === 'heart') store.spare = Math.min(3, (store.spare || 0) + 1);
  if (r.t === 'outfit') { store.owned = store.owned || {}; store.owned[r.k] = 1; }
  if (r.t === 'xp') addBonus(r.v);
  if (r.t === 'x2') store.boost = Math.max(Date.now(), store.boost || 0) + 15 * 60e3;
  if (r.t === 'pose') { store.ownP = store.ownP || {}; store.ownP[r.k] = 1; }
  if (r.t === 'frame') { store.ownF = store.ownF || {}; store.ownF[r.k] = 1; }
  if (r.t === 'bg') { store.ownB = store.ownB || {}; store.ownB[r.k] = 1; }
}
function rewardIcon(r){
  if (r.t === 'x2') return '<span class="rx2">x2</span>';
  if (r.t === 'pose') return `<img class="rpose" src="mascot/${r.k}.svg" alt="">`;
  if (r.t === 'frame') return AVATAR(130, r.k, myPose());
  if (r.t === 'bg') return `<span class="rbg bgsw-${r.k}"></span>`;
 return r.t === 'freeze' ? '❄️' : r.t === 'heart' ? '❤️' : r.t === 'outfit' ? MASCOT('happy', r.k, true) : '⚡'; }
function rewardTitle(r){ if (r.t === 'x2') return 'Двойной опыт!'; if (r.t === 'pose') return 'Новая Диля: ' + ((POSES.find(p => p.k === r.k) || {}).name || ''); if (r.t === 'frame') return 'Новая рамка!'; if (r.t === 'bg') return 'Новый фон для тропинки!'; return r.t === 'freeze' ? 'Заморозка серии!' : r.t === 'heart' ? 'Запасное сердечко!' : r.t === 'outfit' ? 'Новый наряд для Дили!' : '+' + r.v + ' XP!'; }
function rewardText(r){
  if (!r) return '';
  if (r.t === 'freeze') return 'Если пропустишь день, серия не сгорит';
  if (r.t === 'heart') return 'Сработает само, когда в тесте закончатся сердечки';
  if (r.t === 'outfit') { const o = OUTFITS.find(x => x.k === r.k); return (o ? o.name : 'Наряд') + '. Надень его в профиле'; }
  if (r.t === 'x2') return '15 минут весь опыт удваивается. Скорее проходи урок!';
  if (r.t === 'pose') return 'Поставь её на аватарку в профиле';
  if (r.t === 'frame') return ((FRAMES.find(f => f.k === r.k) || {}).name || '') + '. Выбери её в профиле';
  if (r.t === 'bg') return ((BGS.find(b => b.k === r.k) || {}).name || '') + '. Включи его в профиле';
  return 'Бонусный опыт в копилку';
}

/* ---------- Диля прыгает по кружочкам ---------- */
let hopBusy = false;
function nodePos(n, path){ const r = n.getBoundingClientRect(), p = path.getBoundingClientRect(); return { x: r.left - p.left + r.width / 2, y: r.top - p.top }; }
function setHop(el, pt){ el.style.transform = `translate(${pt.x - 34}px, ${pt.y - 58}px)`; }
function placeHopper(){
  const path = document.querySelector('.path'); if (!path) return;
  const nodes = [...path.querySelectorAll('.node[data-id]')].filter(n => n.dataset.id);
  const cur = path.querySelector('.node.cur') || nodes[0]; if (!cur) return;
  let el = document.getElementById('hopper');
  if (!el) {
    el = document.createElement('div'); el.id = 'hopper'; el.className = 'hopper';
    el.innerHTML = MASCOT('wave') + '<span class="hopsay" hidden></span>';
    el.addEventListener('click', () => {
      if (hopBusy) return; el.animate([{ marginTop: '0px' }, { marginTop: '-26px' }, { marginTop: '0px' }], { duration: 420, easing: 'ease-out' });
      const say = el.querySelector('.hopsay'); say.textContent = pick(['Вперёд! 💗', 'Ты умничка!', 'Ещё один урок?', 'Я в тебя верю ✨', 'Сундучок ждёт! 🗝️']); say.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => say.hidden = true, 1800);
    });
    path.appendChild(el);
  }
  const img = el.querySelector('img');
  const ci = nodes.indexOf(cur), pi = nodes.findIndex(n => n.dataset.id === store.mascotAt);
  const finish = () => { setHop(el, nodePos(cur, path)); img.src = 'mascot/wave.svg'; hopBusy = false; store.mascotAt = cur.dataset.id; persist(); };
  if (pi < 0 || pi >= ci || !el.animate) { finish(); return; }
  const start = Math.max(pi, ci - 6), steps = nodes.slice(start, ci + 1).map(n => nodePos(n, path));
  hopBusy = true; setHop(el, steps[0]); img.src = 'mascot/happy.svg';
  nodes[start].scrollIntoView({ block: 'center' });
  let k = 0;
  const hop = () => {
    if (k >= steps.length - 1) { finish(); el.animate([{ transform: el.style.transform + ' scale(1.15,.85)' }, { transform: el.style.transform }], { duration: 260, easing: 'ease-out' }); return; }
    const a = steps[k], b = steps[k + 1], top = Math.min(a.y, b.y) - 70;
    const T = (x, y, sx, sy) => `translate(${x - 34}px, ${y - 58}px) scale(${sx},${sy})`;
    const anim = el.animate([{ transform: T(a.x, a.y, 1.12, .88) }, { transform: T((a.x + b.x) / 2, top, .92, 1.1), offset: .5 }, { transform: T(b.x, b.y, 1.1, .9) }], { duration: 520, easing: 'ease-in-out' });
    setTimeout(() => { anim.cancel && anim.cancel(); setHop(el, b); k++; nodes[start + k].scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(hop, 90); }, 520);
  };
  setTimeout(hop, 500);
}
window.addEventListener('resize', () => { if (!hopBusy && document.getElementById('hopper')) { const path = document.querySelector('.path'), cur = path && path.querySelector('.node.cur'); cur && setHop(document.getElementById('hopper'), nodePos(cur, path)); } });

/* =========================================================
   УРОК: видео и конспект
   ========================================================= */
function renderLesson(id, tab){
  const M = byId(id); if (!M) { location.hash = '#/'; return; }
  if (!LCACHE[id]) { loader('Открываю урок…'); loadLesson(id).then(() => { if (location.hash.indexOf(id) >= 0) renderLesson(id, tab); }).catch(loadFail); return; }
  const L = LCACHE[id];
  tab = tab === 'notes' ? 'notes' : 'video';
  const p = store.lessons[L.id] || {};
  const x = ALL.find(a => a.id === id);
  const side = (WEEKS[L.week - 1] || []).map(x => {
    const R = x.id && byId(x.id);
    if (!R) return `<div class="sidesoon"><span class="dot">${x.num}</span><span style="line-height:1.25">${esc(x.title)}<br><small>скоро</small></span></div>`;
    const ok = lessonDone(R.id);
    return `<a href="#/lesson/${R.id}" class="${R.id === L.id ? 'cur' : ''}"><span class="dot${ok ? ' ok' : ''}">${ok ? '✓' : x.num}</span><span style="font-weight:600;line-height:1.25">${esc(R.title)}</span></a>`;
  }).join('');
  const tabs = [['video', 'Видеоурок'], ['notes', 'Конспект'], ['test', 'Тест']]
    .map(([k, t]) => `<a class="tab btn" role="tab" aria-selected="${k === tab}" href="#/lesson/${L.id}/${k}">${t}</a>`).join('');
  app.innerHTML = `
  <div class="wrap lesson-layout">
    <aside class="card"><p class="label" style="margin-bottom:10px">Неделя ${L.week}</p>${side}<a href="#/map" style="margin-top:6px;font-size:14px;font-weight:700">Карта курса →</a></aside>
    <main class="lesson">
      <div class="card lhead">
        <div class="tape ${L.tape}" aria-hidden="true" style="top:-12px;right:36px;width:150px;transform:rotate(4deg)"></div>
        ${x ? '<div style="margin-bottom:8px">' + eraBadge(eraOf(x)) + '</div>' : ''}
        <p class="label">Неделя ${L.week} · Урок ${L.num} · ${esc(L.author)}</p>
        <h1 class="h1">${esc(L.title)}</h1>
        <p class="script" style="margin:2px 0 0;font-size:30px">${esc(L.subtitle)}</p>
        <div class="tabs" role="tablist">${tabs}</div>
      </div>
      ${tab === 'video' ? videoHtml(L, p) : notesHtml(L)}
    </main>
  </div>`;
  if (tab === 'video') document.getElementById('watched').addEventListener('click', () => { prog(L.id).video = true; save(); sfx('right'); location.hash = '#/lesson/' + L.id + '/notes'; });
  else {
    document.getElementById('read').addEventListener('click', () => { prog(L.id).notes = true; save(); sfx('right'); location.hash = '#/lesson/' + L.id + '/test'; });
    document.getElementById('print').addEventListener('click', () => window.print());
  }
}
function videoHtml(L, p){
  const id = ytId(L.video);
  const player = id
    ? `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0" title="Видеоурок: ${esc(L.title)}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`
    : `<div class="video"><div>${MASCOT('wave')}<p style="margin:10px 0 0;font-weight:600">Видеоурок скоро появится</p></div></div>`;
  return `<div class="card">${player}
    <div class="rowend"><p style="margin:0;color:var(--muted)">${p.video ? '✓ Ты уже посмотрела этот урок' : id ? 'Посмотрела? Отметь и переходи к конспекту' : 'Пока видео нет, можно сразу читать конспект'}</p>
    <button class="btn btn-dark" id="watched">${id ? 'Просмотрено → Конспект' : 'К конспекту →'}</button></div></div>`;
}
function figs(list){
  if (!list || !list.length) return '';
  return `<div class="figs">${list.map(([src, cap]) => `<figure><img src="${esc(src)}" alt="${esc(cap || '')}" loading="lazy" onerror="this.closest('figure').remove()">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`).join('')}</div>`;
}
const HCOL = ['#6B2633', '#7B5848', '#B5606C', '#9C6B5E', '#8A3A47', '#C98B93', '#5E3A33'];
function heroesHtml(list){ return `<div class="heroes">${list.map(([n, t, img], i) => `<div class="hc" style="border-top-color:${HCOL[i % 7]}">${img ? `<img src="${esc(img)}" alt="${esc(n)}" loading="lazy" onerror="this.remove()">` : ''}<b>${esc(n)}</b>${t ? `<p>${esc(t)}</p>` : ''}</div>`).join('')}</div>`; }
function itemHtml(it){
  if (it.p) { const m = it.p.match(/^((?:Действие|Песнь|Глава) [IVX\d]+\.(?: «[^»]+»\.)?|(?:Послесловие издателя|Заключение|Экспозиция и завязка|Развитие действия|Кульминация|Развязка)\.)\s/);
    return m ? `<p><b class="lead">${esc(m[1])}</b> ${esc(it.p.slice(m[0].length))}</p>` : `<p>${esc(it.p)}</p>`; }
  if (it.note) return `<div class="note">${esc(it.note)}</div>`;
  if (it.h3) return `<h3 class="h3">${esc(it.h3)}</h3>`;
  if (it.verse) return `<div class="verse">${esc(it.verse)}</div>`;
  if (it.quote) return `<div class="quote">${esc(it.quote)}</div>`;
  if (it.figs) return figs(it.figs);
  if (it.heroes) return heroesHtml(it.heroes);
  if (it.list) return `<ul class="blist">${it.list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  if (it.steps) return `<ol class="bsteps">${it.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  if (it.terms) return `<div class="terms">${it.terms.map(([t, d, e]) => `<div class="term"><b>${esc(t)}</b>${d ? `<p>${esc(d)}</p>` : ''}${e ? `<p class="ex"><span>Пример:</span> ${esc(e)}</p>` : ''}</div>`).join('')}</div>`;
  if (it.table) return `<div class="tbl"><table><thead><tr>${it.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${it.table.rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return '';
}
function notesHtml(L){
  return `
  <div id="konspekt">
  <div class="print-only print-head"><b>dilya.litra</b> · литература к ЕНТ</div>
  <h1 class="print-only print-title">${esc(L.title)}</h1>
  <p class="print-only print-sub">${esc(L.author)} · ${esc(L.subtitle)}</p>
  ${L.facts ? `<div class="facts">${L.facts.map(([k, v]) => `<div class="card"><p class="label">${esc(k)}</p><p>${esc(v)}</p></div>`).join('')}</div>` : ''}
  ${(L.blocks || []).map(b => `<section class="card notes"><h2 class="h2">${esc(b.h)}</h2>${b.items.map(itemHtml).join('')}</section>`).join('')}
  </div>
  <div class="noprint notefoot">
    <button class="btn btn-light" id="print">Скачать конспект (PDF)</button>
    <button class="btn btn-dark" id="read">Прочитала → Тест</button>
    <p>Чтобы сохранить PDF: в окне печати в поле «Принтер» выбери «Сохранить как PDF» и нажми «Сохранить». Бумага не нужна, файл просто сохранится.</p>
  </div>`;
}

/* =========================================================
   ТЕСТ ПО ОДНОМУ ВОПРОСУ (урок и работа над ошибками)
   ========================================================= */
let D = null;
function startRun(o){
  D = Object.assign({ i: 0, hearts: 5, got: 0, right: 0, ans: null, checked: false, picked: null, pairs: {}, shuf: null, fixedNow: 0, wrongNow: 0 }, o);
  document.body.classList.add('duo-test');
  drawDuo();
}
function renderDuoTest(id){
  if (!byId(id)) { location.hash = '#/'; return; }
  if (!LCACHE[id]) { loader('Готовлю тест…'); loadLesson(id).then(() => renderDuoTest(id)).catch(loadFail); return; }
  const L = LCACHE[id];
  if (!L.questions || !L.questions.length) { location.hash = '#/lesson/' + id + '/notes'; return; }
  startRun({ mode: 'lesson', L, items: L.questions.map((q, qi) => ({ L, qi, q })) });
}
function duoKind(q){ return q.ctx ? 'Прочитай отрывок и ответь' : q.type === 'one' ? 'Выбери правильный ответ' : q.type === 'many' ? 'Выбери все правильные (от 1 до 3)' : 'Составь пары'; }
function qScore(q, a){
  if (a == null) return 0;
  if (q.type === 'one') return a[0] === q.right[0] ? 1 : 0;
  if (q.type === 'many') { let err = 0; q.opts.forEach((_, i) => { if ((a.indexOf(i) >= 0) !== (q.right.indexOf(i) >= 0)) err++; }); return err === 0 ? 2 : (err === 1 ? 1 : 0); }
  if (q.type === 'match') return q.pairs.reduce((s, p, i) => s + (a[i] === p[1] ? 1 : 0), 0);
  return 0;
}
function duoScore(q){ if (q.type === 'match') return q.pairs.reduce((s, p, pi) => s + (D.shuf[D.pairs[pi]] === p[1] ? 1 : 0), 0); return qScore(q, D.ans); }
function drawDuo(){
  const it = D.items[D.i], q = it.q, n = D.items.length, i = D.i;
  let body = '';
  if (q.type === 'one' || q.type === 'many') {
    body = `<div class="dopts">${q.opts.map((o, oi) => {
      const sel = D.ans && D.ans.includes(oi), r = q.right.includes(oi);
      let c = 'dopt'; if (sel) c += ' sel'; if (D.checked && r) c += ' r'; if (D.checked && sel && !r) c += ' w';
      return `<button class="${c}" data-o="${oi}" ${D.checked ? 'disabled' : ''}><span class="dk">${oi + 1}</span>${esc(o)}</button>`;
    }).join('')}</div>`;
  } else {
    if (!D.shuf) D.shuf = mix(q.pairs.map(p => p[1]));
    body = `<div class="dmatch"><div class="mcol">${q.pairs.map((p, pi) => {
      const pr = D.pairs[pi] != null; let c = 'mb'; if (D.picked === pi) c += ' sel'; if (pr) c += ' used';
      if (D.checked) c += D.shuf[D.pairs[pi]] === p[1] ? ' r' : ' w';
      return `<button class="${c}" data-l="${pi}" ${D.checked ? 'disabled' : ''}>${esc(p[0])}${pr ? `<small>→ ${esc(D.shuf[D.pairs[pi]])}</small>` : ''}</button>`;
    }).join('')}</div><div class="mcol">${D.shuf.map((v, vi) => {
      const used = Object.values(D.pairs).includes(vi);
      return `<button class="mb${used ? ' used' : ''}" data-r="${vi}" ${D.checked || used ? 'disabled' : ''}>${esc(v)}</button>`;
    }).join('')}</div></div>`;
  }
  const ready = q.type === 'match' ? Object.keys(D.pairs).length === q.pairs.length : D.ans && D.ans.length;
  let sheet = '';
  if (D.checked) {
    const s = duoScore(q), m = qPoints(q), ok = s === m;
    const rightTxt = q.type === 'match' ? q.pairs.map(p => p[0] + ' → ' + p[1]).join('; ') : q.right.map(r => q.opts[r]).join('; ');
    const extra = D.mode === 'review' ? (ok ? (D.lastFixed ? ' Ошибка исправлена навсегда ✨' : ' Вернётся ещё раз для закрепления') : ' Повторим завтра') : '';
    sheet = `<div class="sheet ${ok ? 'good' : 'bad'}"><div class="sin"><div class="sheetcat">${MASCOT(ok ? 'happy' : 'sad')}</div><div style="flex:1"><b>${ok ? ['Отлично!', 'Верно!', 'Умница!', 'Так держать!'][i % 4] : s ? 'Почти! +' + s + ' из ' + m : 'Не совсем'}</b>${ok ? '' : `<p>Правильно: ${esc(rightTxt)}</p>`}${extra ? `<p>${esc(extra)}</p>` : ''}</div><button class="dbtn" id="dnext">Продолжить</button></div></div>`;
  }
  const top = D.mode === 'review'
    ? `<span class="dhearts rev">🩹 ${i + 1}/${n}</span>`
    : `<span class="dhearts">❤️ ${Math.max(D.hearts, 0)}${store.spare ? `<small> +${store.spare}</small>` : ''}</span>`;
  app.innerHTML = `
  <div class="dtest">
    <div class="dtop"><a class="dx" href="${D.mode === 'review' ? '#/review' : '#/'}" aria-label="Выйти">✕</a><div class="dprog"><i style="width:${Math.round((i + (D.checked ? 1 : 0)) / n * 100)}%"></i></div>${top}</div>
    <div class="dq">
      <p class="dkind">${duoKind(q)}${D.mode === 'review' ? ` · <span class="from">${esc(it.L.title)}</span>` : ''}</p>
      ${q.ctx ? `<div class="dctx">${esc(q.ctx)}</div>` : ''}
      <h2>${esc(q.text)}</h2>
      ${body}
    </div>
    ${D.checked ? sheet : `<div class="dfoot"><div class="sin"><span class="muted">${i + 1} из ${n}</span><button class="dbtn" id="dcheck" ${ready ? '' : 'disabled'}>Проверить</button></div></div>`}
  </div>`;
  app.querySelectorAll('.dopt').forEach(b => b.addEventListener('click', () => {
    const oi = +b.dataset.o;
    if (q.type === 'one') D.ans = [oi]; else { D.ans = D.ans || []; D.ans = D.ans.includes(oi) ? D.ans.filter(x => x !== oi) : D.ans.concat(oi); }
    drawDuo();
  }));
  app.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => { const l = +b.dataset.l; if (D.pairs[l] != null) delete D.pairs[l]; D.picked = l; drawDuo(); }));
  app.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => { if (D.picked == null) return; D.pairs[D.picked] = +b.dataset.r; D.picked = null; drawDuo(); }));
  const c = document.getElementById('dcheck'); c && c.addEventListener('click', duoCheck);
  const nx = document.getElementById('dnext'); nx && nx.addEventListener('click', duoNext);
  if (D.checked && nx) nx.focus();
}
function duoCheck(){
  const it = D.items[D.i], q = it.q;
  const ready = q.type === 'match' ? Object.keys(D.pairs).length === q.pairs.length : D.ans && D.ans.length;
  if (!ready || D.checked) return;
  D.checked = true; const s = duoScore(q), ok = s === qPoints(q); D.got += s; D.lastFixed = false;
  const k = it.L.id + ':' + it.qi;
  if (ok) { D.right++; sfx('right'); if (D.mode === 'review') { D.lastFixed = mistakeRight(k); if (D.lastFixed) D.fixedNow++; } }
  else {
    sfx('wrong'); D.wrongNow++;
    if (D.mode === 'review') mistakeWrong(k); else { addMistake(it.L.id, it.qi); D.hearts--; }
    if (D.mode === 'lesson' && D.hearts <= 0 && store.spare > 0) { store.spare--; D.hearts = 1; setTimeout(() => toast('❤️', 'Запасное сердечко спасло тест!', 'Осталось запасных: ' + store.spare), 300); }
  }
  persist(); drawDuo();
}
function duoNext(){
  if (D.mode === 'lesson' && D.hearts <= 0) return drawRefill();
  if (D.i + 1 >= D.items.length) return D.mode === 'review' ? drawReviewEnd() : drawDuoEnd(true);
  D.i++; D.ans = null; D.checked = false; D.picked = null; D.pairs = {}; D.shuf = null; drawDuo();
}
document.addEventListener('keydown', e => {
  if (!D || !document.body.classList.contains('duo-test') || !document.querySelector('.dtest .dq')) return;
  if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName)) return;
  const q = D.items[D.i].q;
  if (e.key === 'Enter') { e.preventDefault(); D.checked ? duoNext() : duoCheck(); return; }
  const n = +e.key; if (!D.checked && n >= 1 && q.opts && n <= q.opts.length) { const b = app.querySelector(`.dopt[data-o="${n - 1}"]`); b && b.click(); }
});
function confetti(){ return '<div class="confetti" aria-hidden="true">' + Array.from({ length: 40 }, (_, k) => `<i style="left:${(k * 37) % 100}%;animation-delay:${(k % 10) * .15}s;background:${['#6B2633', '#D9A3AA', '#B0704A', '#F1D6D4', '#A9823A'][k % 5]}"></i>`).join('') + '</div>'; }
function drawDuoEnd(win){
  const L = D.L, max = L.max, before = xpTotal();
  if (win) { const p = prog(L.id); const first = p.test == null; if (first || D.got > p.test) p.test = D.got; if (D.got === max) (store.perf = store.perf || {})[L.id] = 1; save(); D.xp = xpTotal() - before; sfx('done'); }
  const acc = Math.round(D.right / D.items.length * 100);
  const nxt = READY_ORDER[READY_ORDER.findIndex(x => x.id === L.id) + 1];
  app.innerHTML = `
  <div class="dtest dend">
    ${win ? confetti() : ''}
    <div class="endbox">
      ${MASCOT(win ? 'happy' : 'sad')}
      <h2>${win ? (D.got === max ? 'Идеально! 💯' : 'Урок пройден!') : 'Сердечки закончились 💔'}</h2>
      <p>${win ? esc(L.title) : 'Ничего страшного! Повтори конспект и попробуй ещё раз.'}</p>
      ${win ? `<div class="endstats"><div><span>Опыт</span><b>⚡ ${D.xp || 0}</b></div><div><span>Баллы</span><b>🎯 ${D.got}/${max}</b></div><div><span>Точность</span><b>💯 ${acc}%</b></div></div>` : ''}
      ${win && D.wrongNow ? `<p class="endnote">🩹 ${D.wrongNow} ${plural(D.wrongNow, 'вопрос попал', 'вопроса попали', 'вопросов попали')} в «Работу над ошибками». Диля напомнит повторить их завтра.</p>` : ''}
      <div class="endbtns">
        ${win ? `${nxt ? `<a class="dbtn" href="#/lesson/${nxt.id}">Следующий урок →</a>` : ''}<a class="dbtn ${nxt ? 'ghost' : ''}" href="#/">На тропинку</a>` : `<button class="dbtn" onclick="renderDuoTest('${L.id}')">Начать заново</button><a class="dbtn ghost" href="#/lesson/${L.id}/notes">К конспекту</a>`}
      </div>
    </div>
  </div>`;
}

/* ---------- вернуть сердечки добрыми словами ---------- */
const BAD_WORDS = /(^|\s)не(\s|$)|плох|туп|глуп|дур|ужас|ненавиж|никчем|бездар|урод|отстой|не могу|не умею|хуже/i;
const PRAISE_IDEAS = ['Я умная и всё смогу', 'Я молодец, что учусь каждый день', 'У меня всё получится на ЕНТ', 'Я стараюсь, и это главное', 'Я красивая и талантливая'];
function drawRefill(msg, ok){
  D.praises = D.praises || [];
  const n = Math.max(D.hearts, 0);
  app.innerHTML = `
  <div class="dtest dend">
    <div class="refill">
      ${MASCOT(n ? 'happy' : 'sad')}
      <h2>${n ? 'Сердечко вернулось! 💗' : 'Сердечки закончились 💔'}</h2>
      <p>${n ? 'Можешь продолжать тест или написать ещё, чтобы вернуть больше сердечек.' : 'Не расстраивайся! Сердечки возвращаются от добрых слов. Напиши что-нибудь хорошее о себе, и Диля вернёт тебе сердечко.'}</p>
      <div class="hearts5">${[0, 1, 2, 3, 4].map(i => `<span class="${i < n ? 'on' : ''}">❤️</span>`).join('')}</div>
      <form class="praise" id="pf" autocomplete="off">
        <input id="pi" placeholder="Например: я умная и всё смогу" maxlength="120" aria-label="Добрые слова о себе">
        <button class="dbtn" ${n >= 5 ? 'disabled' : ''}>💗</button>
      </form>
      <p class="pmsg ${ok ? 'ok' : 'no'}">${msg || ''}</p>
      ${n ? '' : `<div class="chips">${PRAISE_IDEAS.map(t => `<button type="button" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>`}
      ${D.praises.length ? `<div class="mykind"><b>Твои добрые слова:</b><br>${D.praises.map(esc).join('<br>')}</div>` : ''}
      <div class="endbtns">
        ${n ? '<button class="dbtn" id="dgo">Продолжить тест</button>' : ''}
        <a class="dbtn ghost" href="#/lesson/${D.L.id}/notes">Повторить конспект</a>
      </div>
    </div>
  </div>`;
  const inp = document.getElementById('pi');
  app.querySelectorAll('.chips button').forEach(b => b.addEventListener('click', () => { inp.value = b.dataset.t; inp.focus(); }));
  document.getElementById('pf').addEventListener('submit', ev => {
    ev.preventDefault();
    const t = inp.value.trim().replace(/\s+/g, ' ');
    const letters = (t.match(/[а-яёa-zәғқңөұүһі]/gi) || []).length;
    if (D.hearts >= 5) return drawRefill('Все сердечки уже на месте 💗', true);
    if (letters < 8 || t.split(' ').length < 2) return drawRefill('Напиши чуть подробнее, хотя бы пару слов 💗', false);
    if (BAD_WORDS.test(' ' + t + ' ')) return drawRefill('Ой, тут что-то грустное. Давай только по-доброму, без «не» 💗', false);
    if (D.praises.some(x => x.toLowerCase() === t.toLowerCase())) return drawRefill('Это ты уже писала. Придумай что-то новое о себе ✨', false);
    D.praises.push(t); D.hearts = Math.min(5, Math.max(D.hearts, 0) + 1); sfx('right');
    store.kind = (store.kind || []).concat(t).slice(-50); store.kindN = (store.kindN || 0) + 1; save(false);
    drawRefill(['Правда! Ты такая 💗', 'Диля согласна на все 100% ✨', 'Запомни это! 🥰', 'Абсолютно верно 💗'][D.praises.length % 4], true);
  });
  const go = document.getElementById('dgo');
  go && go.addEventListener('click', () => {
    if (D.i + 1 >= D.items.length) return drawDuoEnd(true);
    D.i++; D.ans = null; D.checked = false; D.picked = null; D.pairs = {}; D.shuf = null; drawDuo();
  });
}

/* =========================================================
   РАБОТА НАД ОШИБКАМИ
   ========================================================= */
function renderReview(){
  const due = dueMistakes(), all = mistakes();
  const byLesson = {}; all.forEach(k => { const id = k.split(':')[0]; byLesson[id] = (byLesson[id] || 0) + 1; });
  const list = Object.keys(byLesson).map(id => byId(id)).filter(Boolean);
  app.innerHTML = `
  <div class="wrap page">
    <section class="card pagehead">
      ${MASCOT(due.length ? 'wave' : 'happy')}
      <div><p class="label">Интервальное повторение</p><h1 class="h1">Работа над ошибками</h1>
      <p class="lead">Каждый вопрос, где ты ошиблась, вернётся через 1 день, потом через 3 и через 7. Ответишь верно три раза подряд, и ошибка исправлена навсегда.</p></div>
    </section>
    <div class="revgrid">
      <div class="card revmain">
        ${due.length ? `<p class="big">${due.length} <small>${plural(due.length, 'вопрос ждёт', 'вопроса ждут', 'вопросов ждут')}</small></p><button class="dbtn" id="rgo">Повторить сейчас</button>`
          : all.length ? `<p class="big">✨ <small>на сегодня всё</small></p><p class="muted">Следующие вопросы вернутся через ${nextDueIn()} ${plural(nextDueIn(), 'день', 'дня', 'дней')}.</p><button class="dbtn ghost" id="rall">Повторить всё заранее (${all.length})</button>`
          : `<p class="big">0 <small>ошибок</small></p><p class="muted">Когда в тесте ошибёшься, вопрос появится здесь. Ошибаться не страшно, страшно не повторять 💗</p>`}
      </div>
      <div class="card"><p class="label">Исправлено навсегда</p><p class="big">${store.fixed || 0}</p><p class="muted">${plural(store.fixed || 0, 'ошибка', 'ошибки', 'ошибок')} больше не вернётся</p></div>
    </div>
    ${list.length ? `<div class="card"><p class="label">По урокам</p><div class="revlist">${list.map(L => `<a href="#/lesson/${L.id}/notes"><b>${esc(L.title)}</b><span>${esc(L.author)}</span><em>${byLesson[L.id]}</em></a>`).join('')}</div></div>` : ''}
  </div>`;
  const go = document.getElementById('rgo'), ga = document.getElementById('rall');
  go && go.addEventListener('click', () => startReview(due, true));
  ga && ga.addEventListener('click', () => startReview(all, false));
}
function startReview(keys, real){
  keys = mix(keys).slice(0, 20);
  const ids = [...new Set(keys.map(k => k.split(':')[0]))];
  loader('Собираю вопросы…');
  loadMany(ids).then(() => {
    const items = keys.map(k => { const [id, qi] = k.split(':'); const L = LCACHE[id]; return L && L.questions[+qi] ? { L, qi: +qi, q: L.questions[+qi] } : null; }).filter(Boolean);
    if (!items.length) { renderReview(); return; }
    startRun({ mode: 'review', practice: !real, items, L: items[0].L });
  }).catch(loadFail);
}
function drawReviewEnd(){
  const gain = D.right * 2; addBonus(gain); save(); sfx('done');
  app.innerHTML = `
  <div class="dtest dend">${confetti()}
    <div class="endbox">${MASCOT('happy')}
      <h2>Повторение окончено!</h2><p>Ты молодец, что возвращаешься к трудным вопросам</p>
      <div class="endstats"><div><span>Верно</span><b>✅ ${D.right}/${D.items.length}</b></div><div><span>Исправлено</span><b>✨ ${D.fixedNow}</b></div><div><span>Опыт</span><b>⚡ ${gain}</b></div></div>
      <div class="endbtns"><a class="dbtn" href="#/">На тропинку</a><a class="dbtn ghost" href="#/review">К ошибкам</a></div>
    </div>
  </div>`;
}
