// Everything between the brain and the screens: pacing messages like a person typing, quiet hours,
// the test-phone transcript, the Studio's view, and the small API both screens use.
// The same code runs on the Mac (server.js) and fully inside the browser (the online demo).

import { check } from './limits.js';
import { ist } from './format.js';
import { COLLECTIONS, COURIERS } from './copy.js';
import { TEMPLATES } from './whatsapp.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const isSim = (clientId) => String(clientId).startsWith('sim-');

// media(ref) -> { rel, url, photo }   docs(ref) -> { rel, url, pdfUrl }   broadcast(event) -> tells open screens
export function createApp({ store, catalogue, config, engine, wa, media, docs, broadcast, onAlert = () => {}, publicUrl = null, log = console.log, pace = true }) {
  const wire = [];          // recent outbound messages as WhatsApp would receive them
  const queues = new Map(); // per-client delivery chains, so messages arrive in order
  let msgSeq = 0;

  // Adds picture and document links so the test phone can show them.
  function present(msg) {
    const m = JSON.parse(JSON.stringify(msg));
    if (m.media) m.mediaUrl = media(m.media).rel;
    if (m.header?.media) m.header.mediaUrl = media(m.header.media).rel;
    if (m.doc) m.docUrl = docs(m.doc).rel;
    if (m.order) m.order.items.forEach((it) => { if (it.media) it.mediaUrl = media(it.media).rel; });
    if (m.cards) m.cards.forEach((card) => { card.mediaUrl = media(card.media).rel; });
    if (m.type === 'catalog' && m.thumbnail) m.thumbnailUrl = media({ kind: 'piece', id: m.thumbnail, view: 'hero' }).rel;
    return m;
  }

  // The whole catalogue, the way WhatsApp's own catalogue screen shows it.
  function catalogueView() {
    return COLLECTIONS.map((col) => ({
      id: col.id, name: col.name, line: col.line,
      pieces: catalogue.inCollection(col.id).map((p) => ({
        id: p.id, name: p.name, designName: p.designName, version: p.version, price: p.price, story: p.story,
        material: p.material, technique: p.technique, size: p.size, available: engine.available(p),
        versions: catalogue.versions(p).map((v) => ({ id: v.id, version: v.version, ground: v.ground })),
        photos: ['hero', 'detail', 'flat'].map((view) => media({ kind: 'piece', id: p.id, view }).rel),
      })),
    })).filter((c) => c.pieces.length);
  }

  function quietNow() {
    const h = ist(new Date()).h;
    const { from, until } = config.quietHours;
    return h >= from || h < until;
  }

  function windowOpen(clientId) {
    const c = store.data.clients[clientId];
    return Boolean(c?.lastInboundAt && Date.now() - new Date(c.lastInboundAt) < 24 * 3600000);
  }

  function logWire(clientId, msg, mode) {
    const { payload, notes } = wa.toPayload(clientId.replace(/^sim-/, '91XXXXXXXXXX-'), msg, { windowOpen: isSim(clientId) || windowOpen(clientId) });
    const entry = { id: `w${++msgSeq}`, at: new Date().toISOString(), clientId, type: msg.type, mode, problems: check(msg), notes, payload };
    wire.unshift(entry);
    wire.length = Math.min(wire.length, 60);
    return entry;
  }

  function deliver(items, { lastMessageId } = {}) {
    for (const item of items) {
      if (item.to === 'owner') {
        broadcast({ kind: 'alert', alert: item.alert });
        onAlert(item.alert);
        continue;
      }
      if (item.msg.proactive && store.data.settings.quietHours && quietNow()) {
        store.data.queue.push({ id: `q${Date.now().toString(36)}${msgSeq++}`, at: new Date().toISOString(), clientId: item.clientId, msg: item.msg });
        store.save();
        continue;
      }
      enqueue(item.clientId, item.msg, lastMessageId);
    }
    broadcast({ kind: 'studio' });
  }

  function enqueue(clientId, msg, lastMessageId) {
    const prev = queues.get(clientId) || Promise.resolve();
    const next = prev.then(() => sendOne(clientId, msg, lastMessageId)).catch((e) => log('send failed:', e.message));
    queues.set(clientId, next);
    return next;
  }

  async function sendOne(clientId, msg, lastMessageId) {
    const length = (msg.body || msg.caption || '').length;
    const pause = pace ? Math.min(2200, 700 + length * 6) : 0; // unhurried, like a person composing
    if (isSim(clientId)) {
      logWire(clientId, msg, 'test phone');
      broadcast({ kind: 'typing', clientId, on: true });
      await sleep(pause);
      const entry = { dir: 'out', id: `m${Date.now().toString(36)}${++msgSeq}`, at: new Date().toISOString(), msg: present(msg) };
      const t = store.transcript(clientId);
      t.push(entry);
      if (t.length > 300) t.splice(0, t.length - 300);
      store.save();
      broadcast({ kind: 'msg', clientId, entry });
      broadcast({ kind: 'typing', clientId, on: false });
      return;
    }
    const entry = logWire(clientId, msg, 'whatsapp');
    if (!entry.payload) return;
    if (!wa.enabled) { entry.notes.push('Not sent: WhatsApp keys are not set'); return; }
    await wa.typing(lastMessageId);
    await sleep(pause);
    try { await wa.send(entry.payload); entry.sent = true; } catch (e) { entry.error = e.message; log('[whatsapp]', e.message); }
    broadcast({ kind: 'studio' });
  }

  function inbound(clientId, event, profile = {}, extra = {}) {
    if (isSim(clientId)) {
      const t = store.transcript(clientId);
      let quote = null;
      if (event.context) {
        const orig = t.find((e) => e.id === event.context);
        quote = orig ? (orig.msg.body || orig.msg.caption || '').split('\n')[0].replace(/[*_]/g, '').slice(0, 90) : null;
      }
      const entry = { dir: 'in', id: `m${Date.now().toString(36)}${++msgSeq}`, at: new Date().toISOString(), event: { ...event, context: undefined }, quote };
      t.push(entry);
      broadcast({ kind: 'msg', clientId, entry });
    }
    const { context, ...clean } = event;
    deliver(engine.handle(clientId, clean, profile), extra);
  }

  // Every 30 seconds: holds expire, reminders go out, quiet-hours messages leave at 9 am.
  function tick() {
    deliver(engine.tick());
    if (store.data.queue.length && !quietNow()) {
      const due = store.data.queue.splice(0);
      store.save();
      for (const q of due) enqueue(q.clientId, q.msg);
      broadcast({ kind: 'studio' });
    }
  }

  function studioState(extra = {}) {
    const d = store.data;
    const pieceOf = (id) => catalogue.pieces.find((p) => p.id === id);
    const who = (id) => { const c = d.clients[id]; return c ? (c.name || c.profileName || id) : id; };
    return {
      brand: config.brand, curator: config.curator.name, mode: wa.enabled ? 'live' : 'test',
      publicUrl, settings: d.settings, quietNow: quietNow(), couriers: Object.keys(COURIERS),
      orders: Object.values(d.orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((o) => ({
        ...o, client: who(o.clientId), heroUrl: media({ kind: 'piece', id: o.pieceId, view: 'hero' }).rel,
        invoiceUrl: o.payment ? docs({ kind: 'invoice', orderId: o.id }).rel : null,
        certificateUrl: o.serial ? docs({ kind: 'certificate', orderId: o.id }).rel : null,
        edition: pieceOf(o.pieceId)?.edition_size,
      })),
      threads: Object.values(d.clients).filter((c) => c.thread).map((c) => ({ clientId: c.id, name: who(c.id), ...c.thread }))
        .sort((a, b) => (b.open - a.open) || String(b.messages.at(-1)?.at || b.openedAt).localeCompare(String(a.messages.at(-1)?.at || a.openedAt))),
      viewings: d.viewings.slice().sort((a, b) => a.at.localeCompare(b.at)).map((v) => ({ ...v, name: who(v.clientId), piece: pieceOf(v.pieceId)?.name })),
      leads: d.leads.slice(0, 50),
      waitlist: Object.entries(d.waitlist).map(([id, list]) => ({ piece: pieceOf(id)?.name || id, people: list.map(who) })),
      reminders: (d.reminders || []).map((r) => ({ ...r, piece: pieceOf(r.pieceId)?.name || '' })),
      shortlists: Object.values(d.clients).filter((c) => c.shortlist?.length).map((c) => ({ name: who(c.id), pieces: c.shortlist.map((id) => pieceOf(id)?.name || id) })),
      catalogue: catalogue.pieces.map((p) => ({
        id: p.id, name: p.name, collection: COLLECTIONS.find((c) => c.id === p.collection)?.name || p.collection, price: p.price,
        edition: p.edition_size, live: p.live, available: p.live ? engine.available(p) : 0,
        holds: (d.holds[p.id] || []).filter((h) => new Date(h.until) > new Date()).length, sold: d.sold[p.id] || 0,
        photo: media({ kind: 'piece', id: p.id, view: 'hero' }).photo, heroUrl: media({ kind: 'piece', id: p.id, view: 'hero' }).rel,
      })),
      catalogueWarnings: catalogue.warnings, cataloguePath: catalogue.path,
      queue: d.queue.map((q) => ({ id: q.id, at: q.at, client: who(q.clientId), preview: (q.msg.body || q.msg.caption || '').slice(0, 120) })),
      alerts: d.alerts.slice(0, 30),
      wire: wire.slice(0, 40),
      templates: TEMPLATES,
      ...extra,
    };
  }

  // The small API the test phone and Studio talk to (over HTTP on the Mac, directly in the online demo).
  // Returns { status, body }.
  function api(method, path, query = {}, body = {}) {
    if (method === 'GET') {
      if (path === '/api/studio/state') return { status: 200, body: studioState() };
      if (path === '/api/catalogue') return { status: 200, body: catalogueView() };
      if (path === '/api/sim/history') {
        // Re-link pictures so photos added later show in older messages too.
        const t = store.transcript(query.client || 'sim-meera');
        return { status: 200, body: t.map((e) => (e.dir === 'out' ? { ...e, msg: present(e.msg) } : e)) };
      }
      return null;
    }
    const clientId = String(body.clientId || 'sim-meera');
    if (path === '/api/sim/inbound') {
      if (!isSim(clientId)) return { status: 400, body: { error: 'test clients only' } };
      inbound(clientId, body.event || {}, { name: body.profileName });
      return { status: 200, body: { ok: true } };
    }
    if (path === '/api/sim/pay') {
      const fail = store.data.settings.failNextPayment;
      if (fail) store.data.settings.failNextPayment = false;
      inbound(clientId, { type: 'payment', ref: body.ref, status: fail ? 'failed' : 'captured', method: body.method || 'UPI' }, {});
      return { status: 200, body: { ok: true, status: fail ? 'failed' : 'captured' } };
    }
    if (path === '/api/sim/scenario') {
      if (body.name === 'clearChat') {
        // Messages only, like WhatsApp's "Clear chat": the bot still remembers the client.
        store.data.transcripts[clientId] = [];
        if (store.data.clients[clientId]) store.data.clients[clientId].chatCleared = true;
        store.save();
        broadcast({ kind: 'reset', clientId });
      }
      if (body.name === 'fresh') { store.resetClient(clientId); broadcast({ kind: 'reset', clientId }); }
      if (body.name === 'away') {
        const c = store.data.clients[clientId];
        if (c) c.lastInboundAt = new Date(Date.now() - 3 * 86400000).toISOString();
        store.save();
      }
      if (body.name === 'everything') { store.reset(); broadcast({ kind: 'reset', clientId: '*' }); }
      broadcast({ kind: 'studio' });
      return { status: 200, body: { ok: true } };
    }
    if (path === '/api/studio/action') {
      const { action, ...args } = body;
      if (action === 'setting') {
        if (['quietHours', 'failNextPayment'].includes(args.key)) store.data.settings[args.key] = Boolean(args.value);
        store.save();
      } else if (action === 'sendQueued') {
        const i = store.data.queue.findIndex((q) => q.id === args.id);
        if (i >= 0) { const [q] = store.data.queue.splice(i, 1); store.save(); enqueue(q.clientId, q.msg); }
      } else if (action === 'reloadCatalogue') {
        catalogue.reload();
      } else {
        deliver(engine.studioAction(action, args));
      }
      broadcast({ kind: 'studio' });
      return { status: 200, body: { ok: true } };
    }
    return null;
  }

  // Resolves once every message waiting to go out has been delivered.
  async function idle() {
    for (;;) {
      const pending = [...queues.values()];
      await Promise.all(pending);
      if (pending.length === queues.size && [...queues.values()].every((q, i) => q === pending[i])) return;
    }
  }

  return { api, inbound, deliver, tick, idle, present, catalogueView, studioState, wire };
}
