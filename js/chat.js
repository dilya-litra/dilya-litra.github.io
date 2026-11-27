/* =========================================================
   dilya.litra: чат с Дилей (ИИ-помощница)
   Сервер: CONFIG.chat (Cloudflare Worker, см. worker/worker.js)
   База знаний: конспекты курса. По вопросу ученицы сайт
   находит подходящие уроки и отправляет их текст вместе с вопросом.
   ========================================================= */
'use strict';

const CHAT_KEY = 'dilyaChat', CHAT_DAY = 60;
const CHAT_URL = (typeof CONFIG !== 'undefined' && CONFIG.chat) || '';
let CH = { msgs: [], ctx: [], day: '', n: 0 };
try { CH = Object.assign(CH, JSON.parse(localStorage.getItem(CHAT_KEY)) || {}); } catch (e) {}
let chBusy = false;

/* Как Диля пишет. Меняй здесь, сервер трогать не нужно */
const CHAT_STYLE = `Пиши как живой человек в мессенджере, а не как бот или учебник.
- Не начинай с «Конечно!», «Отличный вопрос!», «Привет!» (если уже здоровались), «Давай разберёмся». Сразу к делу.
- Длина под собеседницу: на короткое сообщение отвечай коротко (1–3 предложения), на «объясни подробно» подробно. На «как дела» не надо лекций.
- Смайлики: максимум один на сообщение, часто вообще без них. Ставь только там, где правда есть эмоция (шутка, радость, сочувствие), и только в конце фразы. Не ставь смайлик после каждого предложения и не ставь их в объяснениях по учёбе.
- Списки и жирный шрифт только когда правда нужно перечислить (признаки, герои, план). В обычном разговоре пиши простым текстом.
- Не повторяй одну и ту же схему в каждом ответе. Не заканчивай каждый ответ вопросом или предложением «если хочешь, могу…». Вопрос в конце уместен, только когда он правда нужен.
- Можно лёгкий разговорный тон («слушай», «честно», «вот тут интересно»), но без кринжа и без молодёжного сленга через слово.
- Не хвали за каждый вопрос. Похвала только за реальное: правильный ответ, старание, хороший вывод.
- Когда ученице плохо, пиши мягко и по-человечески, без шаблонных фраз и без списков советов. Сначала услышь её.

Примеры, как надо:
Ученица: как дела?
Диля: Да вот, перечитываю Гоголя, у него что ни герой, то характер. А ты как? Учёба не душит?

Ученица: почему Акакий так любил шинель
Диля: Потому что шинель стала для него первой настоящей радостью за всю жизнь. Он годами копил на неё, отказывал себе в ужине и свечах, и она будто сделала его человеком, которого наконец заметили. Поэтому, когда её украли, он потерял не вещь, а единственный смысл.

Ученица: мне грустно
Диля: Мне жаль, что тебе сейчас так. Что случилось? Можешь рассказать как есть, я никуда не тороплюсь.`;

function chSave(){ CH.msgs = CH.msgs.slice(-40); try { localStorage.setItem(CHAT_KEY, JSON.stringify(CH)); } catch (e) {} }
function chLeft(){ if (CH.day !== today()) { CH.day = today(); CH.n = 0; } return CHAT_DAY - CH.n; }

/* ---------- поиск нужного конспекта ---------- */
function norm(s){ return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
function stem(w){ w = norm(w).replace(/[^а-яa-z]/g, ''); return w.length > 6 ? w.slice(0, w.length - 2) : w; }
let CIDX = null, CHEROES = null;
function chIndex(){
  if (CIDX) return CIDX;
  CIDX = LESSONS.map(L => {
    const keys = new Set();
    norm(L.title).replace(/[«»"().,:;!?]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !/^(тема|идея|роман|поэма|рассказ|повесть|лирика|стихи)$/.test(w)).forEach(w => keys.add(stem(w)));
    if (L.author && !/Теория|Былины|Мифология|Библия/.test(L.author)) { const s = L.author.trim().split(/\s+/).pop(); s.length > 3 && keys.add(stem(s)); }
    if (/Теория/.test(L.author || '')) norm(L.sub).split(/\s+/).filter(w => w.length > 4).forEach(w => keys.add(stem(w)));
    return { id: L.id, keys: [...keys].filter(k => k.length >= 4) };
  });
  return CIDX;
}
function chHeroes(){ if (CHEROES) return Promise.resolve(CHEROES); return fetch('data/heroes.json').then(r => r.json()).then(h => (CHEROES = h.map(x => [x[0], x[1].split(/[\s,(]+/).filter(w => w.length > 3 && /^[А-ЯЁ]/.test(w)).map(stem)]))).catch(() => (CHEROES = [])); }
function chPick(text){
  const t = norm(text), score = {};
  chIndex().forEach(x => x.keys.forEach(k => { if (t.includes(k)) score[x.id] = (score[x.id] || 0) + (k.length > 6 ? 3 : 2); }));
  (CHEROES || []).forEach(([id, ws]) => ws.forEach(w => { if (w.length >= 4 && t.includes(w)) score[id] = (score[id] || 0) + 2; }));
  const m = location.hash.match(/#\/lesson\/([\w-]+)/); if (m && byId(m[1])) score[m[1]] = (score[m[1]] || 0) + 1;
  const ids = Object.keys(score).filter(id => byId(id)).sort((a, b) => score[b] - score[a]);
  return ids.filter(id => score[id] >= score[ids[0]] * 0.7).slice(0, 2);
}
function flatText(x){ if (x == null) return ''; if (typeof x === 'string') return x; if (Array.isArray(x)) return x.map(flatText).filter(Boolean).join(x.every(v => typeof v === 'string') ? ' · ' : '\n'); if (typeof x === 'object') return Object.keys(x).map(k => flatText(x[k])).filter(Boolean).join('\n'); return String(x); }
function lessonText(L, q){
  const head = '### ' + (L.author ? L.author + ' ' : '') + '«' + L.title + '»\n' + (L.facts || []).map(f => f.join(': ')).join('\n');
  const words = norm(q).split(/[^а-яa-z0-9]+/).filter(w => w.length > 3).map(stem);
  const blocks = (L.blocks || []).map((b, i) => { const t = '## ' + b.h + '\n' + flatText(b.items), lt = norm(t); return { i, t, sc: words.reduce((s, w) => s + (lt.includes(w) ? 1 : 0), 0) + (norm(b.h).match(/пересказ|герои|персонаж|тема|идея/) ? 0.5 : 0) }; });
  const pick = blocks.slice().sort((a, b) => b.sc - a.sc || a.i - b.i);
  let out = [], len = head.length;
  for (const b of pick) { const t = b.t.slice(0, 3500); if (len + t.length > 7000) continue; out.push(b); len += t.length; }
  return head + '\n\n' + out.sort((a, b) => a.i - b.i).map(b => b.t.slice(0, 3500)).join('\n\n');
}
function chContext(text){
  return chHeroes().then(() => {
    let ids = chPick(text); if (!ids.length) ids = (CH.ctx || []).slice(0, 1);
    CH.ctx = ids;
    return Promise.all(ids.map(id => loadLesson(id).then(L => lessonText(L, text)).catch(() => ''))).then(a => a.filter(Boolean).join('\n\n'));
  });
}

/* ---------- окно чата ---------- */
function fmtMsg(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,!?:;]|$)/g, '$1<i>$2</i>')
    .split('\n').map(l => /^\s*[-•*]\s+/.test(l) ? '<li>' + l.replace(/^\s*[-•*]\s+/, '') + '</li>' : l).join('\n')
    .replace(/(<li>.*?<\/li>\n?)+/gs, m => '<ul>' + m.replace(/\n/g, '') + '</ul>').replace(/\n/g, '<br>');
}
const CHIPS = ['Объясни, что такое тропы', 'Проверь меня по «Шинели»', 'Как не волноваться перед ЕНТ?', 'Мне грустно'];
function chatBtn(){
  if (document.getElementById('chatfab')) return;
  const b = document.createElement('button'); b.id = 'chatfab'; b.className = 'chatfab'; b.setAttribute('aria-label', 'Чат с Дилей');
  b.innerHTML = '<img src="mascot/wave.svg" alt=""><span>Диля</span>';
  b.addEventListener('click', openChat); document.body.appendChild(b);
}
function openChat(){
  let w = document.getElementById('chatwin');
  if (!w) { w = document.createElement('div'); w.id = 'chatwin'; w.className = 'chatwin'; document.body.appendChild(w); }
  document.body.classList.add('chat-on');
  const nm = typeof firstName === 'function' ? firstName() : '';
  w.innerHTML = `<div class="chhead"><img src="mascot/wave.svg" alt=""><div><b>Диля</b><span>ИИ-помощница курса 💗</span></div><button class="chmenu" data-clear title="Очистить чат">🗑</button><button class="chx" data-close aria-label="Закрыть">×</button></div>
    <div class="chlog" id="chlog">
      <div class="chm a"><div class="cb">Привет${nm ? ', ' + esc(nm) : ''}! Я Диля 🌸 Спрашивай про любое произведение из курса, проверю тебя в формате ЕНТ или просто поболтаем. Если на душе тяжело, тоже пиши, я выслушаю.</div><small>Я ИИ и иногда ошибаюсь, сверяйся с конспектами. Не пиши мне личные данные: адрес, телефон, пароли.</small></div>
      ${CH.msgs.map(m => `<div class="chm ${m.r}"><div class="cb">${m.r === 'a' ? fmtMsg(m.t) : esc(m.t).replace(/\n/g, '<br>')}</div></div>`).join('')}
    </div>
    ${CH.msgs.length ? '' : `<div class="chchips">${CHIPS.map(c => `<button>${esc(c)}</button>`).join('')}</div>`}
    <form class="chin" id="chform"><textarea id="chtext" rows="1" maxlength="1500" placeholder="Напиши Диле…"></textarea><button aria-label="Отправить">➤</button></form>`;
  const log = w.querySelector('#chlog'), ta = w.querySelector('#chtext');
  log.scrollTop = log.scrollHeight;
  w.querySelector('[data-close]').addEventListener('click', closeChat);
  w.querySelector('[data-clear]').addEventListener('click', () => { if (!confirm('Очистить переписку с Дилей?')) return; CH.msgs = []; CH.ctx = []; chSave(); openChat(); });
  w.querySelectorAll('.chchips button').forEach(b => b.addEventListener('click', () => chSend(b.textContent)));
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !/iphone|android/i.test(navigator.userAgent)) { e.preventDefault(); w.querySelector('#chform').requestSubmit(); } });
  w.querySelector('#chform').addEventListener('submit', e => { e.preventDefault(); const v = ta.value.trim(); if (v) { ta.value = ''; ta.style.height = 'auto'; chSend(v); } });
  if (!/iphone|android/i.test(navigator.userAgent)) setTimeout(() => ta.focus(), 50);
}
function closeChat(){ const w = document.getElementById('chatwin'); w && w.remove(); document.body.classList.remove('chat-on'); }
function chAdd(r, t, cls){
  const log = document.getElementById('chlog'); if (!log) return null;
  const d = document.createElement('div'); d.className = 'chm ' + r + (cls ? ' ' + cls : '');
  d.innerHTML = '<div class="cb">' + (r === 'a' ? fmtMsg(t) : esc(t).replace(/\n/g, '<br>')) + '</div>';
  log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
}
function chSend(text){
  if (chBusy) return;
  const ch = document.querySelector('.chchips'); ch && ch.remove();
  if (chLeft() <= 0) { chAdd('u', text); chAdd('a', 'Ой, на сегодня мы с тобой наговорились: ' + CHAT_DAY + ' сообщений 🙈 Отдохни, а завтра я снова тут 💗'); return; }
  CH.msgs.push({ r: 'u', t: text }); CH.n++; chSave(); chAdd('u', text);
  const typing = chAdd('a', '', 'typing'); typing && (typing.querySelector('.cb').innerHTML = '<i></i><i></i><i></i>');
  chBusy = true;
  const done = (reply, keep) => {
    chBusy = false; typing && typing.remove();
    if (keep) { CH.msgs.push({ r: 'a', t: reply }); chSave(); } else { CH.n = Math.max(0, CH.n - 1); const l = CH.msgs[CH.msgs.length - 1]; if (l && l.r === 'u') CH.msgs.pop(); chSave(); }
    chAdd('a', reply); sfx('tap');
  };
  if (!CHAT_URL) { setTimeout(() => done('Я пока учусь и совсем скоро заработаю 🌸 Загляни чуть позже!', false), 700); return; }
  chContext(text).then(ctx => fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgs: CH.msgs.slice(-12), ctx, style: CHAT_STYLE, name: typeof firstName === 'function' ? firstName() : '' }) }))
    .then(r => {
      if (!r.ok || !/event-stream/.test(r.headers.get('content-type') || '') || !r.body) {
        return r.json().catch(() => ({})).then(d => done(d.reply ? d.reply : d.error === 'slow' ? 'Ты пишешь быстрее, чем я думаю 😅 Подожди минутку и спроси ещё раз' : 'У меня сейчас очень много вопросов, я чуть-чуть запуталась. Попробуй через пару минут', !!d.reply));
      }
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', all = '', bubble = null;
      const paint = () => { if (!bubble) { typing && typing.remove(); bubble = chAdd('a', ''); } bubble.querySelector('.cb').innerHTML = fmtMsg(all); const log = document.getElementById('chlog'); log && (log.scrollTop = log.scrollHeight); };
      const pump = () => reader.read().then(({ value, done: end }) => {
        if (value) {
          buf += dec.decode(value, { stream: true }); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
            if (!line.startsWith('data:')) continue; const p = line.slice(5).trim(); if (p === '[DONE]') continue;
            try { all += JSON.parse(p).t || ''; paint(); } catch (e) {}
          }
        }
        if (!end) return pump();
        chBusy = false; typing && typing.remove();
        if (all.trim()) { CH.msgs.push({ r: 'a', t: all }); chSave(); sfx('tap'); } else done('Ой, я потеряла мысль. Спроси ещё раз?', false);
      });
      return pump();
    })
    .catch(() => done('Не получается связаться 😔 Проверь интернет и попробуй ещё раз', false));
}
if (CHAT_URL || location.search.indexOf('chat') >= 0) chatBtn();
