// The online demo: the whole bot running inside the visitor's browser tab.
// Same brain and Studio logic as the Mac version (src/), with the chat kept in this browser only.
// Nothing is sent anywhere: no WhatsApp, no payments, no server.

import { createStore } from './src/store.js';
import { createCatalogue } from './src/catalogue.js';
import { createEngine } from './src/engine.js';
import { createWhatsApp } from './src/whatsapp.js';
import { createApp } from './src/app-core.js';
import { invoiceHTML, certificateHTML } from './src/docs.js';
import * as art from './src/art.js';

const KEY = 'shawlbot.demo.v2'; // v2: renamed to Pashmor, so old Dushala chats don't come back
const params = new URLSearchParams(location.search);
const seed = params.get('seed'); // screenshots only: a fixed conversation, not saved

const [csv, config, manifest] = await Promise.all([
  fetch('catalogue.csv').then((r) => r.text()),
  fetch('config.json').then((r) => r.json()),
  fetch('photos/manifest.json').then((r) => r.json()).catch(() => []),
]);

const store = createStore(seed ? {} : {
  load: () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } },
  persist: (data) => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private window: keep it in memory */ } },
});
const catalogue = createCatalogue(() => csv);
const engine = createEngine({ store, catalogue, config, canFlow: () => true });
const photos = new Set(manifest);

function photoFor(...parts) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const rel = `photos/${parts.join('/')}.${ext}`;
    if (photos.has(rel)) return rel;
  }
  return null;
}
const svgData = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function media(ref = {}) {
  const brand = config.brand.name;
  const piece = (id) => catalogue.pieces.find((p) => p.id === id);
  let photo = null, drawn = null;
  if (ref.kind === 'piece') {
    photo = photoFor(ref.id, ref.view);
    const p = piece(ref.id);
    if (!photo && p) drawn = svgData(ref.view === 'hero' ? art.heroSVG(p, brand) : ref.view === 'detail' ? art.detailSVG(p) : art.flatSVG(p, brand));
  }
  if (ref.kind === 'asset') {
    photo = photoFor('brand', ref.id);
    if (!photo) drawn = svgData(ref.id === 'presentation' ? art.presentationSVG(brand) : ref.id === 'avatar' ? art.avatarSVG(brand) : art.brandCoverSVG(brand, config.brand.tagline));
  }
  if (ref.kind === 'wrap') photo = photoFor('wrap', ref.orderId) || photoFor('wrap', 'default');
  const rel = photo || drawn || '';
  return { rel, url: rel, photo: Boolean(photo) };
}

const docs = (ref = {}) => ({ rel: `#doc/${ref.kind}/${ref.orderId}`, url: '', pdfUrl: '' });

const listeners = new Set();
const broadcast = (event) => { for (const fn of listeners) { try { fn(event); } catch (e) { console.error(e); } } };
const wa = createWhatsApp({ env: {}, resolveMedia: media, resolveDoc: docs });
const app = createApp({ store, catalogue, config, engine, wa, media, docs, broadcast, pace: !seed, log: () => {} });
setInterval(app.tick, 30000);

export function subscribe(fn) { listeners.add(fn); }

export async function api(path, body) {
  const u = new URL(path, location.href);
  const route = u.pathname.replace(/^.*\/api\//, '/api/');
  const out = app.api(body ? 'POST' : 'GET', route, Object.fromEntries(u.searchParams), body || {});
  return out ? out.body : {};
}

export function docHTML(kind, orderId) {
  const o = store.data.orders[orderId];
  const piece = o && catalogue.pieces.find((x) => x.id === o.pieceId);
  if (!o || !piece) return '<p>Not found</p>';
  const owner = store.data.clients[kind === 'certificate' && o.registeredTo ? o.registeredTo : o.clientId];
  const clientName = owner?.profileName || owner?.name;
  return kind === 'invoice'
    ? invoiceHTML({ order: o, piece, brand: config.brand.name, seller: config.seller, clientName })
    : certificateHTML({ order: o, piece, brand: config.brand.name, clientName });
}

// ---------- fixed conversations for the README screenshots ----------
const say = (event) => app.inbound('sim-meera', event, { name: 'Meera Kapoor' });
const GIFT_ADDRESS = { name: 'Sunita Sharma', phone: '98290 00000', pin: '302006', house: '14', building: 'Rose Villa', area: 'Civil Lines', landmark: '', city: 'Jaipur', state: 'Rajasthan' };
const SEEDS = {
  welcome: [{ type: 'text', text: 'Hi' }],
  browse: [{ type: 'text', text: 'Hi' }, { type: 'reply', id: 'col:winter', title: 'View pieces' }, { type: 'reply', id: 'piece:mehr', title: 'See closely' }],
  gift: [{ type: 'text', text: 'Hi' }, { type: 'reply', id: 'gf', title: 'Find a gift' },
    { type: 'form', name: 'gift_finder', values: { recipient: ['mother'], occasion: ['anniversary'], budget: ['b3'] } }],
  details: [{ type: 'text', text: 'Tell me about Noor' }, { type: 'reply', id: 'res:noor', title: 'Reserve' }],
  checkout: [{ type: 'reply', id: 'res:noor', title: 'Reserve' },
    { type: 'form', name: 'order_options', values: { for_whom: 'gift', presentation: 'box', card_choice: 's1', card_text: '', delivery: 'asap', date: '' } },
    { type: 'address', address: GIFT_ADDRESS }],
};
if (seed && SEEDS[seed]) {
  for (const ev of SEEDS[seed]) { say(ev); await app.idle(); }
  if (params.get('pay')) {
    const ref = Object.keys(store.data.orders)[0];
    app.api('POST', '/api/sim/pay', {}, { clientId: 'sim-meera', ref, method: 'Google Pay' });
    await app.idle();
    app.api('POST', '/api/studio/action', {}, { action: 'wrapped', orderId: ref });
    await app.idle();
  }
}
