/* =========================================================
   dilya.litra: планер дня + таймер фокуса
   Дела хранятся в store.plan, минуты фокуса в store.focus.
   Уведомления: каждое дело можно одной кнопкой отправить
   в свой Google Календарь (или весь день в календарь телефона),
   и календарь сам пришлёт напоминание.
   ========================================================= */
'use strict';

const PCOLORS = [['burg', '#8A3442'], ['rose', '#D9788B'], ['peach', '#E39A6E'], ['sage', '#6E9A72'], ['lav', '#9A7BB8'], ['sky', '#5F8FB8']];
const FOCUS_XP_DAY = 30; // максимум XP за фокус в день (1 XP за 5 минут)
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function pcolor(k){ return (PCOLORS.find(c => c[0] === k) || PCOLORS[0])[1]; }
function toMin(t){ const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function fromMin(m){ m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
function durMin(b){ let d = toMin(b.e) - toMin(b.s); if (d <= 0) d += 1440; return d; }
function fmtDur(m){ m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? (h + ' ч' + (r ? ' ' + r + ' мин' : '')) : r + ' мин'; }
function dayPlan(dk){ store.plan = store.plan || {}; return store.plan[dk] = store.plan[dk] || []; }
function sortedPlan(dk){ return dayPlan(dk).slice().sort((a, b) => toMin(a.s) - toMin(b.s)); }
function findBlock(dk, id){ return dayPlan(dk).find(b => b.id === id); }
function blockDone(b){ return b.subs && b.subs.length ? b.subs.every(s => s.d) : !!b.done; }
function planSave(){ const p = store.plan || {}; Object.keys(p).forEach(k => { if (!p[k].length || dayDiff(k, today()) > 45) delete p[k]; }); persist(); push(); }
function dateAt(dk, hhmm){ const d = parseKey(dk); const m = toMin(hhmm); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; }
function endAt(dk, b){ return new Date(dateAt(dk, b.s).getTime() + durMin(b) * 60000); }
function focusToday(){ return (store.focus || {})[today()] || 0; }
function focusWeek(){ const f = store.focus || {}, d = new Date(), day = (d.getDay() + 6) % 7; let s = 0; for (let i = 0; i <= day; i++) s += f[dkey(new Date(Date.now() - i * 864e5))] || 0; return s; }
function prettyDay(dk){ const d = parseKey(dk), diff = dayDiff(today(), dk); const w = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'][d.getDay()]; return (diff === 0 ? 'Сегодня' : diff === 1 ? 'Завтра' : diff === -1 ? 'Вчера' : w[0].toUpperCase() + w.slice(1)) + ', ' + d.getDate() + ' ' + MON[d.getMonth()]; }

/* ---------- календари ---------- */
function pad2(n){ return String(n).padStart(2, '0'); }
function gStamp(d){ return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00'; }
function uStamp(d){ return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + '00Z'; }
function blockDetails(b){ return (b.subs && b.subs.length ? b.subs.map(s => '• ' + s.t).join('\n') + '\n\n' : '') + 'Мой планер dilya.litra: ' + location.origin + location.pathname + '#/plan'; }
function gcalUrl(dk, b){
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + '&text=' + encodeURIComponent(b.t)
    + '&dates=' + gStamp(dateAt(dk, b.s)) + '/' + gStamp(endAt(dk, b))
    + (tz ? '&ctz=' + encodeURIComponent(tz) : '')
    + '&details=' + encodeURIComponent(blockDetails(b));
}
function icsEsc(s){ return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
function icsFor(dk, list){
  const now = uStamp(new Date());
  const ev = list.map(b => ['BEGIN:VEVENT', 'UID:' + dk + '-' + b.id + '@dilya-litra', 'DTSTAMP:' + now,
    'DTSTART:' + uStamp(dateAt(dk, b.s)), 'DTEND:' + uStamp(endAt(dk, b)),
    'SUMMARY:' + icsEsc(b.t), 'DESCRIPTION:' + icsEsc(blockDetails(b)),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(b.t), 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//dilya.litra//planner//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'].concat(ev, ['END:VCALENDAR']).join('\r\n');
}
function exportDay(dk){
  const list = sortedPlan(dk); if (!list.length) { toast('📅', 'План пустой', 'Сначала добавь хотя бы одно дело'); return; }
  const name = 'plan-' + dk + '.ics', blob = new Blob([icsFor(dk, list)], { type: 'text/calendar;charset=utf-8' });
  try {
    const file = new File([blob], name, { type: 'text/calendar' });
    if (isStandalone() && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Мой план' }).catch(() => {}); return; }
  } catch (e) {}
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast('📲', 'Открой файл', 'Телефон предложит добавить дела в календарь. Напоминание придёт за 10 минут');
}

/* ---------- уведомления на сайте ---------- */
function askNotify(){ try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {} }
function sysNotify(title, body){
  try {
    if (!window.Notification || Notification.permission !== 'granted') return;
    const o = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'dilya-' + title };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification(title, o)).catch(() => {});
    else new Notification(title, o);
  } catch (e) {}
}
const NOTIFIED = {};
function checkStarts(){
  const dk = today(), now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  (store.plan && store.plan[dk] || []).forEach(b => {
    const k = dk + b.id + b.s; if (NOTIFIED[k] || blockDone(b)) return;
    const s = toMin(b.s); if (nm >= s && nm - s < 2) { NOTIFIED[k] = 1; toast('⏰', 'Пора: ' + b.t, b.s + '–' + b.e + ' · ' + fmtDur(durMin(b)) + '. Включить фокус?'); sfx('chest'); sysNotify('⏰ Пора: ' + b.t, b.s + '–' + b.e); }
  });
}
setInterval(checkStarts, 30000);

/* ---------- экран планера ---------- */
let PDAY = '';
function renderPlan(dk){
  if (dk && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(dk)) dk = '';
  PDAY = dk || today();
  const sel = parseKey(PDAY), mon = new Date(sel); mon.setDate(sel.getDate() - ((sel.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return dkey(d); });
  const list = sortedPlan(PDAY), isToday = PDAY === today();
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  const doneN = list.filter(blockDone).length;
  const next = (typeof READY_ORDER !== 'undefined' ? READY_ORDER : []).find(x => !lessonDone(x.id));
  const nextName = next ? shortTitle(byId(next.id)) : '';

  let rows = '', prevEnd = null;
  list.forEach(b => {
    const s = toMin(b.s);
    if (prevEnd != null && s - prevEnd >= 30) rows += `<div class="prow"><span class="ptime">${fromMin(prevEnd)}</span><button class="pgap" data-gap="${fromMin(prevEnd)}|${b.s}">Свободное время ${fromMin(prevEnd)}–${b.s} · ${fmtDur(s - prevEnd)}</button></div>`;
    prevEnd = Math.max(prevEnd || 0, s + durMin(b));
    const subs = b.subs || [], got = subs.filter(x => x.d).length, done = blockDone(b);
    const live = isToday && nm >= s && nm < s + durMin(b);
    const left = live ? s + durMin(b) - nm : durMin(b);
    rows += `<div class="prow"><span class="ptime">${b.s}</span>
      <div class="pblock${done ? ' done' : ''}${live ? ' live' : ''}" style="--c:${pcolor(b.c)}" data-id="${b.id}">
        <div class="pbh"><div><h3>${esc(b.t)}</h3><p>${b.s}–${b.e} · ${fmtDur(durMin(b))}</p></div>${subs.length ? `<b class="pcount">${got}/${subs.length}</b>` : `<button class="pchk${done ? ' on' : ''}" data-done aria-label="Готово">✓</button>`}</div>
        ${live ? '<span class="pnow">Сейчас</span>' : ''}
        ${subs.length ? `<div class="pbar"><i style="width:${subs.length ? got / subs.length * 100 : 0}%"></i></div>
        <div class="psubs">${subs.map((x, i) => `<button class="psub${x.d ? ' on' : ''}" data-sub="${i}"><span class="pbox">${x.d ? '✓' : ''}</span>${esc(x.t)}</button>`).join('')}</div>` : ''}
        <button class="paddsub" data-addsub>+ подзадача</button>
        <div class="pacts">
          <button class="pico" data-edit aria-label="Изменить">✏️</button>
          <a class="pico pg" href="${esc(gcalUrl(PDAY, b))}" target="_blank" rel="noopener" data-g title="Добавить в Google Календарь">📅 <span>Google</span></a>
          <button class="pfocus" data-focus="${left}">▶ Фокус · ${fmtDur(left)}</button>
        </div>
      </div></div>`;
  });

  app.innerHTML = `
  <div class="wrap page plan">
    <section class="card phead">
      <img class="pcat" src="mascot/read.svg" alt="">
      <div>
        <p class="label">мой планер</p>
        <h1 class="h1">${esc(prettyDay(PDAY))}</h1>
        <p class="muted">${list.length ? `Сделано ${doneN} из ${list.length} ${plural(list.length, 'дела', 'дел', 'дел')}` : 'Запиши дела на день, а Диля посидит с тобой в фокусе 💗'}</p>
      </div>
    </section>

    <div class="pweek">
      <button class="parr" data-wk="-7" aria-label="Прошлая неделя">‹</button>
      ${days.map((d, i) => { const x = parseKey(d), has = (store.plan && store.plan[d] || []).length; return `<a href="#/plan/${d}" class="pday${d === PDAY ? ' on' : ''}${d === today() ? ' today' : ''}"><small>${WD[i]}</small><b>${x.getDate()}</b>${has ? '<i></i>' : ''}</a>`; }).join('')}
      <button class="parr" data-wk="7" aria-label="Следующая неделя">›</button>
    </div>

    <div class="pfstats">
      <div><b>⏱ ${fmtDur(focusToday())}</b><span>в фокусе сегодня</span></div>
      <div><b>📆 ${fmtDur(focusWeek())}</b><span>за неделю</span></div>
      <div><b>⚡ ${(store.fxp || {})[today()] || 0}/${FOCUS_XP_DAY}</b><span>XP за фокус</span></div>
    </div>

    ${store.planHelp ? '' : `<div class="card phelp"><button class="px" data-hidehelp aria-label="Скрыть">×</button><h3>Как это работает</h3>
      <p class="muted">1. Запиши дело: что, со скольки и до скольки, и подзадачи.<br>2. Нажми <b>📅 Google</b>, и дело сохранится в твоём Google Календаре. Календарь сам пришлёт уведомление, даже если сайт закрыт.<br>3. Когда пора, жми <b>▶ Фокус</b>. За каждые 5 минут фокуса +1 XP (до ${FOCUS_XP_DAY} в день).</p></div>`}

    <div class="ptpl">
      <button class="dbtn" data-new>+ Новое дело</button>
      ${nextName ? `<button class="chipb" data-tpl="lesson">📚 Урок: ${esc(nextName)}</button>` : ''}
      <button class="chipb" data-tpl="mock">📝 Пробник</button>
      <button class="chipb" data-tpl="read">📖 Чтение</button>
    </div>

    <div class="ptl">${rows || `<div class="pempty">${MASCOT('sleep')}<p>На этот день пока ничего нет</p></div>`}</div>

    ${list.length ? `<div class="card pexport"><div><h3>📲 Весь день в календарь телефона</h3><p class="muted">Скачается файл со всеми делами, напоминание за 10 минут до каждого. На iPhone откроется Календарь, на Android Google Календарь.</p></div><button class="dbtn ghost" data-ics>Добавить</button></div>` : ''}

    <div class="sec-title"><h2>Быстрый фокус</h2><span class="script">без плана</span></div>
    <div class="pquick">${[25, 45, 60, 90].map(m => `<button data-q="${m}"><b>${m}</b><span>минут</span></button>`).join('')}</div>
  </div>`;

  app.querySelectorAll('[data-wk]').forEach(b => b.addEventListener('click', () => { location.hash = '#/plan/' + addDays(PDAY, +b.dataset.wk); }));
  app.querySelector('[data-new]').addEventListener('click', () => editBlock(null));
  app.querySelectorAll('[data-tpl]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.tpl;
    editBlock(null, t === 'lesson' ? { t: 'Урок: ' + nextName, subs: ['Видеоурок', 'Конспект', 'Тест'], c: 'burg', len: 90 }
      : t === 'mock' ? { t: 'Пробник ЕНТ', subs: ['Решить вариант', 'Разобрать ошибки'], c: 'rose', len: 80 }
      : { t: 'Чтение произведения', subs: [], c: 'sage', len: 60 });
  }));
  app.querySelectorAll('[data-gap]').forEach(b => b.addEventListener('click', () => { const [s, e] = b.dataset.gap.split('|'); editBlock(null, { s, e }); }));
  app.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => startFocus('Фокус ' + b.dataset.q + ' минут', +b.dataset.q, '', '')));
  const hh = app.querySelector('[data-hidehelp]'); hh && hh.addEventListener('click', () => { store.planHelp = 1; persist(); renderPlan(); });
  const ics = app.querySelector('[data-ics]'); ics && ics.addEventListener('click', () => exportDay(PDAY));

  app.querySelectorAll('.pblock').forEach(el => {
    const b = findBlock(PDAY, el.dataset.id); if (!b) return;
    el.querySelectorAll('[data-sub]').forEach(x => x.addEventListener('click', () => {
      const s = b.subs[+x.dataset.sub]; s.d = s.d ? 0 : 1; sfx(s.d ? 'right' : 'tap');
      if (s.d && blockDone(b)) setTimeout(() => { toast('🎉', 'Дело сделано!', b.t); sfx('done'); }, 250);
      planSave(); renderPlan();
    }));
    const dn = el.querySelector('[data-done]'); dn && dn.addEventListener('click', () => { b.done = b.done ? 0 : 1; if (b.done) { sfx('done'); toast('🎉', 'Дело сделано!', b.t); } planSave(); renderPlan(); });
    el.querySelector('[data-edit]').addEventListener('click', () => editBlock(b));
    el.querySelector('[data-focus]').addEventListener('click', e => startFocus(b.t, +e.currentTarget.dataset.focus, b.id, PDAY));
    const add = el.querySelector('[data-addsub]');
    add.addEventListener('click', () => {
      const inp = document.createElement('input'); inp.className = 'psubin'; inp.placeholder = 'Новая подзадача и Enter'; inp.enterKeyHint = 'done';
      add.replaceWith(inp); inp.focus();
      const ok = () => { const v = inp.value.trim(); if (v) { (b.subs = b.subs || []).push({ t: v, d: 0 }); b.done = 0; planSave(); } renderPlan(); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } if (e.key === 'Escape') renderPlan(); });
      inp.addEventListener('blur', ok);
    });
  });
}

/* ---------- редактор дела ---------- */
function editBlock(b, pre){
  pre = pre || {};
  const isNew = !b, now = new Date();
  const s0 = pre.s || fromMin(Math.ceil((now.getHours() * 60 + now.getMinutes() + 5) / 30) * 30);
  const e0 = pre.e || fromMin(toMin(s0) + (pre.len || 60));
  b = b || { id: Date.now().toString(36), t: pre.t || '', s: s0, e: e0, c: pre.c || 'burg', subs: (pre.subs || []).map(t => ({ t, d: 0 })) };
  const gOn = opt('gcal') !== false;
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<form class="pedit">
    <h2>${isNew ? 'Новое дело' : 'Изменить дело'}</h2>
    <label>Что делаем<input id="pe_t" value="${esc(b.t)}" placeholder="Например, конспект по «Шинели»" maxlength="80" required></label>
    <div class="pe2"><label>Начало<input type="time" id="pe_s" value="${b.s}" required></label><label>Конец<input type="time" id="pe_e" value="${b.e}" required></label></div>
    <label>Подзадачи <small>каждая с новой строки</small><textarea id="pe_sub" rows="3" placeholder="Лаб 7&#10;Лаб 8&#10;Лаб 9">${esc((b.subs || []).map(x => x.t).join('\n'))}</textarea></label>
    <div class="pecol">${PCOLORS.map(([k, c]) => `<button type="button" data-c="${k}" style="--c:${c}" aria-pressed="${b.c === k}" aria-label="Цвет"></button>`).join('')}</div>
    <label class="pegc"><input type="checkbox" id="pe_g" ${gOn ? 'checked' : ''}><span>📅 Сразу добавить в мой Google Календарь, чтобы пришло уведомление</span></label>
    <div class="pebtns">${isNew ? '' : '<button type="button" class="pdel" id="pe_del">Удалить</button>'}<button type="button" class="dbtn ghost" id="pe_x">Отмена</button><button class="dbtn">Сохранить</button></div>
  </form>`;
  document.body.appendChild(ov);
  let col = b.c;
  ov.querySelectorAll('[data-c]').forEach(x => x.addEventListener('click', () => { col = x.dataset.c; ov.querySelectorAll('[data-c]').forEach(y => y.setAttribute('aria-pressed', y === x)); }));
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  ov.querySelector('#pe_x').addEventListener('click', close);
  const del = ov.querySelector('#pe_del');
  del && del.addEventListener('click', () => { if (!confirm('Удалить «' + b.t + '»?')) return; const l = dayPlan(PDAY); l.splice(l.indexOf(b), 1); planSave(); close(); renderPlan(); });
  if (isNew) setTimeout(() => { const t = ov.querySelector('#pe_t'); if (!t.value) t.focus(); }, 60);
  ov.querySelector('form').addEventListener('submit', ev => {
    ev.preventDefault();
    const t = ov.querySelector('#pe_t').value.trim(), s = ov.querySelector('#pe_s').value, e = ov.querySelector('#pe_e').value;
    if (!t || !s || !e) return;
    if (toMin(e) === toMin(s)) { toast('⏰', 'Проверь время', 'Конец должен быть позже начала'); return; }
    const old = (b.subs || []);
    const subs = ov.querySelector('#pe_sub').value.split('\n').map(x => x.trim()).filter(Boolean).map(x => ({ t: x, d: (old.find(o => o.t === x) || {}).d || 0 }));
    Object.assign(b, { t, s, e, c: col, subs });
    if (isNew) dayPlan(PDAY).push(b);
    const g = ov.querySelector('#pe_g').checked; setOpt('gcal', g);
    planSave(); close(); sfx('right'); askNotify();
    if (g) window.open(gcalUrl(PDAY, b), '_blank', 'noopener');
    renderPlan();
  });
}

/* =========================================================
   ТАЙМЕР ФОКУСА
   ========================================================= */
const FKEY = 'dilyaFocus';
let FT = null; try { FT = JSON.parse(localStorage.getItem(FKEY)); } catch (e) { FT = null; }
let wake = null, rain = null;
function ftSave(){ try { FT ? localStorage.setItem(FKEY, JSON.stringify(FT)) : localStorage.removeItem(FKEY); } catch (e) {} }
function ftLeft(){ return !FT ? 0 : FT.paused ? FT.left : FT.end - Date.now(); }
function fmtClock(ms){ const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h ? h + ':' + pad2(m) + ':' + pad2(s) : pad2(m) + ':' + pad2(s); }

function startFocus(title, minutes, bid, dk){
  if (FT) { if (!confirm('Уже идёт фокус «' + FT.title + '». Завершить его и начать новый?')) { openFocus(); return; } finishFocus(false, true); }
  minutes = Math.max(1, Math.round(minutes));
  FT = { title, bid, dk, total: minutes * 60000, end: Date.now() + minutes * 60000, paused: false, started: Date.now() };
  ftSave(); askNotify(); sfx('tap'); openFocus();
}
function ringSvg(){
  return `<svg class="fring" viewBox="0 0 280 280" aria-hidden="true">
    <circle cx="140" cy="140" r="124" class="fr0"/><circle cx="140" cy="140" r="112" class="fr1"/>
    <circle cx="140" cy="140" r="124" class="fr2" id="farc"/><circle cx="140" cy="16" r="11" class="fdot" id="fdot"/></svg>`;
}
function openFocus(){
  if (!FT) return;
  let ov = document.getElementById('focus');
  if (!ov) { ov = document.createElement('div'); ov.id = 'focus'; ov.className = 'focus'; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="ftop"><button class="fbtn0" data-min aria-label="Свернуть">⌄</button><b>Фокус</b><span></span></div>
    <div class="fpill"><i></i>${esc(FT.title)}</div>
    <div class="fcirc">${ringSvg()}<div class="fin"><img src="mascot/read.svg" alt=""><b id="ftime">${fmtClock(ftLeft())}</b><span>осталось</span></div></div>
    <div class="fadd"><button data-add="5">+5 мин</button><button data-add="15">+15 мин</button></div>
    <div class="fctl">
      <div><button class="fsm${rain ? ' on' : ''}" data-rain aria-label="Звук дождя">🌧</button><span>Дождик</span></div>
      <div><button class="fbig" data-pause aria-label="Пауза">${FT.paused ? '▶' : '❚❚'}</button><span>${FT.paused ? 'Дальше' : 'Пауза'}</span></div>
      <div><button class="fsm fdone" data-end aria-label="Завершить">✓</button><span>Завершить</span></div>
    </div>`;
  document.body.classList.add('focus-on');
  const mini = document.getElementById('fmini'); mini && mini.remove();
  ov.querySelector('[data-min]').addEventListener('click', minimizeFocus);
  ov.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => { const ms = +b.dataset.add * 60000; FT.total += ms; if (FT.paused) FT.left += ms; else FT.end += ms; ftSave(); sfx('tap'); tickFocus(); }));
  ov.querySelector('[data-pause]').addEventListener('click', () => {
    if (FT.paused) { FT.end = Date.now() + FT.left; FT.paused = false; } else { FT.left = ftLeft(); FT.paused = true; }
    ftSave(); sfx('tap'); openFocus();
  });
  ov.querySelector('[data-end]').addEventListener('click', () => { if (confirm('Завершить фокус сейчас?')) finishFocus(false); });
  ov.querySelector('[data-rain]').addEventListener('click', e => { toggleRain(); e.currentTarget.classList.toggle('on', !!rain); });
  lockScreen(); tickFocus();
}
function minimizeFocus(){
  const ov = document.getElementById('focus'); ov && ov.remove();
  document.body.classList.remove('focus-on'); unlockScreen(); showMini();
}
function showMini(){
  if (!FT || document.getElementById('focus')) return;
  let m = document.getElementById('fmini');
  if (!m) { m = document.createElement('button'); m.id = 'fmini'; m.className = 'fmini'; m.addEventListener('click', openFocus); document.body.appendChild(m); }
  m.innerHTML = `<span>${FT.paused ? '⏸' : '⏱'}</span><b>${fmtClock(ftLeft())}</b><em>${esc(FT.title)}</em>`;
}
function tickFocus(){
  if (!FT) return;
  const left = ftLeft();
  if (left <= 0 && !FT.paused) { finishFocus(true); return; }
  const t = document.getElementById('ftime');
  if (t) {
    t.textContent = fmtClock(left);
    const fr = Math.min(1, Math.max(0, 1 - left / FT.total)), C = 2 * Math.PI * 124, a = fr * 2 * Math.PI;
    const arc = document.getElementById('farc'); arc.style.strokeDasharray = (C * fr) + ' ' + C;
    const dot = document.getElementById('fdot'); dot.setAttribute('cx', 140 + 124 * Math.sin(a)); dot.setAttribute('cy', 140 - 124 * Math.cos(a));
    document.title = fmtClock(left) + ' · ' + FT.title;
  } else showMini();
}
setInterval(tickFocus, 500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickFocus(); if (document.getElementById('focus')) lockScreen(); } });

function finishFocus(auto, silent){
  if (!FT) return;
  const f = FT, mins = Math.floor(Math.max(0, f.total - Math.max(0, ftLeft())) / 60000);
  FT = null; ftSave(); stopRain(); unlockScreen(); document.title = 'dilya.litra · литература к ЕНТ';
  const mini = document.getElementById('fmini'); mini && mini.remove();
  let gain = 0;
  if (mins > 0) {
    store.focus = store.focus || {}; store.focus[today()] = (store.focus[today()] || 0) + mins;
    store.fxp = store.fxp || {}; const had = store.fxp[today()] || 0;
    gain = Math.max(0, Math.min(Math.floor(mins / 5), FOCUS_XP_DAY - had));
    if (gain) { store.fxp[today()] = had + gain; addBonus(gain); }
    Object.keys(store.focus).forEach(k => { if (dayDiff(k, today()) > 60) { delete store.focus[k]; delete store.fxp[k]; } });
    save();
  } else persist();
  if (silent) { const ov = document.getElementById('focus'); ov && ov.remove(); document.body.classList.remove('focus-on'); return; }
  sfx('done'); if (auto) { setTimeout(() => sfx('chest'), 900); sysNotify('⏰ Время вышло!', f.title + ': ты отлично поработала 💗'); }
  let ov = document.getElementById('focus');
  if (!ov) { ov = document.createElement('div'); ov.id = 'focus'; ov.className = 'focus'; document.body.appendChild(ov); }
  document.body.classList.add('focus-on');
  ov.innerHTML = `<div class="fend">
    <img src="mascot/${mins >= 25 ? 'star' : 'happy'}.svg" alt="">
    <h2>${auto ? 'Время вышло!' : mins > 0 ? 'Фокус завершён' : 'Фокус остановлен'}</h2>
    <p>${mins > 0 ? 'Ты была в фокусе ' + fmtDur(mins) + (gain ? ` и получила <b>+${gain} XP</b>` : '') + '. Умница!' : 'Меньше минуты не засчитывается, попробуй ещё раз 💗'}</p>
    ${mins > 0 && !gain ? `<p class="fsmall">Лимит ${FOCUS_XP_DAY} XP за фокус на сегодня уже собран</p>` : ''}
    <p class="fsmall">Сегодня в фокусе: ${fmtDur(focusToday())}</p>
    <button class="dbtn" data-ok>Ура!</button></div>`;
  ov.querySelector('[data-ok]').addEventListener('click', () => { ov.remove(); document.body.classList.remove('focus-on'); if (location.hash.indexOf('#/plan') === 0) renderPlan(); });
}

/* экран не гаснет во время фокуса */
function lockScreen(){ try { if (navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {}); } catch (e) {} }
function unlockScreen(){ try { wake && wake.release(); } catch (e) {} wake = null; }

/* мягкий шум дождя */
function toggleRain(){ rain ? stopRain() : startRain(); }
function startRain(){
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume();
    const len = AC.sampleRate * 4, buf = AC.createBuffer(2, len, AC.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2 + (Math.random() < 0.0008 ? (Math.random() * 0.5) : 0); } }
    const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = AC.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.5, AC.currentTime + 1.5);
    src.connect(lp); lp.connect(g); g.connect(AC.destination); src.start();
    rain = { src, g };
  } catch (e) { rain = null; }
}
function stopRain(){ if (!rain) return; try { const r = rain; r.g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.6); setTimeout(() => r.src.stop(), 700); } catch (e) {} rain = null; }

/* если фокус шёл до перезагрузки страницы */
setTimeout(() => { if (FT) { if (ftLeft() <= 0 && !FT.paused) finishFocus(true); else showMini(); } checkStarts(); }, 800);
