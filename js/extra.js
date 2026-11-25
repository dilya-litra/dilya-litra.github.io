/* =========================================================
   dilya.litra: пробный ЕНТ, карта, игры, профиль, значки
   ========================================================= */
'use strict';

/* =========================================================
   ПРОБНЫЙ ЕНТ
   1-25 один ответ, 26-30 по тексту, 31-35 соответствие (2 балла),
   36-40 от 1 до 3 ответов (2 балла). Максимум 50.
   ========================================================= */
const MOCK_MIN = 80;
let M = null;
function forecast(){
  const ms = (store.mocks || []).slice(-3); if (!ms.length) return 0;
  const w = ms.map((_, i) => i + 1), sw = w.reduce((a, b) => a + b, 0);
  return Math.round(ms.reduce((s, m, i) => s + m.score * w[i], 0) / sw);
}
function mockSection(i){ return i < 25 ? 0 : i < 30 ? 1 : i < 35 ? 2 : 3; }
function mockPts(q){ return q.type === 'one' ? 1 : 2; }
function mockScore(q, a){
  if (a == null) return 0;
  if (q.type === 'one') return a[0] === q.right[0] ? 1 : 0;
  if (q.type === 'many') return qScore(q, a);
  const err = q.pairs.reduce((s, p, i) => s + (a[i] === p[1] ? 0 : 1), 0);
  return err === 0 ? 2 : err === 1 ? 1 : 0;
}
function renderMock(){
  document.body.classList.remove('duo-test');
  if (store.mockRun && Date.now() < store.mockRun.end) return resumeMock();
  if (store.mockRun) return finishMock(true);
  const ms = store.mocks || [], fc = forecast();
  const cw = curWeek(), passed = READY_ORDER.filter(x => x.week <= cw).length;
  app.innerHTML = `
  <div class="wrap page">
    <section class="card pagehead">
      ${MASCOT('wave')}
      <div><p class="label">Тренировка перед экзаменом</p><h1 class="h1">Пробный ЕНТ</h1>
      <p class="lead">40 заданий в формате ЕНТ, таймер ${MOCK_MIN} минут, максимум 50 баллов. Ошибки сами попадут в «Работу над ошибками».</p></div>
    </section>
    <div class="revgrid">
      <div class="card">
        <p class="label">Структура</p>
        <ul class="ent">
          <li><b>1-25</b>один правильный ответ · 1 балл</li>
          <li><b>26-30</b>вопросы по тексту-контексту · 1 балл</li>
          <li><b>31-35</b>на соответствие · 2 балла</li>
          <li><b>36-40</b>от 1 до 3 правильных ответов · 2 балла</li>
        </ul>
        <p class="label" style="margin-top:18px">Из каких уроков вопросы</p>
        <div class="stream mscope" role="group">
          <button type="button" data-s="mine" aria-pressed="true">Что уже прошли (${passed})</button>
          <button type="button" data-s="all" aria-pressed="false">Весь курс</button>
        </div>
        <div style="margin-top:20px"><button class="dbtn" id="mgo">Начать пробник</button></div>
      </div>
      <div class="card">
        <p class="label">Прогноз балла</p>
        <p class="big">${fc || '?'} <small>из 50</small></p>
        <p class="muted">${fc ? 'Средний по последним пробникам, свежие весят больше' : 'Пройди первый пробник, и Диля посчитает прогноз'}</p>
        ${ms.length ? `<div class="mhist">${ms.slice(-10).map(m => `<div title="${esc(m.d)}: ${m.score}"><i style="height:${Math.max(6, m.score * 2)}%"></i><span>${m.score}</span></div>`).join('')}</div>` : ''}
      </div>
    </div>
  </div>`;
  let scope = 'mine';
  app.querySelectorAll('.mscope button').forEach(b => b.addEventListener('click', () => { scope = b.dataset.s; app.querySelectorAll('.mscope button').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
  document.getElementById('mgo').addEventListener('click', () => buildMock(scope));
}
function buildMock(scope){
  const cw = curWeek();
  let ids = (scope === 'all' ? READY_ORDER : READY_ORDER.filter(x => x.week <= cw)).map(x => x.id);
  if (ids.length < 5) ids = READY_ORDER.map(x => x.id);
  loader('Собираю вариант из ' + ids.length + ' ' + plural(ids.length, 'урока', 'уроков', 'уроков') + '…');
  loadMany(ids, (n, t) => { const b = document.getElementById('lbar'); if (b) b.style.width = Math.round(n / t * 100) + '%'; }).then(Ls => {
    const one = [], ctx = [], match = [], many = [];
    Ls.forEach(L => {
      const groups = {};
      L.questions.forEach((q, qi) => {
        const r = { id: L.id, qi };
        if (q.ctx) (groups[q.ctx] = groups[q.ctx] || []).push(r);
        else if (q.type === 'one') one.push(r); else if (q.type === 'match') match.push(r); else if (q.type === 'many') many.push(r);
      });
      Object.values(groups).forEach(g => ctx.push(g));
    });
    const spread = (arr, n) => { const used = {}, out = []; mix(arr).forEach(r => { if (out.length < n && !used[r.id]) { used[r.id] = 1; out.push(r); } }); mix(arr).forEach(r => { if (out.length < n && !out.includes(r)) out.push(r); }); return out; };
    let cq = []; mix(ctx).forEach(g => { if (cq.length < 5) cq = cq.concat(g.slice(0, 5 - cq.length)); });
    const qs = spread(one, 25).concat(cq, spread(match, 5), spread(many, 5));
    store.mockRun = { start: Date.now(), end: Date.now() + MOCK_MIN * 60e3, qs, ans: {}, cur: 0, scope };
    persist(); resumeMock();
  }).catch(loadFail);
}
function resumeMock(){
  const run = store.mockRun, ids = [...new Set(run.qs.map(r => r.id))];
  const go = () => { M = { run, items: run.qs.map(r => ({ L: LCACHE[r.id], qi: r.qi, q: LCACHE[r.id].questions[r.qi] })) }; document.body.classList.add('duo-test'); drawMock(); tickMock(); };
  if (ids.every(id => LCACHE[id])) return go();
  loader('Возвращаю твой пробник…'); loadMany(ids).then(go).catch(loadFail);
}
function fmtTime(ms){ ms = Math.max(0, ms); const m = Math.floor(ms / 60e3), s = Math.floor(ms % 60e3 / 1e3); return m + ':' + String(s).padStart(2, '0'); }
function tickMock(){
  clearInterval(tickMock.t);
  tickMock.t = setInterval(() => {
    const el = document.getElementById('mtime');
    if (!el || !store.mockRun) { clearInterval(tickMock.t); return; }
    const left = store.mockRun.end - Date.now();
    el.textContent = fmtTime(left); el.classList.toggle('low', left < 5 * 60e3);
    if (left <= 0) { clearInterval(tickMock.t); finishMock(true); }
  }, 1000);
}
function answered(i){ const a = M.run.ans[i], q = M.items[i].q; return a != null && (q.type === 'match' ? a.filter(Boolean).length === q.pairs.length : a.length > 0); }
function drawMock(){
  const run = M.run, i = run.cur, it = M.items[i], q = it.q, a = run.ans[i];
  const L = 'АБВГДЕ';
  let body = '';
  if (q.type === 'one' || q.type === 'many') {
    body = `<div class="mopts">${q.opts.map((o, oi) => `<button class="mopt${a && a.includes(oi) ? ' sel' : ''}" data-o="${oi}"><span class="${q.type === 'many' ? 'chk' : 'rad'}">${L[oi]}</span>${esc(o)}</button>`).join('')}</div>`;
  } else {
    if (!run.sh) run.sh = {};
    if (!run.sh[i]) run.sh[i] = mix(q.pairs.map(p => p[1]));
    body = `<div class="mmatch">${q.pairs.map((p, pi) => `<label class="mrow2"><span>${pi + 1}. ${esc(p[0])}</span><select data-p="${pi}"><option value="">выбери</option>${run.sh[i].map(v => `<option ${a && a[pi] === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`).join('')}</div>`;
  }
  const kinds = ['Выберите один правильный ответ', 'Прочитайте текст и выберите один правильный ответ', 'Установите соответствие', 'Выберите от 1 до 3 правильных ответов'];
  const showCtx = q.ctx;
  const done = M.items.filter((_, k) => answered(k)).length;
  app.innerHTML = `
  <div class="mock">
    <div class="mtop">
      <div class="mtitle"><b>Русская литература</b><span>пробный ЕНТ · dilya.litra</span></div>
      <div class="mtimer">⏱ <span id="mtime">${fmtTime(run.end - Date.now())}</span></div>
      <button class="mfin" id="mfin">Завершить</button>
    </div>
    <div class="mgrid">${M.items.map((_, k) => `<button class="${k === i ? 'cur ' : ''}${answered(k) ? 'ans' : ''}" data-go="${k}">${k + 1}</button>`).join('')}</div>
    <div class="mcard">
      <p class="mkind">Задание ${i + 1} из 40 · ${kinds[mockSection(i)]} · ${mockPts(q)} ${plural(mockPts(q), 'балл', 'балла', 'баллов')}</p>
      ${showCtx ? `<div class="dctx">${esc(q.ctx)}</div>` : ''}
      <h2>${esc(q.text)}</h2>
      ${body}
    </div>
    <div class="mnav">
      <button class="dbtn ghost" id="mprev" ${i ? '' : 'disabled'}>← Назад</button>
      <span class="muted">Отвечено ${done} из 40</span>
      <button class="dbtn" id="mnext">${i < 39 ? 'Далее →' : 'Завершить'}</button>
    </div>
  </div>`;
  const setA = v => { run.ans[i] = v; persist(); };
  app.querySelectorAll('.mopt').forEach(b => b.addEventListener('click', () => {
    const oi = +b.dataset.o;
    if (q.type === 'one') setA([oi]); else { const cur = (run.ans[i] || []).slice(); const k = cur.indexOf(oi); k >= 0 ? cur.splice(k, 1) : cur.push(oi); setA(cur); }
    sfx('tap'); drawMock();
  }));
  app.querySelectorAll('.mmatch select').forEach(s => s.addEventListener('change', () => { const cur = (run.ans[i] || q.pairs.map(() => '')).slice(); cur[+s.dataset.p] = s.value; setA(cur); drawMock(); }));
  app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { run.cur = +b.dataset.go; persist(); drawMock(); window.scrollTo(0, 0); }));
  document.getElementById('mprev').addEventListener('click', () => { run.cur--; persist(); drawMock(); window.scrollTo(0, 0); });
  document.getElementById('mnext').addEventListener('click', () => { if (i < 39) { run.cur++; persist(); drawMock(); window.scrollTo(0, 0); } else confirmFinish(); });
  document.getElementById('mfin').addEventListener('click', confirmFinish);
}
function confirmFinish(){
  const left = 40 - M.items.filter((_, k) => answered(k)).length;
  if (confirm(left ? `Осталось без ответа: ${left}. Точно завершить?` : 'Завершить пробник и посмотреть результат?')) finishMock(false);
}
function finishMock(timeout){
  const run = store.mockRun; if (!run) return renderMock();
  const ids = [...new Set(run.qs.map(r => r.id))];
  if (!ids.every(id => LCACHE[id])) { loader('Считаю баллы…'); loadMany(ids).then(() => finishMock(timeout)).catch(loadFail); return; }
  clearInterval(tickMock.t);
  const items = run.qs.map(r => ({ L: LCACHE[r.id], qi: r.qi, q: LCACHE[r.id].questions[r.qi] }));
  const sec = [0, 0, 0, 0], secMax = [25, 5, 10, 10]; let score = 0;
  const wrong = [];
  items.forEach((it, i) => {
    const s = mockScore(it.q, run.ans[i]); score += s; sec[mockSection(i)] += s;
    if (s < mockPts(it.q)) { wrong.push({ it, i, a: run.ans[i] }); addMistake(it.L.id, it.qi); }
  });
  const mins = Math.round((Math.min(Date.now(), run.end) - run.start) / 60e3);
  store.mocks = (store.mocks || []).concat({ d: today(), score, min: mins, scope: run.scope }).slice(-30);
  delete store.mockRun; addBonus(score); save(); sfx('done');
  document.body.classList.add('duo-test');
  const names = ['Один ответ (1-25)', 'По тексту (26-30)', 'Соответствие (31-35)', 'Несколько ответов (36-40)'];
  const ansTxt = (q, a) => a == null ? 'нет ответа' : q.type === 'match' ? q.pairs.map((p, k) => p[0] + ' → ' + (a[k] || '?')).join('; ') : a.map(k => q.opts[k]).join('; ');
  const rightTxt = q => q.type === 'match' ? q.pairs.map(p => p[0] + ' → ' + p[1]).join('; ') : q.right.map(k => q.opts[k]).join('; ');
  app.innerHTML = `
  <div class="dtest dend mockend">${score >= 35 ? confetti() : ''}
    <div class="endbox wide">${MASCOT(score >= 25 ? 'happy' : 'wave')}
      <h2>${timeout ? 'Время вышло!' : score >= 40 ? 'Блестяще!' : score >= 30 ? 'Отличный результат!' : 'Пробник завершён'}</h2>
      <p class="mscore"><b>${score}</b> из 50</p>
      <p class="muted">${mins} мин · прогноз на ЕНТ: <b>${forecast()} из 50</b></p>
      <div class="msecs">${sec.map((v, k) => `<div><span>${names[k]}</span><b>${v} / ${secMax[k]}</b><i><u style="width:${Math.round(v / secMax[k] * 100)}%"></u></i></div>`).join('')}</div>
      ${wrong.length ? `<details class="mwrong"><summary>Разбор ошибок (${wrong.length})</summary>${wrong.map(w => `<div class="mw"><p class="mwq"><b>${w.i + 1}.</b> ${esc(w.it.q.text)} <small>${esc(w.it.L.title)}</small></p><p class="no">Твой ответ: ${esc(ansTxt(w.it.q, w.a))}</p><p class="ok">Правильно: ${esc(rightTxt(w.it.q))}</p></div>`).join('')}</details>
      <p class="endnote">🩹 Все ошибки уже в «Работе над ошибками»</p>` : ''}
      <div class="endbtns"><a class="dbtn" href="#/">На тропинку</a><a class="dbtn ghost" href="#/mock">Ещё пробник</a></div>
    </div>
  </div>`;
}

/* =========================================================
   КАРТА ПО СПЕЦИФИКАЦИИ ЕНТ
   ========================================================= */
const SPEC = [
  { n: 'Теория литературы', e: '📐', f: L => L.author === 'Теория литературы' },
  { n: 'Народное творчество и мифы', e: '🏺', f: L => /Былины|Мифология|Библия/.test(L.author) },
  { n: 'Литература XVIII века', e: '🎩', f: L => /Фонвизин/.test(L.author) },
  { n: 'Литература XIX века', e: '🪶', f: L => L.week <= 15 },
  { n: 'Литература XX века', e: '🌾', f: L => L.week > 15 && L.week <= 25 },
  { n: 'Литература о войне', e: '🎖️', f: L => /Быков|Кондратьев|Б\. Л\. Васильев|Твардовский|Самойлов|Окуджава|Заболоцкий|Евтушенко/.test(L.author) },
  { n: 'Литература Казахстана', e: '🏔️', f: L => /Шаханов|Сулейменов|Жунусов|П\. Н\. Васильев/.test(L.author) },
  { n: 'Зарубежная литература', e: '🌍', f: L => /Айтматов|Андерсен|Уайльд|Гофман|Блейк|Толкин|Брэдбери|Шекспир|Сент-Экзюпери|Ремарк/.test(L.author) }
];
function specGroups(){
  const used = {};
  const gs = SPEC.map(g => ({ g, list: [] }));
  // сначала точные группы (не «по неделе»), потом XIX и XX
  [0, 1, 2, 5, 6, 7, 3, 4].forEach(gi => { READY_ORDER.forEach(x => { const L = byId(x.id); if (!used[L.id] && SPEC[gi].f(L)) { used[L.id] = 1; gs[gi].list.push(L); } }); });
  return gs;
}
function specPct(){ const n = READY_ORDER.length; return n ? Math.round(READY_ORDER.filter(x => lessonDone(x.id)).length / n * 100) : 0; }
function renderMap(){
  document.body.classList.remove('duo-test');
  const gs = specGroups(), cw = curWeek();
  app.innerHTML = `
  <div class="wrap page">
    <section class="card pagehead">
      ${MASCOT('happy')}
      <div><p class="label">Спецификация ЕНТ · русская литература</p><h1 class="h1">Карта ЕНТ</h1>
      <p class="lead">Весь список произведений к экзамену. Зелёное ты уже знаешь, розовое начато, светлое ждёт впереди. Всего пройдено <b>${specPct()}%</b>.</p>
      <div class="legend"><span class="ch done">✓ пройдено</span><span class="ch part">✎ начато</span><span class="ch">○ впереди</span></div></div>
    </section>
    <div class="specs">
    ${gs.map(({ g, list }) => {
      const d = list.filter(L => lessonDone(L.id)).length, pct = list.length ? Math.round(d / list.length * 100) : 0;
      return `<section class="card spec">
        <div class="spech"><span class="se">${g.e}</span><div><h3>${esc(g.n)}</h3><p>${d} из ${list.length}</p></div><b>${pct}%</b></div>
        <div class="pbar"><i style="width:${pct}%"></i></div>
        <div class="chips2">${list.map(L => { const st = lessonDone(L.id) ? 'done' : lessonStarted(L.id) ? 'part' : ''; return `<a class="ch ${st}${L.week === cw ? ' now' : ''}" href="#/lesson/${L.id}" title="${esc(L.author)}">${st === 'done' ? '✓ ' : st === 'part' ? '✎ ' : ''}${esc(shortTitle(L))}</a>`; }).join('')}</div>
      </section>`;
    }).join('')}
    </div>
    ${scheduleHtml()}
    ${pointsHtml()}
  </div>`;
}
function shortTitle(L){ const sur = L.author && !/Теория|Былины|Мифология|Библия/.test(L.author) ? L.author.split(' ').pop() + ' ' : ''; return sur + L.title; }
function scheduleHtml(){
  const cw = curWeek();
  return `
  <div class="sec-title" id="schedule"><h2>Расписание курса</h2><span class="script">${WEEKS.length} ${plural(WEEKS.length, 'неделя', 'недели', 'недель')}</span></div>
  <div class="map">
  ${ERAS.map((e, ei) => {
    const ws = WEEKS.slice(e.from - 1, e.to), items = ws.flat().filter(x => x.id && byId(x.id)), dn = items.filter(x => lessonDone(x.id)).length;
    return `<section class="chapter" style="--c:${e.c}">
      <div class="chap-h"><div class="num">глава ${ei + 1}</div><h3>${esc(e.name)}</h3><p>${esc(e.note)}<br>недели ${e.from}-${e.to}</p><div class="pbar"><i style="width:${items.length ? Math.round(dn / items.length * 100) : 0}%"></i></div></div>
      <div class="weeks">
      ${ws.map((w, k) => {
        const n = e.from + k, cls = n === cw ? ' cur' : n < cw ? ' past' : '';
        return `<details class="week card${cls}"${n === cw ? ' open' : ''}>
          <summary><span class="wnum">${n}</span><span class="wt">Неделя ${n}${n === cw ? ' <em>сейчас</em>' : ''}<small>${esc(weekNames(w))}</small></span><span class="wc">${w.length} ${plural(w.length, 'урок', 'урока', 'уроков')}</span></summary>
          <ol>${w.map(x => {
            const L = x.id && byId(x.id), ok = L && lessonDone(L.id);
            const label = `<span class="ln">Урок ${x.num}</span><span class="lt">${x.author ? '<b>' + esc(x.author) + '</b> ' : ''}${esc(x.title)}</span>`;
            return L ? `<li><a href="#/lesson/${L.id}">${label}<span class="ls ${ok ? 'ok' : 'go'}">${ok ? '✓ пройден' : 'открыть →'}</span></a></li>` : `<li><div>${label}<span class="ls">скоро</span></div></li>`;
          }).join('')}</ol>
        </details>`;
      }).join('')}
      </div>
    </section>`;
  }).join('')}
  </div>`;
}
function pointsHtml(){
  return `
  <div class="two" id="points">
    <div class="card dark">
      <p class="label">Тренажёр</p>
      <h2 class="h1" style="font-size:40px;color:var(--cream)">Тест точь-в-точь как на ЕНТ</h2>
      <ul class="ent">
        <li><b>1-25</b>один правильный ответ</li>
        <li><b>26-30</b>вопросы по тексту-контексту</li>
        <li><b>31-35</b>на соответствие</li>
        <li><b>36-40</b>от 1 до 3 правильных ответов</li>
      </ul>
    </div>
    <div class="card">
      <p class="label">Как начисляются баллы</p>
      <h2 class="h1" style="font-size:40px;margin-bottom:18px">Правила рейтинга</h2>
      <div class="rule"><span>Рабочая тетрадь</span><b>30 / 60</b></div>
      <div class="rule"><span>Практика</span><b>150</b></div>
      <div class="rule"><span>Зачёт</span><b>150</b></div>
      <p class="muted" style="margin-top:14px">Пропускаешь практику или зачёт? Предупреди минимум за 4 часа, тогда просто 0. Без предупреждения <b style="color:var(--bad)">-50</b>.</p>
    </div>
  </div>`;
}

/* =========================================================
   МИНИ-ИГРЫ
   ========================================================= */
const GAMES = {
  hero: { name: 'Угадай героя', e: '🕵️‍♀️', d: 'Читаешь описание, угадываешь, кто это' },
  whose: { name: 'Чей герой?', e: '📚', d: 'Из какого произведения этот персонаж' },
  author: { name: 'Кто автор?', e: '✒️', d: 'Произведение и его автор' },
  blitz: { name: 'Молния', e: '⚡', d: 'Вопросы из ЕНТ-тестов на скорость' }
};
const GAME_SEC = 60, GAME_XP_DAY = 60;
let HEROES = null, G = null;
function loadHeroes(){ return HEROES ? Promise.resolve(HEROES) : fetch('data/heroes.json').then(r => r.json()).then(h => (HEROES = h.filter(x => byId(x[0]) && !/лирическ|автор|рассказчик|повествовател|^герои?$/i.test(x[1])))); }
function renderGames(){
  document.body.classList.remove('duo-test');
  const best = store.games || {};
  app.innerHTML = `
  <div class="wrap page">
    <section class="card pagehead">
      ${MASCOT('happy')}
      <div><p class="label">Минутка между уроками</p><h1 class="h1">Мини-игры</h1>
      <p class="lead">Каждая игра длится ${GAME_SEC} секунд. За каждый верный ответ +1 XP (до ${GAME_XP_DAY} XP в день). Побей свой рекорд!</p></div>
    </section>
    <div class="games">${Object.entries(GAMES).map(([k, g]) => `<a class="card game" href="#/games/${k}"><span class="ge">${g.e}</span><h3>${esc(g.name)}</h3><p>${esc(g.d)}</p><em>${best[k] ? 'рекорд ' + best[k] : 'ещё не играла'}</em></a>`).join('')}</div>
  </div>`;
}
function maskName(name, text){
  let t = text;
  name.split(/[\s,()«»-]+/).filter(w => w.length >= 4 && /^[А-ЯЁA-Z]/.test(w)).forEach(w => {
    const stem = w.slice(0, Math.max(4, w.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp('(^|[^а-яёА-ЯЁ])' + stem + '[а-яё]*', 'gi'), '$1***');
  });
  return t.length > 300 ? t.slice(0, 300).replace(/\s\S*$/, '') + '…' : t;
}
function heroQ(){
  const h = pick(HEROES), same = HEROES.filter(x => x[0] === h[0] && x[1] !== h[1]).map(x => x[1]);
  const pool = mix(same).concat(mix(HEROES.map(x => x[1]))).filter((n, i, a) => n !== h[1] && a.indexOf(n) === i);
  return { kind: 'Кто это?', text: maskName(h[1], h[2]), sub: byId(h[0]).title, opts: mix([h[1]].concat(pool.slice(0, 3))), right: h[1] };
}
function whoseQ(){
  const h = pick(HEROES), L = byId(h[0]), t = w => '«' + w.title.replace(/[«»]/g, '') + '»';
  const others = mix(LESSONS.filter(x => x.id !== L.id && x.author !== 'Теория литературы')).map(t).filter((v, i, a) => v !== t(L) && a.indexOf(v) === i);
  return { kind: 'Из какого произведения?', text: h[1], sub: '', opts: mix([t(L)].concat(others.slice(0, 3))), right: t(L) };
}
function authorQ(){
  const pool = LESSONS.filter(L => !/Теория|Былины|Мифология|Библия/.test(L.author)), L = pick(pool);
  const others = mix([...new Set(pool.map(x => x.author))].filter(a => a !== L.author));
  return { kind: 'Кто автор?', text: L.title, sub: '', opts: mix([L.author].concat(others.slice(0, 3))), right: L.author };
}
function blitzQ(){
  const ids = G.blitzIds, L = LCACHE[pick(ids)], qs = L.questions.filter(q => q.type === 'one' && !q.ctx), q = pick(qs);
  return { kind: 'Молния', text: q.text, sub: L.title, opts: q.opts, right: q.opts[q.right[0]] };
}
function startGame(k){
  if (!GAMES[k]) { location.hash = '#/games'; return; }
  const prep = k === 'hero' || k === 'whose' ? loadHeroes() : k === 'blitz' ? (() => {
    const done = READY_ORDER.filter(x => lessonStarted(x.id)).map(x => x.id);
    const ids = mix(done.length >= 3 ? done : READY_ORDER.filter(x => x.week <= curWeek()).map(x => x.id)).slice(0, 8);
    return loadMany(ids).then(Ls => { G.blitzIds = Ls.map(L => L.id); });
  })() : Promise.resolve();
  G = { k, score: 0, combo: 0, end: 0, q: null, lock: false, total: 0 };
  loader('Готовлю игру…');
  prep.then(() => { G.end = Date.now() + GAME_SEC * 1000; document.body.classList.add('duo-test'); nextGameQ(); G.t = setInterval(gameTick, 250); }).catch(loadFail);
}
function nextGameQ(){
  G.q = ({ hero: heroQ, whose: whoseQ, author: authorQ, blitz: blitzQ })[G.k](); G.lock = false;
  const g = GAMES[G.k];
  app.innerHTML = `
  <div class="dtest gamebox">
    <div class="dtop"><a class="dx" href="#/games" aria-label="Выйти">✕</a><div class="dprog gtime"><i id="gt" style="width:100%"></i></div><span class="gsc">${g.e} <b id="gs">${G.score}</b></span></div>
    <div class="dq">
      <p class="dkind">${esc(G.q.kind)}${G.combo >= 3 ? ` · <span class="combo">серия ${G.combo} 🔥</span>` : ''}</p>
      <h2 class="${G.k === 'hero' ? 'gdesc' : ''}">${esc(G.q.text)}</h2>
      ${G.q.sub && G.k !== 'hero' ? `<p class="muted">${esc(G.q.sub)}</p>` : ''}
      <div class="dopts">${G.q.opts.map((o, i) => `<button class="dopt" data-i="${i}"><span class="dk">${i + 1}</span>${esc(o)}</button>`).join('')}</div>
    </div>
  </div>`;
  gameTick();
  app.querySelectorAll('.dopt').forEach(b => b.addEventListener('click', () => gameAnswer(b)));
}
function gameAnswer(b){
  if (G.lock) return; G.lock = true; G.total++;
  const ok = G.q.opts[+b.dataset.i] === G.q.right;
  app.querySelectorAll('.dopt').forEach(x => { if (G.q.opts[+x.dataset.i] === G.q.right) x.classList.add('r'); x.disabled = true; });
  if (ok) { G.score++; G.combo++; sfx('right'); } else { b.classList.add('w'); G.combo = 0; sfx('wrong'); }
  const s = document.getElementById('gs'); if (s) s.textContent = G.score;
  setTimeout(() => { if (Date.now() < G.end) nextGameQ(); }, ok ? 450 : 1300);
}
document.addEventListener('keydown', e => {
  if (!G || !G.end || G.lock || !document.querySelector('.gamebox')) return;
  const n = +e.key; const b = app.querySelector(`.dopt[data-i="${n - 1}"]`); b && b.click();
});
function gameTick(){
  if (!G || !G.end) return;
  const left = G.end - Date.now(), el = document.getElementById('gt');
  if (!document.querySelector('.gamebox')) { clearInterval(G.t); G.end = 0; return; }
  if (el) el.style.width = Math.max(0, left / (GAME_SEC * 10)) + '%';
  if (left <= 0) endGame();
}
function endGame(){
  clearInterval(G.t); G.end = 0;
  const g = GAMES[G.k], best = (store.games || {})[G.k] || 0, rec = G.score > best;
  store.games = store.games || {}; if (rec) store.games[G.k] = G.score;
  store.gameRight = (store.gameRight || 0) + G.score;
  store.gxp = store.gxp || {}; const used = store.gxp[today()] || 0, gain = Math.max(0, Math.min(G.score, GAME_XP_DAY - used));
  Object.keys(store.gxp).forEach(d => { if (d !== today()) delete store.gxp[d]; });
  store.gxp[today()] = used + gain; addBonus(gain); save(); sfx('done');
  app.innerHTML = `
  <div class="dtest dend">${rec && G.score ? confetti() : ''}
    <div class="endbox">${MASCOT(G.score ? 'happy' : 'wave')}
      <h2>${rec && G.score ? 'Новый рекорд!' : 'Время вышло!'}</h2><p>${esc(g.name)}</p>
      <div class="endstats"><div><span>Верно</span><b>✅ ${G.score}/${G.total}</b></div><div><span>Рекорд</span><b>🏆 ${Math.max(best, G.score)}</b></div><div><span>Опыт</span><b>⚡ ${gain}</b></div></div>
      ${gain < G.score ? '<p class="endnote">Дневной лимит XP за игры набран, но рекорды считаются всегда 💗</p>' : ''}
      <div class="endbtns"><button class="dbtn" onclick="startGame('${G.k}')">Ещё раз</button><a class="dbtn ghost" href="#/games">Другие игры</a></div>
    </div>
  </div>`;
}

/* =========================================================
   ЗНАЧКИ
   ========================================================= */
const AUTHORS = [['Пушкина', 'А. С. Пушкин', '🪶'], ['Лермонтова', 'М. Ю. Лермонтов', '⛰️'], ['Гоголя', 'Н. В. Гоголь', '🎭'], ['Тургенева', 'И. С. Тургенев', '🐕'], ['Толстого', 'Л. Н. Толстой', '🕊️'], ['Крылова', 'И. А. Крылов', '🐺'], ['Чехова', 'А. П. Чехов', '🦎'], ['Есенина', 'С. А. Есенин', '🌾'], ['Ахматову', 'А. А. Ахматова', '🖤'], ['Зощенко', 'М. М. Зощенко', '😄'], ['Высоцкого', 'В. С. Высоцкий', '🎸'], ['Шукшина', 'В. М. Шукшин', '👢'], ['Айтматова', 'Ч. Т. Айтматов', '🍎'], ['Шекспира', 'У. Шекспир', '🌹']];
function doneCount(){ return READY_ORDER.filter(x => lessonDone(x.id)).length; }
const BADGES = [
  { k: 'first', e: '🌱', n: 'Первый шаг', d: 'Пройти первый урок', t: () => doneCount() >= 1 },
  { k: 'l10', e: '📚', n: 'Книжный червячок', d: 'Пройти 10 уроков', t: () => doneCount() >= 10 },
  { k: 'l50', e: '🎒', n: 'Полпути', d: 'Пройти 50 уроков', t: () => doneCount() >= 50 },
  { k: 'l100', e: '🏛️', n: 'Сотня', d: 'Пройти 100 уроков', t: () => doneCount() >= 100 },
  { k: 'lall', e: '👑', n: 'Весь курс', d: 'Пройти все уроки', t: () => doneCount() >= READY_ORDER.length },
  { k: 's3', e: '🔥', n: 'Разгорается', d: '3 дня подряд', t: () => (store.best || 0) >= 3 },
  { k: 's7', e: '🌟', n: 'Неделя без пропусков', d: '7 дней подряд', t: () => (store.best || 0) >= 7 },
  { k: 's30', e: '☄️', n: 'Месяц огня', d: '30 дней подряд', t: () => (store.best || 0) >= 30 },
  { k: 'perfect', e: '💯', n: 'Без единой ошибки', d: 'Тест на максимум', t: () => Object.keys(store.perf || {}).length >= 1 },
  { k: 'perfect10', e: '✨', n: 'Перфекционистка', d: '10 тестов на максимум', t: () => Object.keys(store.perf || {}).length >= 10 },
  { k: 'mock1', e: '📝', n: 'Первый пробник', d: 'Пройти пробный ЕНТ', t: () => (store.mocks || []).length >= 1 },
  { k: 'mock40', e: '🏆', n: 'Почти грант', d: '40+ баллов на пробнике', t: () => (store.mocks || []).some(m => m.score >= 40) },
  { k: 'fix10', e: '🩹', n: 'Работа над ошибками', d: 'Исправить 10 ошибок', t: () => (store.fixed || 0) >= 10 },
  { k: 'fix50', e: '💪', n: 'Ничего не забываю', d: 'Исправить 50 ошибок', t: () => (store.fixed || 0) >= 50 },
  { k: 'games', e: '🎮', n: 'Игроманка', d: '50 верных ответов в играх', t: () => (store.gameRight || 0) >= 50 },
  { k: 'kind', e: '💗', n: 'Люблю себя', d: '10 добрых слов о себе', t: () => (store.kindN || (store.kind || []).length) >= 10 },
  { k: 'chest5', e: '🗝️', n: 'Хранительница ключа', d: 'Открыть 5 сундучков', t: () => Object.keys(store.chests || {}).length >= 5 },
  { k: 'xp1000', e: '⚡', n: 'Тысяча', d: 'Набрать 1000 XP', t: () => xpTotal() >= 1000 },
  ...AUTHORS.map(([acc, a, e]) => ({ k: 'a_' + acc, e, n: 'Прочла всего ' + acc, d: 'Все уроки: ' + a, t: () => { const ls = LESSONS.filter(L => L.author === a); return ls.length > 0 && ls.every(L => lessonDone(L.id)); } }))
];
function checkBadges(){
  store.badges = store.badges || {}; let got = 0;
  BADGES.forEach(b => { if (!store.badges[b.k] && b.t()) { store.badges[b.k] = today(); got++; if (got <= 2) setTimeout(() => { toast(b.e, 'Новый значок: ' + b.n, b.d); sfx('chest'); }, 500 + got * 700); } });
  store.fseen = store.fseen || { straw: 1 };
  FRAMES.forEach(f => { if (!store.fseen[f.k] && frameOwned(f.k)) { store.fseen[f.k] = 1; got++; setTimeout(() => { toast('🖼️', 'Новая рамка: ' + f.name, 'Выбери её в профиле'); sfx('chest'); }, 900 + got * 700); } });
  if (got) { persist(); push(); }
}

/* =========================================================
   ПРОФИЛЬ
   ========================================================= */
let installEv = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; });
function isStandalone(){ return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone; }
let RATING = null;
function renderRating(){
  document.body.classList.remove('duo-test');
  const mode = renderRating.rt || 'week';
  app.innerHTML = `
  <div class="wrap page">
    <section class="card pagehead">
      ${AVATAR(130, myFrame(), myPose())}
      <div><p class="label">${store.stream ? esc(store.stream) + ' поток' : 'Мой поток'}</p><h1 class="h1">Рейтинг</h1>
      <p class="lead">Кто больше всех занимается на этой неделе, у кого самая длинная серия и кто набрал больше всего опыта за всё время. Топ-3 недели получают корону и рамку «Королева лиги» 👑</p></div>
    </section>
    <div class="card rate">
      <div class="stream rtabs" role="group">${[['week', 'Лига недели'], ['streak', 'Серии'], ['xp', 'За всё время']].map(([k, t]) => `<button type="button" data-rt="${k}" aria-pressed="${mode === k}">${t}</button>`).join('')}</div>
      <div id="rbox"><p class="muted">Загружаем…</p></div>
    </div>
  </div>`;
  app.querySelectorAll('[data-rt]').forEach(b => b.addEventListener('click', () => { renderRating.rt = b.dataset.rt; app.querySelectorAll('[data-rt]').forEach(x => x.setAttribute('aria-pressed', x === b)); sfx('tap'); drawRating(); }));
  loadRating();
}
function loadRating(){
  if (!(CONFIG.api && store.code)) { RATING = null; drawRating(); return; }
  if (RATING) drawRating();
  api({ action: 'board', code: store.code }).then(r => { if (r.ok) { RATING = r.list || []; drawRating(); } }).catch(() => drawRating());
}
function drawRating(){
  const box = document.getElementById('rbox'); if (!box) return;
  const mode = renderRating.rt || 'week';
  const me = { name: firstName() || 'Это ты', me: true, weekXp: weekXp(), streak: streak(), best: store.best || 0, xp: xpTotal(), frame: myFrame(), pose: myPose() };
  if (!RATING) {
    box.innerHTML = `<div class="myplace"><span class="num">?</span><div><b>Рейтинг откроется, когда включим личные кабинеты</b><span>Тогда здесь будет видно, на каком ты месте в своём потоке, и кто рядом</span></div></div>
      <div class="rlist"><div class="rrow mine"><span class="rp">1</span>${AVATAR(44, me.frame, me.pose)}<span class="rn">${esc(me.name)}${firstName() ? ' (ты)' : ''}</span><span class="rv">${valTxt(me, mode)}</span></div></div>`;
    return;
  }
  const list = RATING.map(x => x.me ? Object.assign({}, x, me, { name: x.name }) : x);
  if (!list.some(x => x.me)) list.push(me);
  const key = mode === 'week' ? 'weekXp' : mode === 'streak' ? 'streak' : 'xp';
  list.sort((a, b) => (b[key] || 0) - (a[key] || 0) || (b.best || 0) - (a.best || 0));
  const mi = list.findIndex(x => x.me), place = mi + 1, n = list.length;
  const ahead = mi > 0 ? list[mi - 1] : null, gap = ahead ? (ahead[key] || 0) - (list[mi][key] || 0) : 0;
  const unit = mode === 'streak' ? plural(gap + 1, 'день', 'дня', 'дней') : 'XP';
  const sub = place === 1 ? (n > 1 ? 'Ты на первом месте! Держи корону 👑' : 'Пока ты одна в рейтинге')
    : `До ${place - 1} места: ${mode === 'streak' ? (gap + 1) + ' ' + unit + ' подряд' : (gap + 1) + ' ' + unit}. Ты сможешь!`;
  const row = (x, i) => `<div class="rrow${x.me ? ' mine' : ''}${i < 3 ? ' top' : ''}"><span class="rp">${i + 1}</span>${AVATAR(44, x.frame, x.pose)}<span class="rn">${esc(x.name)}${x.me ? ' (ты)' : ''}</span><span class="rv">${valTxt(x, mode)}</span></div>`;
  let rows = list.slice(0, 10).map(row).join('');
  if (mi >= 10) rows += '<div class="rgap">· · ·</div>' + row(list[mi], mi);
  box.innerHTML = `<div class="myplace"><span class="num">${place}</span><div><b>${place} место из ${n}</b><span>${esc(sub)}</span></div></div><div class="rlist">${rows}</div>`;
}
function valTxt(x, mode){ return mode === 'week' ? (x.weekXp || 0) + ' XP' : mode === 'streak' ? '🔥 ' + (x.streak || 0) : '⚡ ' + (x.xp || 0); }
function avItems(t){
  if (t === 'f') return FRAMES.map(f => { const ok = frameOwned(f.k), on = myFrame() === f.k; return `<button class="avit${on ? ' on' : ''}${ok ? '' : ' lock'}" data-av="f:${f.k}" ${ok ? '' : 'disabled'}>${AVATAR(96, f.k, myPose())}<b>${esc(f.name)}</b>${ok ? '' : `<small>🔒 ${esc(f.cond)} или в сундучке</small>`}</button>`; }).join('');
  if (t === 'p') return POSES.map(p => { const ok = poseOwned(p.k), on = myPose() === p.k; return `<button class="avit${on ? ' on' : ''}${ok ? '' : ' lock'}" data-av="p:${p.k}" ${ok ? '' : 'disabled'}><span class="avpose"><img src="mascot/${p.k}.svg" alt=""></span><b>${esc(p.name)}</b>${ok ? '' : '<small>🔒 в сундучке</small>'}</button>`; }).join('');
  return BGS.map(b => { const ok = bgOwned(b.k), on = (store.pathbg || '') === b.k; return `<button class="avit${on ? ' on' : ''}${ok ? '' : ' lock'}" data-av="b:${b.k}" ${ok ? '' : 'disabled'}><span class="rbg bgsw-${b.k || 'def'}"></span><b>${esc(b.name)}</b>${ok ? '' : '<small>🔒 в сундучке</small>'}</button>`; }).join('');
}
function renderMe(){
  document.body.classList.remove('duo-test');
  const st = stats(), xp = xpTotal(), bd = store.badges || {}, nb = BADGES.filter(b => bd[b.k]).length;
  const next = OUTFITS.find(o => !owned(o.k));
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  app.innerHTML = `
  <div class="wrap page">
    <section class="card mehead">
      <div class="mecat">${AVATAR(180, myFrame(), myPose())}</div>
      <div><p class="label">${store.code ? esc(store.stream || '') + ' поток' : 'Мой профиль'}</p><h1 class="h1">${esc(store.name || 'Привет!')}</h1>
      <div class="mestats">
        <div><b>🔥 ${st.streak}</b><span>серия</span></div>
        <div><b>🏅 ${store.best || 0}</b><span>рекорд серии</span></div>
        <div><b>❄️ ${store.freezes || 0}</b><span>заморозки</span></div>
        <div><b>⚡ ${xp}</b><span>опыт</span></div>
        <div><b>📚 ${st.done}</b><span>уроков</span></div>
        <div><b>🎯 ${st.max ? Math.round(st.got / st.max * 100) : 0}%</b><span>средний балл</span></div>
      </div>
      <p class="muted">Заморозка даётся за каждые 7 дней подряд (максимум 2) и иногда лежит в сундучке. Если пропустишь день, она сама спасёт серию.${store.spare ? ` Запасных сердечек: ${store.spare} ❤️` : ''}</p></div>
    </section>

    ${boostOn() ? `<div class="card boostcard"><b>x2</b><div><h3>Двойной опыт включён</h3><p class="muted">Осталось <span class="boostleft">${boostLeft()}</span>. Весь опыт сейчас удваивается!</p></div></div>` : ''}
    <div class="sec-title"><h2>Моя аватарка</h2><span class="script">рамки, позы и фоны</span></div>
    <div class="card avpick">
      <div class="stream avtabs" role="group">${[['f', 'Рамки'], ['p', 'Позы Дили'], ['b', 'Фон тропинки']].map(([k, t]) => `<button type="button" data-avt="${k}" aria-pressed="${(renderMe.tab || 'f') === k}">${t}</button>`).join('')}</div>
      <div class="avgrid">${avItems(renderMe.tab || 'f')}</div>
    </div>

    <div class="sec-title"><h2>Значки</h2><span class="script">${nb} из ${BADGES.length}</span></div>
    <div class="bdgs">${BADGES.map(b => `<div class="bdg${bd[b.k] ? ' on' : ''}"><span>${b.e}</span><b>${esc(b.n)}</b><small>${esc(b.d)}</small></div>`).join('')}</div>

    <div class="sec-title"><h2>Гардероб Дили</h2><span class="script">${next ? 'следующий наряд на ' + next.xp + ' XP' : 'все наряды открыты!'}</span></div>
    <div class="wardrobe">
      <button class="outfit${!store.outfit ? ' on' : ''}" data-k="">${MASCOT('idle', '')}<b>Без наряда</b></button>
      ${OUTFITS.map(o => { const ok = owned(o.k); return `<button class="outfit${store.outfit === o.k ? ' on' : ''}${ok ? '' : ' lock'}" data-k="${o.k}" ${ok ? '' : 'disabled'}>${MASCOT('idle', o.k, true)}<b>${esc(o.name)}</b>${ok ? '' : `<small>🔒 ${o.xp} XP</small>`}</button>`; }).join('')}
    </div>

    <div class="sec-title"><h2>Настройки</h2></div>
    <div class="card settings">
      <label class="sw"><span>🔊 Звуки</span><input type="checkbox" id="s_sound" ${opt('sound') ? 'checked' : ''}><i></i></label>
      <label class="sw"><span>📳 Вибрация</span><input type="checkbox" id="s_vib" ${opt('vib') ? 'checked' : ''}><i></i></label>
      <div class="sw"><span>🌙 Тема</span><div class="stream" role="group">${[['auto', 'Как в телефоне'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, t]) => `<button type="button" data-th="${k}" aria-pressed="${opt('theme') === k}">${t}</button>`).join('')}</div></div>
      ${store.code ? '' : `<div class="sw"><span>👭 Мой поток</span><div class="stream" role="group">${['2', '3'].map(s => `<button type="button" aria-pressed="${stream() === s}" onclick="setStream('${s}')">${s} поток</button>`).join('')}</div></div>`}
    </div>

    <div class="sec-title"><h2>Приложение</h2></div>
    <div class="appcards">
      <div class="card">
        <h3>📲 Установить на телефон</h3>
        ${isStandalone() ? '<p class="muted">Уже установлено, ты в приложении ✨</p>'
          : ios ? '<p class="muted">В Safari нажми «Поделиться» <b>⎋</b> внизу экрана, потом «На экран Домой». Появится иконка с Дилей.</p>'
          : `<p class="muted">Иконка с Дилей на главном экране, открывается как приложение.</p><button class="dbtn" id="inst">Установить</button>`}
      </div>
      <div class="card">
        <h3>🎬 Заставка</h3>
        <p class="muted">Полёт над кубическим миром показывается раз в день при входе.</p>
        <a class="dbtn ghost" href="intro.html">Посмотреть ещё раз</a>
      </div>
      <div class="card">
        <h3>✈️ Офлайн</h3>
        <p class="muted">Скачай все конспекты и тесты, чтобы заниматься без интернета.</p>
        <button class="dbtn ghost" id="offl">Скачать все уроки</button>
      </div>
      ${CONFIG.api && store.code ? `<div class="card"><h3>🔔 Напоминания в Телеграме</h3><p class="muted">Диля напишет, если серия под угрозой. Нажми и отправь боту «Start».</p><a class="dbtn" href="https://t.me/${CONFIG.bot}?start=${encodeURIComponent(store.code)}" target="_blank" rel="noopener">Подключить</a></div>` : ''}
    </div>
    ${store.code ? '<p style="text-align:center;margin:30px 0 0"><button class="btn btn-light" onclick="logout()">Выйти из кабинета</button></p>' : ''}
  </div>`;
  app.querySelectorAll('[data-avt]').forEach(b => b.addEventListener('click', () => { renderMe.tab = b.dataset.avt; renderMe(); setTimeout(() => { const c = document.querySelector('.avpick'); c && c.scrollIntoView({ block: 'center' }); }, 30); }));
  app.querySelectorAll('[data-av]').forEach(b => b.addEventListener('click', () => {
    const [t, k] = b.dataset.av.split(':');
    if (t === 'f') store.frame = k; if (t === 'p') store.pose = k; if (t === 'b') store.pathbg = k;
    persist(); push(); sfx('tap'); renderMe();
    setTimeout(() => { const c = document.querySelector('.avpick'); c && c.scrollIntoView({ block: 'center' }); }, 30);
  }));
  app.querySelectorAll('.outfit').forEach(b => b.addEventListener('click', () => { store.outfit = b.dataset.k; persist(); push(); sfx('tap'); renderMe(); const h = document.getElementById('hopper'); h && h.remove(); }));
  document.getElementById('s_sound').addEventListener('change', e => { setOpt('sound', e.target.checked); sfx('right'); });
  document.getElementById('s_vib').addEventListener('change', e => { setOpt('vib', e.target.checked); sfx('right'); });
  app.querySelectorAll('[data-th]').forEach(b => b.addEventListener('click', () => { setOpt('theme', b.dataset.th); applyTheme(); renderMe(); }));
  const inst = document.getElementById('inst');
  inst && inst.addEventListener('click', () => { if (installEv) { installEv.prompt(); installEv = null; } else toast('📲', 'Через меню браузера', 'Открой меню браузера ⋮ и выбери «Установить приложение» или «Добавить на главный экран»'); });
  document.getElementById('offl').addEventListener('click', e => {
    const b = e.target; b.disabled = true;
    loadMany(READY_ORDER.map(x => x.id), (n, t) => { b.textContent = 'Скачиваю ' + n + ' / ' + t; }).then(() => fetch('data/heroes.json')).then(() => { b.textContent = '✓ Все уроки на устройстве'; toast('✈️', 'Готово!', 'Теперь уроки откроются даже без интернета'); });
  });
}

/* =========================================================
   РОУТЕР И ЗАПУСК
   ========================================================= */
function setPathBg(on){
  BGS.forEach(b => b.k && document.body.classList.remove('bg-' + b.k));
  document.body.classList.toggle('pathpage', !!on);
  const k = store.pathbg; if (on && k && bgOwned(k)) document.body.classList.add('bg-' + k);
}
function setNav(h){
  const cur = ['review', 'mock', 'games', 'me', 'map', 'rating'].includes(h) ? h : 'home';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === cur));
  const n = dueMistakes().length;
  document.querySelectorAll('.navdot').forEach(d => { d.textContent = n; d.hidden = !n; });
}
function route(){
  const h = location.hash.replace(/^#\/?/, '').split('/');
  if (G && G.end && h[0] !== 'games') { clearInterval(G.t); G.end = 0; }
  if (h[0] !== 'mock') clearInterval(tickMock.t);
  setNav(h[0]); setPathBg(false);
  if (CONFIG.api && !store.code) { document.body.classList.remove('duo-test'); renderLogin(); window.scrollTo(0, 0); return; }
  if (h[0] === 'lesson' && h[2] === 'test') { renderDuoTest(h[1]); window.scrollTo(0, 0); return; }
  document.body.classList.remove('duo-test');
  if (h[0] === 'lesson') renderLesson(h[1], h[2]);
  else if (h[0] === 'review') renderReview();
  else if (h[0] === 'mock') renderMock();
  else if (h[0] === 'map' || h[0] === 'schedule' || h[0] === 'points') { renderMap(); if (h[0] !== 'map') { const el = document.getElementById(h[0]); el && setTimeout(() => el.scrollIntoView(), 30); return; } }
  else if (h[0] === 'games') { if (h[1]) { startGame(h[1]); window.scrollTo(0, 0); return; } renderGames(); }
  else if (h[0] === 'me') renderMe();
  else if (h[0] === 'rating') renderRating();
  else { setPathBg(true); renderHome(); return; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
document.getElementById('year') && (document.getElementById('year').textContent = new Date().getFullYear());
freezeCheck();
headerUser();
route();
setTimeout(checkBadges, 1500);
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js').catch(() => {});
