// The test phone (left) and the Studio (right).

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

const PROFILES = {
  'sim-meera': { name: 'Meera Kapoor', label: 'Meera', role: 'client' },
  'sim-sunita': { name: 'Sunita Sharma', label: 'Sunita', role: 'gift recipient' },
};
const TRY = [
  'Hi', 'Do you have something in red for my mother under 70k?', 'Tell me about Zarina', 'Is it real pashmina?',
  'Any discount?', 'Can I pay cash on delivery?', 'Where is my order?', 'I need 30 shawls for my daughter’s wedding',
  'Can you add my initials?', 'Can I see it on a video call?', 'Do you ship to Dubai?', 'I’d like to speak to someone',
];
const RECIPIENT = { mother: 'mother', wife: 'wife', husband: 'husband', father: 'father', daughter: 'daughter', sister: 'sister', friend: 'a friend', colleague: 'a colleague', special: 'someone special' };

let current = 'sim-meera';
try { current = localStorage.getItem('shawlbot.client') || current; } catch { /* storage off */ }
if (!PROFILES[current]) current = 'sim-meera';
let transcript = [];
let typing = false;
let studio = null;
let tab = 'orders';
const unread = new Set();

const chat = $('#chat');
const sheetWrap = $('#sheetWrap');
const sheet = $('#sheet');

// On the Mac the page talks to server.js. In the online demo the whole bot runs inside this browser tab.
const DEMO = window.SHAWL_DEMO === true;
if (DEMO && new URLSearchParams(location.search).get('seed')) document.documentElement.classList.add('still'); // screenshots: no fade-ins
const backend = DEMO ? await import('./demo-backend.js') : null;

async function api(path, body) {
  if (backend) return backend.api(path, body);
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  return res.json();
}

// Invoices and certificates: real pages on the Mac; made on the spot in the demo.
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[href^="#doc/"]');
  if (!a || !backend) return;
  ev.preventDefault();
  const [, kind, orderId] = a.getAttribute('href').split('/');
  const url = URL.createObjectURL(new Blob([backend.docHTML(kind, orderId)], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
});

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).toLowerCase();

// WhatsApp formatting: *bold*, _italic_, ~strike~, ```mono```, "> " quotes.
function fmt(s) {
  const lines = esc(s).split('\n');
  const out = [];
  let quote = [];
  const flush = () => { if (quote.length) { out.push(`<span class="q">${quote.join('<br>')}</span>`); quote = []; } };
  for (const l of lines) {
    if (l.startsWith('&gt; ')) quote.push(l.slice(5));
    else { flush(); out.push(l + '<br>'); }
  }
  flush();
  let h = out.join('').replace(/<br>$/, '');
  h = h.replace(/```([\s\S]+?)```/g, '<code>$1</code>');
  const wrap = (mark, tag) => {
    const m = mark.replace(/[*~]/g, '\\$&');
    h = h.replace(new RegExp(`(^|[\\s(>])${m}(?!\\s)([^${mark}<]+?)${m}(?=$|[\\s).,!?:;<])`, 'g'), `$1<${tag}>$2</${tag}>`);
  };
  wrap('*', 'b'); wrap('_', 'i'); wrap('~', 's');
  return h;
}

const ICON = {
  reply: '<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" fill="currentColor"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  form: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path d="M4 9l1.5-5h13L20 9M4 9h16M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M5 11v9h14v-9M10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
};

// ---------- the phone ----------

function stamp(entry, read) {
  return `<span class="t">${timeOf(entry.at)}${entry.dir === 'in' ? `<span class="tick" style="color:${read ? '#53BDEB' : '#8696A0'}">✓✓</span>` : ''}</span>`;
}

function formSummary(ev) {
  const v = ev.values || {};
  if (ev.name === 'gift_finder') return [v.recipient, v.occasion, v.budget].flat().filter(Boolean).map((x) => LABELS[x] || x).join(' · ');
  return [v.for_whom === 'me' ? 'For me' : 'A gift', v.presentation === 'chest' ? 'Walnut chest' : 'Signature box',
    v.for_whom !== 'me' && (v.card_text || (v.card_choice && v.card_choice !== 'none')) ? 'Handwritten card' : null,
    v.delivery === 'date' && v.date ? `Arrive ${new Date(v.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'As soon as possible'].filter(Boolean).join(' · ');
}
const LABELS = {
  mother: 'My mother', wife: 'My wife', husband: 'My husband', father: 'My father', daughter: 'My daughter', sister: 'My sister',
  friend: 'A friend', colleague: 'A colleague', special: 'Someone special', wedding: 'A wedding', anniversary: 'An anniversary',
  birthday: 'A birthday', festive: 'Diwali or a festival', thanks: 'A thank-you', just: 'Just because',
  b1: 'Up to ₹15,000', b2: '₹15,000 to ₹50,000', b3: '₹50,000 to ₹1,00,000', b4: 'Above ₹1,00,000', b5: 'No limit',
};

function clientBubble(e, read) {
  const ev = e.event;
  if (ev.type === 'payment') {
    return ev.status === 'captured'
      ? `<div class="sys">Payment successful · ${esc(ev.method)}</div>`
      : '<div class="sys bad">Payment failed · nothing was charged</div>';
  }
  let inner = '';
  if (ev.type === 'text') inner = (ev.referral?.pieceId ? `<div class="quote">${ICON.shop} From the catalogue</div>` : '') + fmt(ev.text);
  if (ev.type === 'form') inner = `<div class="pin">${ICON.form}<div><b>${ev.name === 'gift_finder' ? 'Gift details sent' : 'Box, card & delivery sent'}</b><br>${esc(formSummary(ev))}</div></div>`;
  if (ev.type === 'reply') inner = (e.quote ? `<div class="quote">${esc(e.quote)}</div>` : '') + esc(ev.title || ev.id);
  if (ev.type === 'address') {
    const a = ev.address;
    inner = `<div class="pin">${ICON.pin}<div><b>Delivery address</b><br>${esc(a.name)}<br>${esc([a.house, a.building, a.area].filter(Boolean).join(', '))}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.pin)}</div></div>`;
  }
  if (ev.type === 'media') inner = 'Photo';
  return `<div class="row out"><div class="b">${inner}${stamp(e, read)}</div></div>`;
}

function botBubble(e) {
  const m = e.msg;
  const t = stamp(e);
  const header = (h) => !h ? '' : h.type === 'image'
    ? `<div class="hd"><img src="${esc(h.mediaUrl)}" alt="" data-zoom="${esc(h.mediaUrl)}"></div>`
    : `<div class="hdt">${esc(h.text)}</div>`;
  const foot = m.footer ? `<div class="ft">${esc(m.footer)}</div>` : '';
  switch (m.type) {
    case 'text':
      return `<div class="row in"><div class="b">${fmt(m.body)}${t}</div></div>`;
    case 'image':
      return `<div class="row in"><div class="b media"><img src="${esc(m.mediaUrl)}" alt="" data-zoom="${esc(m.mediaUrl)}">${m.caption ? `<div class="cap">${fmt(m.caption)}${t}</div>` : `<span class="t over">${timeOf(e.at)}</span>`}</div></div>`;
    case 'document':
      return `<div class="row in"><div class="b media"><a class="doc" href="${esc(m.docUrl)}" target="_blank" rel="noopener"><span class="ic">PDF</span><span><span class="fn">${esc(m.filename)}</span><br><span class="meta">PDF · tap to open</span></span></a>${m.caption ? `<div class="cap">${fmt(m.caption)}${t}</div>` : ''}</div></div>`;
    case 'buttons':
      return `<div class="row in"><div class="b ib">${header(m.header)}<div class="bd">${fmt(m.body)}${m.footer ? '' : t}</div>${m.footer ? `<div class="ft">${esc(m.footer)}${t}</div>` : ''}${m.buttons.map((b) => `<button class="act" data-act="reply" data-id="${esc(b.id)}" data-title="${esc(b.title)}" data-ctx="${e.id}">${ICON.reply}${esc(b.title)}</button>`).join('')}</div></div>`;
    case 'list':
      return `<div class="row in"><div class="b ib">${header(m.header)}<div class="bd">${fmt(m.body)}${m.footer ? '' : t}</div>${m.footer ? `<div class="ft">${esc(m.footer)}${t}</div>` : ''}<button class="act" data-act="list" data-entry="${e.id}">${ICON.list}${esc(m.button)}</button></div></div>`;
    case 'cta':
      return `<div class="row in"><div class="b ib"><div class="bd">${fmt(m.body)}${t}</div>${foot}<a class="act" href="${esc(m.button.url)}" target="_blank" rel="noopener" style="text-decoration:none">${ICON.link}${esc(m.button.title)}</a></div></div>`;
    case 'address':
      return `<div class="row in"><div class="b ib"><div class="bd">${fmt(m.body)}${t}</div><button class="act" data-act="address" data-entry="${e.id}">${ICON.pin}Provide address</button></div></div>`;
    case 'carousel':
      return `<div class="row in car"><div class="b">${fmt(m.body)}${t}</div><div class="strip">${m.cards.map((c) => `
        <div class="ccard"><img src="${esc(c.mediaUrl)}" alt="" data-zoom="${esc(c.mediaUrl)}" loading="lazy"><div class="cb">${fmt(c.body)}</div>
        ${c.buttons.map((b) => `<button class="act" data-act="reply" data-id="${esc(b.id)}" data-title="${esc(b.title)}" data-ctx="${e.id}">${ICON.reply}${esc(b.title)}</button>`).join('')}</div>`).join('')}</div></div>`;
    case 'flow':
      return `<div class="row in"><div class="b ib"><div class="bd">${fmt(m.body)}${m.footer ? '' : t}</div>${m.footer ? `<div class="ft">${esc(m.footer)}${t}</div>` : ''}<button class="act" data-act="flow" data-entry="${e.id}">${ICON.form}${esc(m.button)}</button></div></div>`;
    case 'catalog':
      return `<div class="row in"><div class="b ib">${m.thumbnailUrl ? `<div class="hd catthumb"><img src="${esc(m.thumbnailUrl)}" alt=""><span>${ICON.shop} Catalogue</span></div>` : ''}<div class="bd">${fmt(m.body)}${m.footer ? '' : t}</div>${m.footer ? `<div class="ft">${esc(m.footer)}${t}</div>` : ''}<button class="act" data-act="catalog">${ICON.shop}${esc(m.button)}</button></div></div>`;
    case 'order': {
      const o = m.order;
      const it = o.items[0];
      const count = o.items.length + o.extras.length;
      return `<div class="row in"><div class="b ib order"><div class="oh"><img src="${esc(it.mediaUrl)}" alt=""><div><b>Order ${esc(o.ref)}</b><span>${count} item${count > 1 ? 's' : ''} · ${inr(o.total)}</span></div></div><div class="bd">${fmt(m.body)}</div>${m.footer ? `<div class="ft">${esc(m.footer)}${t}</div>` : ''}<button class="act" data-act="order" data-entry="${e.id}">${ICON.bag}Review and pay</button></div></div>`;
    }
    default:
      return '';
  }
}

// Keep the newest message in view, unless the person has scrolled up to read.
let pinned = true;
chat.addEventListener('scroll', () => { pinned = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80; });
function stick() { if (pinned) chat.scrollTop = chat.scrollHeight; }
function watchImages(root) {
  root.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', stick, { once: true }); });
}

function renderChat() {
  let lastOut = -1;
  transcript.forEach((e, i) => { if (e.dir === 'out') lastOut = i; });
  const html = transcript.map((e, i) => (e.dir === 'in' ? clientBubble(e, i < lastOut) : botBubble(e))).join('');
  chat.innerHTML = '<div class="day">Today</div>' + html;
  setTyping(typing);
  pinned = true;
  watchImages(chat);
  stick();
}

function addEntry(e) {
  transcript.push(e);
  const typingEl = chat.querySelector('.typing');
  if (e.dir === 'out') chat.querySelectorAll('.tick').forEach((t) => { t.style.color = '#53BDEB'; });
  const holder = document.createElement('div');
  holder.innerHTML = e.dir === 'in' ? clientBubble(e, false) : botBubble(e);
  const node = holder.firstElementChild;
  if (!node) return;
  chat.insertBefore(node, typingEl);
  if (e.dir === 'in') pinned = true;
  watchImages(node);
  stick();
}

function setTyping(on) {
  typing = on;
  const el = chat.querySelector('.typing');
  if (on && !el) { chat.insertAdjacentHTML('beforeend', '<div class="typing"><i></i><i></i><i></i></div>'); stick(); }
  if (!on && el) el.remove();
}

function renderWho() {
  $('#who').innerHTML = Object.entries(PROFILES).map(([id, p]) =>
    `<button data-client="${id}" class="${id === current ? 'on' : ''}"><span class="dot">${p.label[0]}</span>${esc(p.label)} <span style="color:var(--muted)">· ${p.role}</span>${unread.has(id) ? '<span class="unread"></span>' : ''}</button>`).join('');
}

async function switchClient(id) {
  current = id;
  try { localStorage.setItem('shawlbot.client', id); } catch { /* storage off */ }
  unread.delete(id);
  typing = false;
  transcript = await api(`api/sim/history?client=${encodeURIComponent(id)}`);
  renderWho();
  renderChat();
}

function sendEvent(event) {
  return api('api/sim/inbound', { clientId: current, profileName: PROFILES[current].name, event });
}

const entryById = (id) => transcript.find((e) => e.id === id);

// ---------- sheets inside the phone ----------

function openSheet(html) { sheet.innerHTML = (sheet.classList.contains('full') ? '' : '<div class="grab"></div>') + html; sheetWrap.classList.add('on'); sheet.scrollTop = 0; }
function closeSheet() { sheetWrap.classList.remove('on'); sheet.innerHTML = ''; sheet.classList.remove('full'); }
sheetWrap.addEventListener('click', (ev) => { if (ev.target === sheetWrap) closeSheet(); });

function openList(entry) {
  const m = entry.msg;
  let chosen = null;
  openSheet(`<div class="sh"><b>${esc(m.button)}</b><button class="x" data-close aria-label="Close">×</button></div>
    ${m.sections.map((s) => `${m.sections.length > 1 || s.title ? `<div class="sec">${esc(s.title || '')}</div>` : ''}${s.rows.map((r) => `<div class="opt" role="button" tabindex="0" data-id="${esc(r.id)}" data-title="${esc(r.title)}"><div class="tx"><div class="tt">${esc(r.title)}</div>${r.description ? `<div class="ds">${esc(r.description)}</div>` : ''}</div><span class="rd"></span></div>`).join('')}`).join('')}
    <div class="foot"><button class="primary" id="listSend" disabled>Send</button></div>`);
  sheet.querySelectorAll('.opt').forEach((o) => {
    const pick = () => { sheet.querySelectorAll('.opt').forEach((x) => x.classList.remove('sel')); o.classList.add('sel'); chosen = o; $('#listSend').disabled = false; };
    o.addEventListener('click', pick);
    o.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
  });
  $('#listSend').addEventListener('click', () => {
    if (!chosen) return;
    sendEvent({ type: 'reply', id: chosen.dataset.id, title: chosen.dataset.title, context: entry.id });
    closeSheet();
  });
}

const SAMPLES = {
  gift: { name: 'Sunita Sharma', phone: '98290 00000', pin: '302006', house: '14', building: 'Rose Villa', area: 'Civil Lines', landmark: 'Near Raj Bhawan', city: 'Jaipur', state: 'Rajasthan' },
  home: { name: 'Meera Kapoor', phone: '98100 00000', pin: '110024', house: 'C-41', building: '', area: 'Defence Colony', landmark: '', city: 'New Delhi', state: 'Delhi' },
};
const FIELDS = [['name', 'Full name'], ['phone', 'Phone number'], ['pin', 'PIN code'], ['house', 'Flat, house no.'], ['building', 'Building, apartment (optional)'], ['area', 'Area, street, sector'], ['landmark', 'Landmark (optional)'], ['city', 'City'], ['state', 'State']];

function openAddress(entry) {
  const m = entry.msg;
  openSheet(`<div class="sh"><b>Delivery address</b><button class="x" data-close aria-label="Close">×</button></div>
    ${(m.saved || []).map((a, i) => `<div class="saved" data-saved="${i}"><b>${esc(a.name)}</b><br>${esc([a.house, a.area, a.city].filter(Boolean).join(', '))} ${esc(a.pin)}</div>`).join('')}
    <div class="fill"><span style="font-size:12.5px;color:var(--wa-sub);align-self:center">Test fill:</span><button data-fill="gift">Gift to Jaipur</button><button data-fill="home">My home, Delhi</button></div>
    <form class="form" id="addrForm">
      ${FIELDS.map(([k, label]) => `<label>${label}<input name="${k}" ${['building', 'landmark'].includes(k) ? '' : 'required'} ${k === 'pin' ? 'inputmode="numeric" pattern="\\d{6}"' : ''}></label>`).join('')}
    </form>
    <div class="foot"><button class="primary" id="addrSend">Send address</button></div>`);
  const form = $('#addrForm');
  const fill = (a) => FIELDS.forEach(([k]) => { form.elements[k].value = a[k] || ''; });
  sheet.querySelectorAll('[data-fill]').forEach((b) => b.addEventListener('click', () => fill(SAMPLES[b.dataset.fill])));
  sheet.querySelectorAll('[data-saved]').forEach((b) => b.addEventListener('click', () => {
    sendEvent({ type: 'address', address: m.saved[+b.dataset.saved] });
    closeSheet();
  }));
  $('#addrSend').addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const a = Object.fromEntries(FIELDS.map(([k]) => [k, form.elements[k].value.trim()]));
    sendEvent({ type: 'address', address: a });
    closeSheet();
  });
}

function openOrder(entry) {
  const o = entry.msg.order;
  const it = o.items[0];
  openSheet(`<div class="sh"><b>Review and pay</b><button class="x" data-close aria-label="Close">×</button></div>
    <div class="item"><img src="${esc(it.mediaUrl)}" alt=""><div><b>${esc(it.name)}</b><br><span style="color:var(--wa-sub);font-size:13px">Quantity 1</span></div><div style="margin-left:auto;font-weight:600">${inr(it.price)}</div></div>
    <div class="lines">${o.lines.map(([k, v]) => `<div class="ln"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}
    <div class="ln tot"><span>Total</span><span>${inr(o.total)}</span></div>
    <div class="ln" style="color:var(--wa-sub);font-size:13px;padding-top:0"><span>GST ${o.gstRate}% included</span><span></span></div></div>
    <div class="foot"><button class="primary" id="payBtn">Pay ${inr(o.total)}</button><div class="rzp">Secured by Razorpay · Order ${esc(o.ref)}</div></div>`);
  $('#payBtn').addEventListener('click', () => {
    openSheet(`<div class="sh"><b>Pay ${inr(o.total)}</b><button class="x" data-close aria-label="Close">×</button></div>
      <div class="sec">UPI</div>
      ${['Google Pay', 'PhonePe', 'Paytm', 'Other UPI apps'].map((n) => `<div class="opt" role="button" tabindex="0" data-method="${n}"><div class="tx"><div class="tt">${n}</div></div><span style="color:var(--wa-sub)">›</span></div>`).join('')}
      <div class="sec">Other ways</div>
      ${['Credit or debit card', 'Netbanking'].map((n) => `<div class="opt" role="button" tabindex="0" data-method="${n}"><div class="tx"><div class="tt">${n}</div><div class="ds">via Razorpay</div></div><span style="color:var(--wa-sub)">›</span></div>`).join('')}
      <div class="rzp">Test phone: no real money moves.</div>`);
    sheet.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', async () => {
      openSheet('<div class="spinner"></div><div style="text-align:center;color:var(--wa-sub)">Confirming with your bank…</div>');
      const r = await api('api/sim/pay', { clientId: current, ref: o.ref, method: b.dataset.method });
      openSheet(r.status === 'captured'
        ? `<div class="done"><div class="tick">✓</div><b style="font-size:18px">${inr(o.total)} paid</b><div style="color:var(--wa-sub);margin-top:4px">${esc(b.dataset.method)}</div></div>`
        : '<div class="done"><div class="tick bad">!</div><b style="font-size:18px">Payment failed</b><div style="color:var(--wa-sub);margin-top:4px">No money was taken</div></div>');
      setTimeout(closeSheet, 1300);
    }));
  });
}

// ---------- WhatsApp Flows: one-page forms that open over the chat ----------

function radios(name, options, init) {
  return options.map((o) => `<label class="fopt"><input type="radio" name="${name}" value="${esc(o.id)}" ${o.id === init ? 'checked' : ''}><span class="rdo"></span><span class="tx"><span class="tt">${esc(o.title)}</span>${o.description ? `<span class="ds">${esc(o.description)}</span>` : ''}</span></label>`).join('');
}
function chips(name, options) {
  return `<div class="fchips">${options.map((o) => `<label><input type="radio" name="${name}" value="${esc(o.id)}"><span>${esc(o.title)}</span></label>`).join('')}</div>`;
}

function openFlow(entry) {
  const f = entry.msg.flow;
  const d = f.data;
  const title = f.name === 'gift_finder' ? 'Find the right piece' : 'Box, card & delivery';
  let body = '';
  let footer = '';
  if (f.name === 'gift_finder') {
    body = `<p class="fbody">Three quick choices, and we'll suggest three pieces.</p>
      <div class="flabel">Who is it for?</div>${chips('recipient', d.recipients)}
      <div class="flabel">The occasion</div>${chips('occasion', d.occasions)}
      <div class="flabel">A budget to keep to</div>${chips('budget', d.budgets)}`;
    footer = 'Show me three pieces';
  } else {
    body = `<h3 class="fhead">${esc(d.piece)}</h3>
      <div class="flabel">Who is it for?</div>${radios('for_whom', [{ id: 'gift', title: 'A gift' }, { id: 'me', title: 'For me' }], d.for_whom)}
      <div class="flabel">How shall we present it?</div>${radios('presentation', d.presentation_options, 'box')}
      <div class="giftonly" ${d.for_whom === 'me' ? 'hidden' : ''}>
        <div class="flabel">A handwritten card</div>${radios('card_choice', d.card_options, 'none')}
        <label class="flabel" for="cardText">Or in your own words</label>
        <textarea id="cardText" name="card_text" maxlength="200" rows="3" placeholder="Our calligrapher writes it by hand, in ink"></textarea>
        <div class="fcount"><span id="cardCount">0</span>/200</div>
      </div>
      <div class="flabel">When should it arrive?</div>${radios('delivery', d.delivery_options, 'asap')}
      <div class="dateonly" hidden><label class="flabel" for="fDate">The day</label><input type="date" id="fDate" name="date" min="${esc(d.min_date)}" max="${esc(d.max_date)}"></div>`;
    footer = 'Continue to delivery address';
  }
  sheet.classList.add('full');
  openSheet(`<div class="fbar"><button class="x" data-close aria-label="Close">×</button><b>${esc(title)}</b><span></span></div>
    <form class="flow" id="flowForm">${body}</form>
    <div class="ffoot"><button class="primary" id="flowSend" disabled>${esc(footer)}</button><div class="fnote">Managed by the business. Your details go only to ${esc($('#waName').textContent)}.</div></div>`);
  const form = $('#flowForm');
  const ready = () => {
    const v = Object.fromEntries(new FormData(form));
    const ok = f.name === 'gift_finder' ? v.recipient && v.occasion && v.budget
      : v.for_whom && v.presentation && v.delivery && (v.delivery !== 'date' || v.date);
    $('#flowSend').disabled = !ok;
    if (f.name !== 'gift_finder') {
      form.querySelector('.giftonly').hidden = v.for_whom === 'me';
      form.querySelector('.dateonly').hidden = v.delivery !== 'date';
    }
  };
  form.addEventListener('input', ready);
  form.addEventListener('change', ready);
  const ta = $('#cardText');
  if (ta) ta.addEventListener('input', () => {
    $('#cardCount').textContent = ta.value.length;
    if (ta.value.trim()) { const own = form.querySelector('input[name="card_choice"][value="own"]'); if (own) own.checked = true; }
  });
  ready();
  $('#flowSend').addEventListener('click', () => {
    const values = Object.fromEntries(new FormData(form));
    if (f.name === 'gift_finder') for (const k of ['recipient', 'occasion', 'budget']) values[k] = [values[k]];
    values.flow_token = f.token;
    sendEvent({ type: 'form', name: f.name, values });
    closeSheet();
  });
}

// ---------- WhatsApp's own catalogue screen ----------

let catalogueData = null;
async function openCatalogue() {
  catalogueData = await api('api/catalogue');
  sheet.classList.add('full');
  openSheet(`<div class="fbar"><button class="x" data-close aria-label="Close">×</button><b>Catalogue</b><span></span></div>
    <div class="catintro"><img src="media/asset/avatar.svg" alt=""><div><b>${esc($('#waName').textContent)}</b><span>Every piece and every colour</span></div></div>
    ${catalogueData.map((col) => `<div class="catsec"><div class="catname">${esc(col.name)}</div><div class="catgrid">${col.pieces.map((p) => `
      <button class="ctile ${p.available > 0 ? '' : 'gone'}" data-piece="${esc(p.id)}"><img src="${esc(p.photos[0])}" alt="" loading="lazy">
      <span class="cn">${esc(p.name)}</span><span class="cp">${p.available > 0 ? inr(p.price) : 'Spoken for'}</span></button>`).join('')}</div></div>`).join('')}`);
  sheet.querySelectorAll('[data-piece]').forEach((b) => b.addEventListener('click', () => openProduct(b.dataset.piece)));
}

function openProduct(id) {
  const p = catalogueData.flatMap((c) => c.pieces).find((x) => x.id === id);
  if (!p) return;
  sheet.classList.add('full');
  openSheet(`<div class="fbar"><button class="x" data-back aria-label="Back">‹</button><b>${esc(p.designName)}</b><span></span></div>
    <div class="pstrip">${p.photos.map((u) => `<img src="${esc(u)}" alt="">`).join('')}</div>
    <div class="pinfo"><div class="pname">${esc(p.name)}</div><div class="pprice">${p.available > 0 ? inr(p.price) : 'Spoken for'}</div>
      <p>${esc(p.story)}.</p><p class="pmeta">${esc(p.material)} · ${esc(p.technique)} · ${esc(p.size)}</p>
      ${p.versions.length > 1 ? `<div class="flabel">Colours</div><div class="swatches">${p.versions.map((v) => `<button class="sw ${v.id === p.id ? 'on' : ''}" data-piece="${esc(v.id)}"><i style="background:${esc(v.ground)}"></i>${esc(v.version)}</button>`).join('')}</div>` : ''}
    </div>
    <div class="ffoot"><button class="primary" id="askPiece">Message about this piece</button></div>`);
  sheet.querySelector('[data-back]').addEventListener('click', openCatalogue);
  sheet.querySelectorAll('.swatches [data-piece]').forEach((b) => b.addEventListener('click', () => openProduct(b.dataset.piece)));
  $('#askPiece').addEventListener('click', () => {
    sendEvent({ type: 'text', text: `I'd like to see ${p.name}`, referral: { pieceId: p.id } });
    closeSheet();
  });
}

$('#shopIcon').addEventListener('click', openCatalogue);

sheet.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) closeSheet(); });

chat.addEventListener('click', (ev) => {
  const zoom = ev.target.closest('[data-zoom]');
  if (zoom) { const lb = $('#lightbox'); lb.querySelector('img').src = zoom.dataset.zoom; lb.classList.add('on'); return; }
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'reply') return sendEvent({ type: 'reply', id: b.dataset.id, title: b.dataset.title, context: b.dataset.ctx });
  if (act === 'catalog') return openCatalogue();
  const entry = entryById(b.dataset.entry);
  if (!entry) return;
  if (act === 'list') openList(entry);
  if (act === 'address') openAddress(entry);
  if (act === 'order') openOrder(entry);
  if (act === 'flow') openFlow(entry);
});
$('#lightbox').addEventListener('click', () => $('#lightbox').classList.remove('on'));

$('#composer').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const v = $('#input').value.trim();
  if (!v) return;
  $('#input').value = '';
  sendEvent({ type: 'text', text: v });
});

$('#tryChips').innerHTML = TRY.map((t) => `<button>${esc(t)}</button>`).join('');
$('#tryChips').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (b) sendEvent({ type: 'text', text: b.textContent });
});

$('#who').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-client]');
  if (b) switchClient(b.dataset.client);
});

document.querySelectorAll('[data-scenario]').forEach((b) => b.addEventListener('click', async () => {
  const name = b.dataset.scenario;
  if (name === 'everything' && !confirm('Clear every test order, chat and request?')) return;
  await api('api/sim/scenario', { name, clientId: current });
  if (name !== 'away') await switchClient(current);
  else prefill('Hi');
}));

// Like WhatsApp's "Clear chat": the messages go, the bot still remembers the client (shortlist, orders, address).
async function clearChat() {
  if (!confirm(`Clear the chat with ${PROFILES[current].label}? The bot will still remember them.`)) return;
  closeSheet();
  await api('api/sim/scenario', { name: 'clearChat', clientId: current });
  transcript = [];
  renderChat();
}
$('#clearChat').addEventListener('click', clearChat);
$('#clearChat2').addEventListener('click', clearChat);

// Like a real phone: the message is typed for you, and you press send.
function prefill(text) {
  const input = $('#input');
  input.value = text;
  input.focus();
}

$('#qrBtn').addEventListener('click', async () => {
  const o = (studio?.orders || []).find((x) => x.serial);
  if (!o) return;
  await switchClient('sim-sunita');
  prefill(`Register my piece ${o.serial}`);
});

$('#failPay').addEventListener('change', (ev) => api('api/studio/action', { action: 'setting', key: 'failNextPayment', value: ev.target.checked }));
$('#quiet').addEventListener('change', (ev) => api('api/studio/action', { action: 'setting', key: 'quietHours', value: ev.target.checked }));

// ---------- the Studio ----------

const STATUS = {
  awaiting_payment: ['Waiting for payment', 'warn'], awaiting_transfer: ['Waiting for bank transfer', 'warn'],
  paid: ['Paid · pack it', 'go'], wrapped: ['Wrapped', 'go'], dispatched: ['On its way', 'ok'], delivered: ['Delivered', 'ok'],
  attention: ['Needs you today', 'warn'], cancelled: ['Cancelled', ''],
};

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function renderNotes() {
  const list = (studio.alerts || []).slice(0, 3);
  $('#notes').innerHTML = !list.length ? '' : `<div class="notes-head"><div class="lbl">Your phone</div></div>` + list.map((a) =>
    `<div class="note ${a.kind === 'urgent' ? 'urgent' : ''}"><img src="media/asset/avatar.svg" alt=""><div><b>${esc(a.title)}</b>${a.lines?.length ? `<p>${esc(a.lines.join('\n'))}</p>` : ''}</div><time>${ago(a.at)}</time></div>`).join('');
}

function orderCard(o) {
  const [label, tone] = STATUS[o.status] || [o.status, ''];
  const reached = (s) => o.timeline.some((t) => t.status === s);
  const a = o.address || {};
  const facts = [
    o.isGift ? `<li><span>Gift for</span> ${esc(RECIPIENT[o.recipient] || 'someone')}${o.card ? ` · card: “${esc(o.card)}”` : ''}</li>` : '<li><span>For the client</span></li>',
    `<li><span>Presentation</span> ${esc(o.presentationLabel)}</li>`,
    `<li><span>Deliver to</span> ${a.text ? esc(a.text) : `${esc(a.name)}, ${esc(a.city)} ${esc(a.pin)}`}</li>`,
    `<li><span>Arrive</span> ${o.deliverOn ? esc(new Date(o.deliverOn + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })) : (o.deliverNote ? esc(o.deliverNote) : 'as soon as possible')}</li>`,
    o.serial ? `<li><span>Seal</span> ${esc(o.serial)} · No. ${o.editionNo} of ${o.edition}</li>` : '',
  ].join('');
  let acts = '';
  const courier = `<select data-courier="${o.id}">${studio.couriers.map((c) => `<option>${esc(c)}</option>`).join('')}</select><input data-awb="${o.id}" placeholder="Tracking number" size="14" value="${Math.floor(1e9 + Math.random() * 9e9)}">`;
  if (o.status === 'awaiting_payment') acts = '<span class="meta" style="color:var(--muted);font-size:13px">The client is paying in WhatsApp.</span>' + `<button class="btn" data-do="cancel" data-order="${o.id}">Cancel order</button>`;
  if (o.status === 'awaiting_transfer') acts = `<button class="btn primary" data-do="transferReceived" data-order="${o.id}">Mark transfer received</button><button class="btn" data-do="cancel" data-order="${o.id}">Cancel order</button>`;
  if (o.status === 'paid') acts = `<button class="btn primary" data-do="wrapped" data-order="${o.id}">Wrapped: send the photo</button>${courier}<button class="btn" data-do="dispatch" data-order="${o.id}">Mark dispatched</button>`;
  if (o.status === 'wrapped') acts = `${courier}<button class="btn primary" data-do="dispatch" data-order="${o.id}">Mark dispatched</button>`;
  if (o.status === 'dispatched') acts = `<button class="btn primary" data-do="delivered" data-order="${o.id}">Mark delivered</button>`;
  if (o.status === 'attention') acts = `<span style="color:var(--amber);font-size:13.5px">Paid, but the piece is gone. Call the client today.</span><button class="btn" data-do="cancel" data-order="${o.id}">Cancel order</button>`;
  const docs = [o.invoiceUrl && `<a href="${esc(o.invoiceUrl)}" target="_blank" rel="noopener">Invoice</a>`, o.certificateUrl && `<a href="${esc(o.certificateUrl)}" target="_blank" rel="noopener">Certificate</a>`].filter(Boolean).join(' · ');
  return `<div class="card ocard"><img src="${esc(o.heroUrl)}" alt="">
    <div><div class="oid">${esc(o.id)} · ${esc(o.name)}</div><div class="meta">${esc(o.client)} · ${ago(o.createdAt)}</div>
      <span class="chip ${tone}">${label}</span>
      <div class="steps"><span class="${reached('paid') ? 'on' : ''}">Paid</span><span class="${reached('wrapped') ? 'on' : ''}">Wrapped</span><span class="${reached('dispatched') ? 'on' : ''}">Sent</span><span class="${reached('delivered') ? 'on' : ''}">Delivered</span></div>
      <ul class="facts">${facts}</ul></div>
    <div class="amt">${inr(o.total)}</div>
    <div class="acts">${acts}${docs ? `<span style="margin-left:auto;font-size:13px">${docs}</span>` : ''}</div></div>`;
}

const PANELS = {
  orders() {
    const q = studio.queue.length ? `<div class="queue"><b>${studio.queue.length} message${studio.queue.length > 1 ? 's' : ''} waiting for 9 am (quiet hours)</b>${studio.queue.map((x) => `<div class="qi"><span>${esc(x.client)}: ${esc(x.preview)}</span><button class="btn" data-send="${x.id}">Send now</button></div>`).join('')}</div>` : '';
    const live = studio.orders.filter((o) => o.status !== 'cancelled');
    return `<div><h2>Orders</h2><p class="lede">Every order lands here and on your phone. Your jobs: wrap it, press the buttons. The bot tells the client at each step.</p></div>${q}
      ${live.length ? live.map(orderCard).join('') : '<div class="empty"><b>No orders yet</b>Reserve a piece on the test phone, pay, and watch it arrive here.</div>'}`;
  },
  inbox() {
    if (!studio.threads.length) return '<div><h2>Inbox</h2><p class="lede">When a client asks for a person, the conversation comes here and the bot steps aside.</p></div><div class="empty"><b>No conversations yet</b>Tap “Concierge”, then “Speak to a curator” on the test phone.</div>';
    return `<div><h2>Inbox</h2><p class="lede">You reply as ${esc(studio.curator)}. The bot stays quiet until you hand the conversation back.</p></div>` + studio.threads.map((t) => `
      <div class="card thread"><div style="display:flex;justify-content:space-between;gap:10px"><div><b style="font:400 19px/1.2 var(--serif)">${esc(t.name)}</b><div class="meta" style="color:var(--muted);font-size:13px">${t.open ? 'Waiting for you' : 'Back with the bot'}</div></div>${t.open ? `<button class="btn" data-close-thread="${esc(t.clientId)}">Hand back to the bot</button>` : ''}</div>
      <div class="msgs">${t.messages.length ? t.messages.map((m) => `<div class="m ${m.from === 'curator' ? 'cur' : ''}">${esc(m.text)}<small>${m.from === 'curator' ? esc(studio.curator) : esc(t.name)} · ${ago(m.at)}</small></div>`).join('') : '<div style="color:var(--muted);font-size:13.5px">No messages yet.</div>'}</div>
      <div class="reply"><textarea data-reply-text="${esc(t.clientId)}" placeholder="Write as ${esc(studio.curator)}…"></textarea><button class="btn primary" data-reply="${esc(t.clientId)}">Send</button></div></div>`).join('');
  },
  requests() {
    const v = studio.viewings;
    const l = studio.leads;
    const KIND = { trousseau: 'Wedding & family gifting', bespoke: 'Bespoke', international: 'Delivery abroad', photo: 'Photo', waitlist: 'Waitlist' };
    return `<div><h2>Viewings &amp; requests</h2><p class="lede">Video viewings to take, and requests that need a personal reply.</p></div>
      <div class="lbl" style="margin:6px 0 0">Video viewings</div>
      ${v.length ? `<div class="list">${v.map((x) => `<div class="li"><div><div class="k">${esc(x.label)}</div><b>${esc(x.name)}</b>${x.piece ? ` · to see ${esc(x.piece)}` : ''}<p>${x.note ? esc(x.note) : 'No note'}${x.reminded ? ' · reminder sent' : ''}</p></div><span class="chip">${new Date(x.at) < new Date() ? 'Past' : 'Upcoming'}</span></div>`).join('')}</div>` : '<div class="empty" style="padding:18px">None booked.</div>'}
      <div class="lbl" style="margin:10px 0 0">Requests</div>
      ${l.length ? `<div class="list">${l.map((x) => `<div class="li ${x.done ? 'done' : ''}"><div><div class="k">${esc(KIND[x.kind] || x.kind)}</div><b>${esc(x.name)}</b><p>${esc(x.detail)}</p></div>${x.done ? '<span class="chip ok">Done</span>' : `<button class="btn" data-lead="${x.id}">Mark done</button>`}</div>`).join('')}</div>` : '<div class="empty" style="padding:18px">No requests yet.</div>'}
      <div class="lbl" style="margin:10px 0 0">Shortlists (what clients are weighing up)</div>
      ${studio.shortlists.length ? `<div class="list">${studio.shortlists.map((s) => `<div class="li"><div><b>${esc(s.name)}</b><p>${esc(s.pieces.join(', '))}</p></div></div>`).join('')}</div>` : '<div class="empty" style="padding:18px">No shortlists yet.</div>'}
      <div class="lbl" style="margin:10px 0 0">Occasion reminders (clients asked us to write next year)</div>
      ${studio.reminders.length ? `<div class="list">${studio.reminders.map((r) => `<div class="li"><div><div class="k">${esc(r.when)}</div><b>${esc(r.name)}</b><p>${esc([r.piece && 'Gave ' + r.piece, r.recipient && 'for their ' + r.recipient, r.occasion].filter(Boolean).join(', '))}</p></div></div>`).join('')}</div>` : '<div class="empty" style="padding:18px">None yet.</div>'}`;
  },
  catalogue() {
    const w = studio.catalogueWarnings;
    return `<div><h2>Catalogue</h2><p class="lede">Edit <code>${esc(studio.cataloguePath.replace(/^.*\/shawl-bot\//, 'shawl-bot/'))}</code> in Numbers or Excel; the bot picks up changes within two seconds. Drop real photos into <code>shawl-bot/photos/&lt;piece&gt;/hero.jpg</code> (and detail.jpg, flat.jpg).</p></div>
      ${w.length ? `<div class="warnbox"><b>Hidden from clients until fixed:</b><br>${w.map((x) => `${esc(x.name)}: ${esc(x.problems.join('; '))}`).join('<br>')}</div>` : ''}
      <div class="pgrid">${studio.catalogue.map((p) => `<div class="pc ${p.live ? '' : 'off'}"><img src="${esc(p.heroUrl)}" alt="" loading="lazy"><div class="pi"><div class="pn">${esc(p.name)}</div><div class="pm">${esc(p.collection)} · ${inr(p.price)}</div>
        <div class="pm">${p.available} of ${p.edition} left${p.holds ? ` · ${p.holds} set aside` : ''}${p.sold ? ` · ${p.sold} sold` : ''}</div>
        <span class="chip ${p.photo ? 'ok' : ''}">${p.photo ? 'Photo' : 'Drawing, add a photo'}</span></div></div>`).join('')}</div>`;
  },
  wire() {
    return `<div><h2>Sent to WhatsApp</h2><p class="lede">Each message the bot sent, exactly as WhatsApp’s official API will receive it. A green tick means it fits every WhatsApp limit (button lengths, list sizes and so on).</p></div>
      ${studio.wire.length ? studio.wire.map((w) => `<details class="wi"><summary><span class="ty">${esc(w.type)}</span><span class="who2">${esc(w.clientId)} · ${timeOf(w.at)} · ${esc(w.mode)}</span>${w.problems.length ? `<span class="badmark">✗ ${esc(w.problems.join('; '))}</span>` : '<span class="okmark">✓ fits WhatsApp</span>'}</summary>
        ${w.notes?.length ? `<div class="nt">${esc(w.notes.join(' · '))}</div>` : ''}${w.error ? `<div class="nt">Error: ${esc(w.error)}</div>` : ''}<pre>${esc(JSON.stringify(w.payload, null, 2))}</pre></details>`).join('') : '<div class="empty"><b>Nothing sent yet</b>Say hi on the test phone.</div>'}`;
  },
  golive() {
    const live = studio.mode === 'live';
    return `<div><h2>Go live on WhatsApp</h2><p class="lede">${live ? 'The bot is connected to WhatsApp.' : 'Everything above already works. These steps connect it to a real WhatsApp number. Most need your accounts, so we do them together.'}</p></div>
      <ol class="steps-golive">
        <li><b>A number for the shop</b><p>A fresh SIM that has never had WhatsApp on it is simplest.</p></li>
        <li><b>Meta Business account, verified</b><p>business.facebook.com → create the business → verify it (a few days). Needed to message more than 250 people a day and to take payments.</p></li>
        <li><b>WhatsApp app on Meta for Developers</b><p>Create an app, add WhatsApp, add the shop number. You get a phone number ID, an access token and an app secret.</p></li>
        <li><b>Keys into the bot</b><p>They go into <code>shawl-bot/.env</code> through a private pop-up on your Mac, never pasted in chat: <code>WA_TOKEN</code>, <code>WA_PHONE_ID</code>, <code>WA_APP_SECRET</code>, <code>WA_VERIFY_TOKEN</code>.</p></li>
        <li><b>Razorpay, linked inside WhatsApp</b><p>Sign up and finish KYC on Razorpay, then link it in WhatsApp Manager → Payments. The name you give it goes in <code>RAZORPAY_CONFIG_NAME</code>.</p></li>
        <li><b>Online around the clock</b><p>WhatsApp must reach the bot at any hour: a free Cloudflare tunnel from this Mac, or a small server. That address is <code>PUBLIC_URL</code>; the webhook is <code>PUBLIC_URL/webhook</code>. Set a <code>STUDIO_KEY</code> so only you can open this Studio.</p></li>
        <li><b>The two one-page forms</b><p>Upload <code>flows/order_options.json</code> and <code>flows/gift_finder.json</code> in WhatsApp Manager → Flows, publish them, and put their IDs in <code>FLOW_ORDER_OPTIONS_ID</code> and <code>FLOW_GIFT_FINDER_ID</code>. Until then, the bot asks the same questions one at a time.</p></li>
        <li><b>The catalogue behind the shop icon</b><p>In Meta Commerce Manager, create a catalogue with a data feed from <code>PUBLIC_URL/catalogue-feed.csv</code> (it updates itself from catalogue.csv), and connect it to the WhatsApp number.</p></li>
        <li><b>Seven message templates approved</b><p>WhatsApp only lets a business start a conversation with pre-approved wording (for updates after 24 hours of silence). Submit these in WhatsApp Manager:</p></li>
        <li><b>Your real pieces, photos and details</b><p>Replace the sample catalogue, put real photos in <code>photos/</code>, and fill the seller, GST and bank details in <code>config.json</code>.</p></li>
      </ol>
      <div class="tpl">${studio.templates.map((t) => `<div><b>${esc(t.name)}</b> · ${esc(t.category.toLowerCase())}${t.header ? ' · image header' : ''}<br>${esc(t.body)}${t.button ? `<br><span style="color:var(--muted)">Button: ${esc(t.button.text)}</span>` : ''}</div>`).join('')}</div>`;
  },
};

function renderStudio() {
  if (!studio) return;
  const live = studio.mode === 'live';
  const mode = $('#mode');
  mode.textContent = live ? 'Live on WhatsApp' : DEMO ? 'Online demo' : 'Test mode';
  mode.title = live ? '' : DEMO ? 'Runs entirely in your browser. Nothing is sent anywhere.' : 'WhatsApp is not connected yet. See the Go live tab.';
  mode.classList.toggle('live', live);
  $('#brandWord').textContent = studio.brand.name.toUpperCase();
  $('#waName').textContent = studio.brand.name;
  $('#failPay').checked = studio.settings.failNextPayment;
  $('#quiet').checked = studio.settings.quietHours;
  $('#qrBtn').disabled = !studio.orders.some((o) => o.serial);
  const needs = studio.orders.filter((o) => ['paid', 'wrapped', 'dispatched', 'awaiting_transfer', 'attention'].includes(o.status)).length;
  $('#nOrders').textContent = needs || '';
  $('#nInbox').textContent = studio.threads.filter((t) => t.open).length || '';
  $('#nReq').textContent = (studio.leads.filter((l) => !l.done).length + studio.viewings.filter((v) => new Date(v.at) > new Date()).length) || '';
  $('#nCat').textContent = studio.catalogueWarnings.length || '';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  renderNotes();
  const active = document.activeElement;
  const typingReply = active && active.matches && active.matches('textarea[data-reply-text], input[data-awb]');
  if (!typingReply) $('#panel').innerHTML = PANELS[tab]();
}

let refreshTimer = null;
function refreshStudio() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => { studio = await api('api/studio/state'); renderStudio(); }, 120);
}

$('#tabs').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  renderStudio();
});

$('#panel').addEventListener('click', async (ev) => {
  const t = ev.target;
  const doBtn = t.closest('[data-do]');
  if (doBtn) {
    const orderId = doBtn.dataset.order;
    const args = { action: doBtn.dataset.do, orderId };
    if (args.action === 'dispatch') {
      args.courier = $(`[data-courier="${orderId}"]`)?.value;
      args.awb = $(`[data-awb="${orderId}"]`)?.value;
    }
    if (args.action === 'cancel' && !confirm(`Cancel ${orderId}?`)) return;
    doBtn.disabled = true;
    await api('api/studio/action', args);
    return refreshStudio();
  }
  const send = t.closest('[data-send]');
  if (send) { await api('api/studio/action', { action: 'sendQueued', id: send.dataset.send }); return refreshStudio(); }
  const reply = t.closest('[data-reply]');
  if (reply) {
    const id = reply.dataset.reply;
    const box = $(`[data-reply-text="${CSS.escape(id)}"]`);
    if (!box.value.trim()) return;
    const text = box.value;
    box.value = '';
    box.blur();
    await api('api/studio/action', { action: 'curatorReply', clientId: id, text });
    return refreshStudio();
  }
  const close = t.closest('[data-close-thread]');
  if (close) { await api('api/studio/action', { action: 'closeThread', clientId: close.dataset.closeThread }); return refreshStudio(); }
  const lead = t.closest('[data-lead]');
  if (lead) { await api('api/studio/action', { action: 'leadDone', leadId: lead.dataset.lead }); return refreshStudio(); }
});

// ---------- live updates ----------

function connect() {
  if (backend) return backend.subscribe(onEvent);
  const es = new EventSource('api/events');
  es.onmessage = (m) => onEvent(JSON.parse(m.data));
}

function onEvent(ev) {
  if (ev.kind === 'msg') {
    if (ev.clientId === current) addEntry(ev.entry);
    else if (PROFILES[ev.clientId]) { unread.add(ev.clientId); renderWho(); }
  }
  if (ev.kind === 'typing' && ev.clientId === current) setTyping(ev.on);
  if (ev.kind === 'reset' && (ev.clientId === '*' || ev.clientId === current)) { transcript = []; renderChat(); }
  if (ev.kind === 'studio' || ev.kind === 'alert') refreshStudio();
}

function tickClock() {
  const t = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  $('#clock').textContent = `India ${t.toLowerCase()}`;
  $('#statusTime').textContent = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[ap]m/i, '');
}

tickClock();
setInterval(tickClock, 30000);
setInterval(() => { if (studio) renderNotes(); }, 60000);
connect();
if (DEMO && new URLSearchParams(location.search).get('seed')) current = 'sim-meera';
await switchClient(current);
refreshStudio();

// Online demo: a short note on what the visitor is looking at.
if (DEMO) {
  const intro = $('#demoIntro');
  let closed = false;
  try { closed = localStorage.getItem('shawlbot.introClosed') === '1'; } catch { /* storage off */ }
  if (!closed && !new URLSearchParams(location.search).get('seed')) intro.hidden = false;
  intro.querySelector('button').addEventListener('click', () => {
    intro.hidden = true;
    try { localStorage.setItem('shawlbot.introClosed', '1'); } catch { /* storage off */ }
  });
  // Screenshot helper only: ?open=flow|order|catalog opens that screen.
  const open = new URLSearchParams(location.search).get('open');
  const last = (sel) => [...document.querySelectorAll(sel)].pop();
  if (open === 'flow') last('[data-act="flow"]')?.click();
  if (open === 'order') last('[data-act="order"]')?.click();
  if (open === 'catalog') openCatalogue();
  const t = new URLSearchParams(location.search).get('tab');
  if (t && PANELS[t]) { tab = t; setTimeout(renderStudio, 300); }
}
