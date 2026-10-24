// The bot's brain. It takes one thing a client did (typed, tapped, swiped, paid, sent a form)
// and returns what to send back, plus alerts for you. It never talks to WhatsApp directly,
// so the same brain runs the test phone and the real WhatsApp number.
//
// How it is shaped around real behaviour (see README, "Why it works"):
//   - Pictures first, swiped, not lists to read. One card per design; colours only when asked.
//   - A small yes before a big one: See closely -> Save -> Reserve.
//   - One page for box, card and date instead of four questions; card wording offered, never a blank card.
//   - Remembers: the shortlist, the half-finished gift, the address, the recipient.
//   - Honest nudges only: one reminder before a set-aside piece is released, with a "Release it" button.

import {
  copy as C, COLLECTIONS, RECIPIENTS, OCCASIONS, BUDGETS, TROUSSEAU_SIZES, COURIERS, availabilityLine, cardSuggestions,
} from './copy.js';
import { understand } from './nlu.js';
import {
  ist, istDate, isoDay, addDays, longDate, shortDate, relativeDay, clockTime, greeting, partOfDay,
  rupees, capital, firstName, word,
} from './format.js';

const SERIAL_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACTIVE = ['paid', 'wrapped', 'dispatched'];

// ---------- message shapes (WhatsApp-neutral) ----------
const text = (body, extra = {}) => ({ type: 'text', body, ...extra });
const image = (media, caption, extra = {}) => ({ type: 'image', media, caption, ...extra });
const doc = (docRef, filename, caption, extra = {}) => ({ type: 'document', doc: docRef, filename, caption, ...extra });
const buttons = (body, btns, opts = {}, extra = {}) => ({ type: 'buttons', body, buttons: btns.map(([id, title]) => ({ id, title })), ...opts, ...extra });
const list = (body, button, sections, opts = {}) => ({ type: 'list', body, button, sections, ...opts });
const cta = (body, title, url, opts = {}, extra = {}) => ({ type: 'cta', body, button: { title, url }, ...opts, ...extra });
const carousel = (body, cards) => ({ type: 'carousel', body, cards: cards.map((c) => ({ ...c, buttons: c.buttons.map(([id, title]) => ({ id, title })) })) });
const pieceMedia = (id, view) => ({ kind: 'piece', id, view });

export function createEngine({ store, catalogue, config, now = () => new Date(), random = Math.random, canFlow = () => true }) {
  const brand = config.brand.name;
  const curator = config.curator.name;
  const holdMinutes = config.holdMinutes;
  const D = () => store.data;

  // ---------- stock, holds and editions ----------

  function syncSold(p) {
    if (D().seenRemaining[p.id] !== p.remaining) {
      D().seenRemaining[p.id] = p.remaining;
      D().sold[p.id] = 0;
    }
  }

  function liveHolds(pieceId) {
    const t = now().getTime();
    const holds = (D().holds[pieceId] || []).filter((h) => new Date(h.until).getTime() > t);
    D().holds[pieceId] = holds;
    return holds;
  }

  function available(p, clientId = null) {
    syncSold(p);
    const left = p.remaining - (D().sold[p.id] || 0);
    const heldByOthers = liveHolds(p.id).filter((h) => h.clientId !== clientId).length;
    return Math.max(0, left - heldByOthers);
  }

  function hold(p, clientId, minutes) {
    const holds = liveHolds(p.id).filter((h) => h.clientId !== clientId);
    holds.push({ clientId, until: new Date(now().getTime() + minutes * 60000).toISOString() });
    D().holds[p.id] = holds;
  }

  function release(pieceId, clientId) {
    D().holds[pieceId] = (D().holds[pieceId] || []).filter((h) => h.clientId !== clientId);
  }

  function holdOf(pieceId, clientId) {
    return liveHolds(pieceId).find((x) => x.clientId === clientId) || null;
  }

  function holdMinutesLeft(pieceId, clientId) {
    const h = holdOf(pieceId, clientId);
    return h ? Math.max(1, Math.round((new Date(h.until) - now()) / 60000)) : 0;
  }

  function serialFor(p, editionNo) {
    let tail = '';
    for (let i = 0; i < 4; i++) tail += SERIAL_CHARS[Math.floor(random() * SERIAL_CHARS.length)];
    return `${p.code}${String(editionNo).padStart(2, '0')}-${tail}`;
  }

  // ---------- small helpers ----------

  function outbox() {
    const items = [];
    return {
      items,
      say(clientId, msg) { items.push({ to: 'client', clientId, msg }); },
      alert(a) {
        const alert = { id: `al-${Date.now().toString(36)}-${items.length}`, at: now().toISOString(), ...a };
        store.addAlert(alert);
        items.push({ to: 'owner', alert });
      },
    };
  }

  const who = (c) => c.name || c.profileName || 'A client';

  function curatorIsIn() {
    const h = ist(now()).h;
    return h >= config.curator.opensAt && h < config.curator.closesAt;
  }

  function nextOpening() {
    const at = config.curator.opensAt;
    return ist(now()).h < at ? `at ${at} this morning` : `at ${at} tomorrow morning`;
  }

  const leadDays = () => config.delivery.prepDays + config.delivery.transitDays;
  const etaDay = () => addDays(isoDay(now()), leadDays());
  const presentationLabel = (kind) => (kind === 'chest' ? 'walnut chest' : 'signature box');
  const recipientPhrase = (id) => RECIPIENTS.find((r) => r.id === id)?.phrase || null;

  function activeOrder(c) {
    return c.orders.map((id) => D().orders[id]).filter((o) => o && ACTIVE.includes(o.status)).pop() || null;
  }

  function orderStatusLine(o) {
    if (o.status === 'paid') return `${o.name} is being prepared for you.`;
    if (o.status === 'wrapped') return `${o.name} is wrapped and about to leave our studio.`;
    if (o.status === 'dispatched') return `${o.name} is on its way, expected ${longDate(o.courier.eta)}.`;
    return null;
  }

  function stamp(o, status, extra = {}) {
    o.status = status;
    o.timeline.push({ status, at: now().toISOString(), ...extra });
  }

  // The colour version to lead with: the first that is still available.
  function leadVersion(p, clientId) {
    const family = catalogue.versions(p);
    return family.find((v) => available(v, clientId) > 0) || family[0] || p;
  }

  // ---------- entry point ----------

  function handle(clientId, event, profile = {}) {
    const box = outbox();
    const c = store.client(clientId);
    c.shortlist ||= [];
    const isNew = !c.seen;
    c.seen = true;
    // Away for six hours, or the chat was cleared: greet properly rather than "How may I help?"
    c.away = (c.lastInboundAt ? (now() - new Date(c.lastInboundAt)) / 3600000 > 6 : false) || Boolean(c.chatCleared);
    c.chatCleared = false;
    c.lastInboundAt = now().toISOString();
    if (profile.name) {
      c.profileName = profile.name;
      if (!c.name) c.name = firstName(profile.name);
    }
    route(c, event || {}, box, isNew);
    store.save();
    return box.items;
  }

  function route(c, ev, box, isNew) {
    if (ev.type === 'payment') return onPayment(c, ev, box);
    if (ev.type === 'address') return onAddress(c, ev.address || {}, box);
    if (ev.type === 'form') return onForm(c, ev.name, ev.values || {}, box);
    if (ev.type === 'cart') return onCart(c, ev.items || [], box);
    if (ev.type === 'reply') return onReply(c, String(ev.id || ''), box);
    if (ev.type === 'media') return onMedia(c, ev, box);
    return onText(c, String(ev.text || ''), box, isNew, ev.referral);
  }

  // ---------- taps on buttons, cards and list rows ----------

  function onReply(c, id, box) {
    const [k, a, b] = id.split(':');
    // A tap on anything outside the reserve-and-pay steps ends whatever we were waiting to be typed.
    if (!['card', 'date', 'pres', 'gift'].includes(k)) c.stage = null;
    switch (k) {
      case 'home': return welcome(c, box, false);
      case 'col': return a ? showCollection(c, a, box) : collections(c, box);
      case 'piece': case 'more': return showPiece(c, a, box);
      case 'next': return another(c, a, box);
      case 'save': return save(c, a, box);
      case 'sl': return shortlist(c, box);
      case 'cat': return catalogueMessage(c, box);
      case 'res': return reserve(c, a, box);
      case 'resume': return resume(c, box);
      case 'release': return releaseHold(c, a, box);
      case 'gift': return chooseGift(c, a === 'yes', box);
      case 'pres': return choosePresentation(c, a, box);
      case 'card':
        if (a === 'none') return afterCard(c, null, box);
        if (a === 'ok') return askDate(c, box);
        c.stage = 'card';
        return box.say(c.id, text(C.cardRedo));
      case 'date': return chooseDate(c, a, box);
      case 'pay': return a === 'retry' ? resendOrder(c, box) : bankTransfer(c, box);
      case 'conc': return concierge(c, box);
      case 'cur': return openCurator(c, box, null);
      case 'view': return a ? bookViewing(c, a, box) : viewing(c, box);
      case 'trou': return a ? trousseauSize(c, a, box) : trousseau(c, box);
      case 'besp': return startLead(c, 'bespoke', C.bespoke(config.prices.monogram), box);
      case 'orders': return myOrders(c, box);
      case 'order': return orderDetail(c, a, box);
      case 'inv': return sendInvoice(c, a, box);
      case 'reg': c.stage = 'register'; return box.say(c.id, text(C.registerAsk));
      case 'prom': return box.say(c.id, text(C.promises(config.seller, catalogue.hasGi())));
      case 'care': return box.say(c.id, text(C.care));
      case 'gf': return giftFinder(c, a, b, box);
      case 'opt': return setOptIn(c, a === 'yes', box);
      case 'notify': return notifyMe(c, a, box);
      case 'remind': c.stage = 'lead:reminder'; c.ctx.reminderOrder = a; return box.say(c.id, text(C.remindAsk));
      default: return fallback(c, box);
    }
  }

  // ---------- typed messages ----------

  function onText(c, raw, box, isNew, referral) {
    const t = raw.trim();
    const u = understand(t, catalogue.all());

    if (u.intent === 'optout') return optOut(c, box);

    // A curator is looking after this client: pass everything on, quietly.
    // A conversation nobody has touched for 12 hours goes back to the bot.
    if (c.thread?.open) {
      const last = c.thread.messages.at(-1)?.at || c.thread.openedAt;
      if ((now() - new Date(last)) / 3600000 > 12) c.thread.open = false;
      else return forwardToCurator(c, t, box);
    }

    // Arrived from an ad, a link or the catalogue that names a piece: open on that piece.
    const linked = referral?.pieceId && catalogue.get(referral.pieceId);
    if (linked) return showPiece(c, linked.id, box, { intro: isNew });

    const escape = ['greet', 'curator'].includes(u.intent);

    if (c.stage === 'card') {
      if (u.noCard) return afterCard(c, null, box);
      if (t.length > 200) return box.say(c.id, text(C.cardTooLong(t.length)));
      return setCard(c, t, box);
    }
    if (c.stage === 'address' && !escape && (/\b\d{6}\b/.test(t) || t.length > 25)) {
      return onAddress(c, { text: t }, box);
    }
    if (c.stage === 'date' && !escape) {
      const d = c.ctx.draft;
      if (d) { d.deliverOn = null; d.deliverNote = t; }
      box.say(c.id, text(C.dateNoted(t)));
      return askAddress(c, box);
    }
    if (c.stage === 'register' && !escape) {
      let code = u.serial || t.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      if (/^[A-Z]{2}\d{2}[A-Z0-9]{4}$/.test(code)) code = `${code.slice(0, 4)}-${code.slice(4)}`;
      return register(c, code, box);
    }
    if (c.stage?.startsWith('lead:') && !escape) return captureLead(c, t, box);

    if (/\b(bank transfer|neft|rtgs|imps)\b/i.test(t)) return bankTransfer(c, box);

    if (isNew && u.piece && !u.intent) return showPiece(c, u.piece, box, { intro: true });
    if (isNew && (!u.intent || u.intent === 'greet' || u.intent === 'browse')) {
      if (!u.recipient && !u.colour && !u.budget) return welcome(c, box, true);
    }

    switch (u.intent) {
      case 'greet': return welcome(c, box, isNew);
      case 'register': return register(c, u.serial, box);
      case 'curator': return openCurator(c, box, null);
      case 'orders': return myOrders(c, box);
      case 'returns': return box.say(c.id, buttons(C.returns, [['cur', 'Arrange a return'], ['orders', 'My orders']]));
      case 'discount': return box.say(c.id, buttons(C.discount, [['col', 'The collection'], ['gf', 'Find a gift']]));
      case 'cod': return box.say(c.id, text(C.cod));
      case 'international': return startLead(c, 'international', C.international, box);
      case 'trousseau': return trousseau(c, box);
      case 'bespoke': return startLead(c, 'bespoke', C.bespoke(config.prices.monogram), box);
      case 'viewing': return viewing(c, box);
      case 'authenticity': return box.say(c.id, buttons(C.authenticity(catalogue.hasGi()), [['col', 'The collection'], ['cur', 'Speak to a curator']]));
      case 'care': return box.say(c.id, text(C.care));
      case 'promises': return box.say(c.id, text(C.promises(config.seller, catalogue.hasGi())));
      case 'thanks': return box.say(c.id, text(C.thanks));
      case 'price': return price(c, u, box);
      case 'shortlist': return shortlist(c, box);
      case 'catalogue': return catalogueMessage(c, box);
      case 'buy': {
        const id = u.piece || c.ctx.piece;
        return id ? reserve(c, id, box) : collections(c, box);
      }
      default: break;
    }

    if (u.piece) return showPiece(c, u.piece, box);
    if (u.recipient || u.colour || u.budget || u.occasion || u.intent === 'gift') {
      if (!u.recipient && !u.colour && !u.budget && !u.occasion) return giftFinder(c, null, null, box);
      return suggestFromText(c, u, box);
    }
    if (u.intent === 'browse') return collections(c, box);
    return fallback(c, box);
  }

  function onMedia(c, ev, box) {
    if (c.thread?.open) return forwardToCurator(c, '[sent a photo]', box);
    box.say(c.id, text(C.mediaThanks(curator)));
    addLead(c, 'photo', 'Sent a photo', box);
  }

  // A cart sent from WhatsApp's own catalogue: set aside the first piece, keep the rest on the shortlist.
  function onCart(c, ids, box) {
    const pieces = ids.map((id) => catalogue.get(id)).filter(Boolean);
    if (!pieces.length) return collections(c, box);
    for (const p of pieces.slice(1)) if (!c.shortlist.includes(p.id)) c.shortlist.push(p.id);
    if (pieces.length > 1) box.say(c.id, text(C.cartMany(pieces.map((p) => `*${p.name}*`))));
    return reserve(c, pieces[0].id, box);
  }

  // ---------- welcome & browsing ----------

  function welcome(c, box, isNew) {
    c.stage = null;
    const greet = greeting(now());
    const active = activeOrder(c);
    const draft = c.ctx.draft && catalogue.get(c.ctx.draft.pieceId);
    const middle = active ? ['orders', 'My order']
      : draft ? ['resume', C.continueBtn]
        : c.shortlist.length ? ['sl', 'My shortlist'] : ['gf', 'Find a gift'];
    const btns = [['col', 'The collection'], middle, ['conc', 'Concierge']];
    // Mid-conversation "hi" or "menu": no second grand welcome, just the way forward.
    if (!isNew && !c.away) return box.say(c.id, buttons(C.welcomeAgain, btns));
    const status = active ? orderStatusLine(active)
      : draft ? C.resumeLine(draft, recipientPhrase(c.ctx.draft.recipient))
        : c.shortlist.length ? C.shortlistLine(c.shortlist.length) : null;
    const body = isNew ? C.welcomeNew({ greet, name: c.name, brand }) : C.welcomeBack({ greet, name: c.name, status });
    // The welcome is the lookbook itself: what they were doing first, then the collections, then help.
    const cards = [];
    const shortlisted = c.shortlist.map((id) => catalogue.get(id)).filter(Boolean);
    if (active) cards.push({ media: pieceMedia(active.pieceId, 'hero'), body: C.welcomeOrderCard(active), buttons: [['orders', 'My order']] });
    else if (draft) cards.push({ media: pieceMedia(draft.id, 'hero'), body: C.welcomeContinueCard(draft, recipientPhrase(c.ctx.draft.recipient)), buttons: [['resume', C.continueBtn]] });
    else if (shortlisted.length) cards.push({ media: pieceMedia(shortlisted[0].id, 'hero'), body: C.welcomeShortlistCard(shortlisted.length), buttons: [['sl', 'My shortlist']] });
    cards.push(...collectionCards(c));
    cards.push({ media: { kind: 'asset', id: 'presentation' }, body: C.welcomeGiftCard, buttons: [['gf', 'Find a gift']] });
    cards.push({ media: { kind: 'asset', id: 'concierge' }, body: C.welcomeConciergeCard, buttons: [['conc', 'Concierge']] });
    box.say(c.id, carousel(body, cards.slice(0, 10)));
  }

  function collectionCards(c) {
    return COLLECTIONS.map((col) => {
      const pieces = catalogue.inCollection(col.id);
      if (!pieces.length) return null;
      const lead = pieces.filter((p) => available(p, c.id) > 0).sort((a, b) => b.price - a.price)[0] || pieces[0];
      return { media: pieceMedia(lead.id, 'hero'), body: C.collectionCard(col, Math.min(...pieces.map((p) => p.price))), buttons: [[`col:${col.id}`, C.viewPieces]] };
    }).filter(Boolean);
  }

  function collections(c, box) {
    c.stage = null;
    box.say(c.id, carousel(C.collectionsCarousel, collectionCards(c)));
  }

  // One card per design, the dearest first (it frames the rest), anything sold out last.
  function designCards(pieces, c) {
    const designs = [...new Set(pieces.map((p) => p.design))].map((d) => catalogue.all().find((p) => p.design === d));
    return designs
      .map((p) => {
        const lead = leadVersion(p, c.id);
        const family = catalogue.versions(lead);
        const left = family.reduce((s, v) => s + available(v, c.id), 0);
        return { lead, family, left: available(lead, c.id), any: left };
      })
      .sort((x, y) => (y.any > 0) - (x.any > 0) || y.lead.price - x.lead.price)
      .slice(0, 10)
      .map(({ lead, family, left, any }) => ({
        media: pieceMedia(lead.id, 'hero'),
        body: C.designCard(lead, family.length, any > 0 ? Math.max(left, 1) : 0),
        buttons: any > 0
          ? [[`piece:${lead.id}`, C.seeClosely], [`save:${lead.id}`, C.save]]
          : [[`piece:${lead.id}`, C.seeClosely], [`notify:${lead.id}`, C.notifyMe]],
      }));
  }

  function showCollection(c, colId, box) {
    const col = catalogue.collection(colId);
    if (!col) return collections(c, box);
    c.ctx.collection = colId;
    c.ctx.suggestions = null;
    const cards = designCards(catalogue.inCollection(colId), c);
    if (!cards.length) return collections(c, box);
    if (cards.length < 2) return showPiece(c, cards[0].buttons[0][0].split(':')[1], box);
    box.say(c.id, carousel(C.collectionCarousel(col), cards));
  }

  // "See closely": every angle of the piece, and each other colour, in one swipe.
  function showPiece(c, pieceId, box, { intro = false } = {}) {
    const p = catalogue.get(pieceId);
    if (!p) return collections(c, box);
    const left = available(p, c.id);
    const others = catalogue.versions(p).filter((v) => v.id !== p.id);
    if (left <= 0 && !others.some((v) => available(v, c.id) > 0)) return soldOut(c, p, box);
    c.ctx.piece = p.id;
    const own = left > 0
      ? [[`res:${p.id}`, C.reserve], ['view', C.videoViewing]]
      : [[`notify:${p.id}`, C.notifyMe], ['view', C.videoViewing]];
    const cards = [
      { media: pieceMedia(p.id, 'hero'), body: C.cardWorn(p), buttons: own },
      { media: pieceMedia(p.id, 'detail'), body: C.cardDetail(p), buttons: own },
      { media: pieceMedia(p.id, 'flat'), body: C.cardFlat(p), buttons: own },
      ...others.slice(0, 7).map((v) => ({
        media: pieceMedia(v.id, 'hero'), body: C.cardVersion(v, available(v, c.id)),
        buttons: available(v, c.id) > 0 ? [[`res:${v.id}`, C.reserve], [`piece:${v.id}`, C.seeClosely]] : [[`notify:${v.id}`, C.notifyMe], [`piece:${v.id}`, C.seeClosely]],
      })),
    ];
    const hello = intro ? `${greeting(now())}${c.name ? ', ' + c.name : ''}. Welcome to *${brand}*.` : null;
    box.say(c.id, carousel(C.closely({ p, available: left, curator, intro: hello }), cards));
  }

  function another(c, fromId, box) {
    const from = catalogue.get(fromId);
    let pool = catalogue.inCollection(from?.collection || c.ctx.collection || '').filter((p) => available(p, c.id) > 0);
    if (pool.length < 2) pool = catalogue.all().filter((p) => available(p, c.id) > 0);
    const i = pool.findIndex((p) => p.id === fromId);
    const next = pool[(i + 1) % pool.length];
    if (!next || next.id === fromId) return collections(c, box);
    return showPiece(c, next.id, box);
  }

  function similarTo(p, clientId) {
    const others = catalogue.all().filter((x) => x.design !== p.design && available(x, clientId) > 0);
    const sameColour = others.find((x) => x.colour_words.some((w) => p.colour_words.includes(w)));
    if (sameColour) return { alt: sameColour, relation: `It shares the same ${sameColour.colour.toLowerCase()} ground` };
    const sameCollection = others.find((x) => x.collection === p.collection);
    if (sameCollection) return { alt: sameCollection, relation: "It's from the same collection" };
    return { alt: null };
  }

  function soldOut(c, p, box) {
    const { alt, relation } = similarTo(p, c.id);
    const btns = alt
      ? [[`piece:${alt.id}`, `Show me ${alt.designName}`.slice(0, 20)], [`notify:${p.id}`, 'Tell me if you do'], ['col', 'The collection']]
      : [[`notify:${p.id}`, 'Yes, please'], ['col', 'The collection']];
    box.say(c.id, buttons(C.soldOut(p, alt, relation), btns));
  }

  function notifyMe(c, pieceId, box) {
    const p = catalogue.pieces.find((x) => x.id === pieceId);
    if (!p) return fallback(c, box);
    const w = D().waitlist[p.id] || (D().waitlist[p.id] = []);
    if (!w.includes(c.id)) w.push(c.id);
    box.say(c.id, text(C.notifyYes(p)));
    addLead(c, 'waitlist', `Wants to hear if ${p.name} is made again`, box, { quiet: true });
  }

  function save(c, pieceId, box) {
    const p = catalogue.get(pieceId);
    if (!p) return fallback(c, box);
    if (!c.shortlist.includes(p.id)) c.shortlist.push(p.id);
    const names = c.shortlist.map((id) => catalogue.get(id)).filter(Boolean).map((x) => `*${x.name}*`);
    box.say(c.id, buttons(C.saved(names.join(', ')), [['sl', C.viewShortlist]]));
  }

  function shortlist(c, box) {
    c.stage = null;
    const pieces = c.shortlist.map((id) => catalogue.get(id)).filter(Boolean);
    if (!pieces.length) return box.say(c.id, buttons(C.shortlistEmpty, [['col', 'The collection'], ['gf', 'Find a gift']]));
    if (pieces.length === 1) return showPiece(c, pieces[0].id, box);
    box.say(c.id, carousel(C.shortlist(pieces.length), pieces.slice(0, 10).map((p) => ({
      media: pieceMedia(p.id, 'hero'), body: C.pickCard(p, curator, false),
      buttons: available(p, c.id) > 0 ? [[`res:${p.id}`, C.reserve], [`piece:${p.id}`, C.seeClosely]] : [[`notify:${p.id}`, C.notifyMe], [`piece:${p.id}`, C.seeClosely]],
    }))));
  }

  function catalogueMessage(c, box) {
    c.stage = null;
    const lead = catalogue.all().filter((p) => available(p, c.id) > 0).sort((a, b) => b.price - a.price)[0];
    box.say(c.id, { type: 'catalog', body: C.catalogBody, footer: C.pricesFooter, button: C.catalogButton, thumbnail: lead?.id });
  }

  function price(c, u, box) {
    const p = catalogue.get(u.piece || c.ctx.piece);
    if (p) return box.say(c.id, buttons(C.price(p), [[`res:${p.id}`, 'Reserve this piece'], [`piece:${p.id}`, C.seeClosely]]));
    const prices = catalogue.all().map((x) => x.price);
    box.say(c.id, buttons(C.priceRange(Math.min(...prices), Math.max(...prices)), [['col', 'The collection'], ['gf', 'Find a gift']]));
  }

  // ---------- the gift finder ----------

  function giftFinder(c, step, value, box) {
    c.stage = null;
    if (!step) {
      c.ctx.gift = { isGift: true };
      if (canFlow(c.id)) {
        return box.say(c.id, { type: 'flow', body: C.giftFinderFlow, button: C.giftFinderFlowButton,
          flow: { name: 'gift_finder', token: `gift_finder:${c.id}`, data: {
            recipients: RECIPIENTS.map((r) => ({ id: r.id, title: r.title })),
            occasions: OCCASIONS.map((o) => ({ id: o.id, title: o.title })),
            budgets: BUDGETS.map((b) => ({ id: b.id, title: b.title })),
          } } });
      }
      return box.say(c.id, list(C.giftWho, C.giftButton, [{ title: 'For', rows: RECIPIENTS.map((r) => ({ id: `gf:r:${r.id}`, title: r.title })) }]));
    }
    const g = c.ctx.gift || (c.ctx.gift = { isGift: true });
    if (step === 'r') {
      g.recipient = value;
      return box.say(c.id, list(C.giftOccasion, C.giftButton, [{ title: 'Occasion', rows: OCCASIONS.map((o) => ({ id: `gf:o:${o.id}`, title: o.title })) }]));
    }
    if (step === 'o') {
      g.occasion = value;
      return box.say(c.id, list(C.giftBudget, C.giftButton, [{
        title: 'Budget', rows: BUDGETS.map((b) => ({ id: `gf:b:${b.id}`, title: b.title, ...(b.description ? { description: b.description } : {}) })),
      }]));
    }
    if (step === 'b') {
      g.budget = value;
      return suggest(c, box);
    }
    return fallback(c, box);
  }

  function rank(filters, clientId) {
    const { recipient, occasion, colour, min = 0, max = Infinity } = filters;
    let pool = catalogue.all().filter((p) => available(p, clientId) > 0);
    // A colour asked for by name is a requirement, not a preference.
    if (colour) pool = pool.filter((p) => p.colour_words.includes(colour));
    const ranked = pool
      .map((p) => {
        let s = 0;
        if (recipient) s += p.for.includes(recipient) ? 3 : -3;
        if (occasion) s += p.occasions.includes(occasion) ? 2 : 0;
        if (colour) s += 4;
        if (p.price >= min && p.price <= max) s += 3;
        else if (p.price > max) s -= Math.min(6, ((p.price - max) / max) * 6);
        else s -= 1;
        return { p, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.p.price - a.p.price);
    // One design per suggestion, unless a colour was asked for: three different shawls, not one in three colours.
    if (colour) return ranked;
    const seen = new Set();
    return ranked.filter(({ p }) => (seen.has(p.design) ? false : seen.add(p.design)));
  }

  function picksCarousel(c, body, picks) {
    c.ctx.suggestions = picks.map((p) => p.id);
    return carousel(body, picks.map((p, i) => ({
      media: pieceMedia(p.id, 'hero'), body: C.pickCard(p, curator, i === 0),
      buttons: [[`piece:${p.id}`, C.seeClosely], [`save:${p.id}`, C.save]],
    })));
  }

  function suggest(c, box) {
    const g = c.ctx.gift || {};
    const budget = BUDGETS.find((b) => b.id === g.budget) || BUDGETS[4];
    const picks = rank({ recipient: g.recipient, occasion: g.occasion, min: budget.min, max: budget.max }, c.id).slice(0, 3).map((x) => x.p);
    if (!picks.length) return box.say(c.id, buttons(C.suggestNone, [['cur', 'Yes, please'], ['col', 'The collection']]));
    if (picks.length === 1) return showPiece(c, picks[0].id, box);
    const occasion = OCCASIONS.find((o) => o.id === g.occasion)?.phrase;
    const stretched = picks.some((p) => p.price > budget.max);
    box.say(c.id, picksCarousel(c, C.suggestIntro({ recipient: recipientPhrase(g.recipient) || 'them', occasion, count: picks.length, stretched }), picks));
  }

  function suggestFromText(c, u, box) {
    if (u.recipient) c.ctx.gift = { ...(c.ctx.gift || {}), isGift: true, recipient: u.recipient, occasion: u.occasion || c.ctx.gift?.occasion };
    const picks = rank({ recipient: u.recipient, occasion: u.occasion, colour: u.colour, max: u.budget || Infinity }, c.id).slice(0, 5).map((x) => x.p);
    if (!picks.length) return box.say(c.id, buttons(C.suggestNone, [['cur', 'Yes, please'], ['col', 'The collection']]));
    if (picks.length === 1) return showPiece(c, picks[0].id, box);
    const body = u.recipient
      ? C.suggestIntro({
        recipient: recipientPhrase(u.recipient),
        occasion: OCCASIONS.find((o) => o.id === u.occasion)?.phrase,
        count: picks.length,
        stretched: u.budget ? picks.some((p) => p.price > u.budget) : false,
      })
      : C.suggestFromText({ colour: u.colour, budget: u.budget, occasion: OCCASIONS.find((o) => o.id === u.occasion)?.phrase });
    box.say(c.id, picksCarousel(c, body, picks));
  }

  // ---------- reserving: one page for the details, then address, then pay ----------

  function reserve(c, pieceId, box) {
    const p = catalogue.get(pieceId);
    if (!p) return collections(c, box);
    if (available(p, c.id) <= 0) return soldOut(c, p, box);
    hold(p, c.id, holdMinutes);
    c.ctx.piece = p.id;
    if (!c.shortlist.includes(p.id)) c.shortlist.push(p.id);
    const g = c.ctx.gift;
    const fromFinder = g?.isGift && g.recipient;
    const prev = c.ctx.draft;
    c.ctx.draft = {
      pieceId: p.id, isGift: fromFinder ? true : null,
      recipient: g?.recipient || null, occasion: g?.occasion || null,
      presentation: null, card: null, deliverOn: null, deliverNote: null, nudged: false,
      // a piece swapped mid-checkout keeps what was already chosen
      ...(prev && prev.pieceId !== p.id ? { isGift: prev.isGift ?? (fromFinder ? true : null), presentation: prev.presentation, card: prev.card } : {}),
    };
    if (canFlow(c.id)) return sendOptionsFlow(c, p, box);
    if (fromFinder) {
      box.say(c.id, text(C.reservedGift(p, holdMinutes, recipientPhrase(g.recipient))));
      return askPresentation(c, box);
    }
    box.say(c.id, buttons(C.reservedAsk(p, holdMinutes), [['gift:yes', "Yes, it's a gift"], ['gift:no', "It's for me"]]));
  }

  function sendOptionsFlow(c, p, box) {
    const d = c.ctx.draft;
    const suggestions = cardSuggestions(d.recipient, d.occasion);
    c.ctx.cardSuggestions = suggestions;
    const first = addDays(isoDay(now()), leadDays() + 1);
    box.say(c.id, {
      type: 'flow', body: C.reservedFlow(p, holdMinutes), button: C.reservedFlowButton,
      flow: {
        name: 'order_options', token: `order_options:${c.id}:${p.id}`,
        data: {
          piece: p.name,
          for_whom: d.isGift === true ? 'gift' : d.isGift === false ? 'me' : '',
          presentation_options: [
            { id: 'box', title: 'Signature box', description: 'Linen, tissue and a silk ribbon. Complimentary.' },
            { id: 'chest', title: `Walnut chest · ${rupees(config.prices.walnutChest)}`, description: 'Hand-carved in Srinagar, to keep it in for a lifetime.' },
          ],
          card_options: [{ id: 'none', title: 'No card' }, ...suggestions, { id: 'own', title: 'My own words', description: 'Write them below' }],
          delivery_options: [
            { id: 'asap', title: 'As soon as possible', description: `By ${longDate(etaDay())}` },
            { id: 'date', title: 'On a particular day', description: 'Choose it below' },
          ],
          min_date: first, max_date: addDays(first, 60),
        },
      },
    });
  }

  function onForm(c, name, v, box) {
    if (name === 'gift_finder') {
      const one = (x) => (Array.isArray(x) ? x[0] : x) || null; // chips answer as a list
      c.ctx.gift = { isGift: true, recipient: one(v.recipient), occasion: one(v.occasion), budget: one(v.budget) || 'b5' };
      return suggest(c, box);
    }
    if (name === 'order_options') {
      const d = draftOrRestart(c, box);
      if (!d) return;
      d.isGift = v.for_whom !== 'me';
      d.presentation = v.presentation === 'chest' ? 'chest' : 'box';
      const picked = (c.ctx.cardSuggestions || []).find((s) => s.id === v.card_choice);
      const own = String(v.card_text || '').trim().slice(0, 200);
      d.card = !d.isGift ? null : own || (picked ? picked.description : null);
      const day = /^\d{4}-\d{2}-\d{2}$/.test(v.date || '') ? v.date : null;
      d.deliverOn = v.delivery === 'date' && day && day > isoDay(now()) ? day : null;
      return askAddress(c, box);
    }
    return fallback(c, box);
  }

  function draftOrRestart(c, box) {
    const d = c.ctx.draft;
    if (!d || !catalogue.get(d.pieceId)) { collections(c, box); return null; }
    return d;
  }

  // Conversational path, used when WhatsApp Flows aren't switched on for the live number.
  function chooseGift(c, isGift, box) {
    const d = draftOrRestart(c, box);
    if (!d) return;
    d.isGift = isGift;
    askPresentation(c, box);
  }

  function askPresentation(c, box) {
    box.say(c.id, buttons(C.presentation(config.prices.walnutChest), [['pres:box', 'Signature box'], ['pres:chest', 'Walnut chest']],
      { header: { type: 'image', media: { kind: 'asset', id: 'presentation' } } }));
  }

  function choosePresentation(c, kind, box) {
    const d = draftOrRestart(c, box);
    if (!d) return;
    d.presentation = kind === 'chest' ? 'chest' : 'box';
    if (d.isGift) {
      c.stage = 'card';
      return box.say(c.id, buttons(C.cardAsk, [['card:none', 'No card, thank you']], { footer: C.cardFooter }));
    }
    askAddress(c, box);
  }

  function setCard(c, t, box) {
    const d = draftOrRestart(c, box);
    if (!d) return;
    d.card = t;
    box.say(c.id, buttons(C.cardConfirm(t), [['card:ok', "That's perfect"], ['card:redo', 'Let me rewrite']]));
  }

  function afterCard(c, t, box) {
    const d = draftOrRestart(c, box);
    if (!d) return;
    d.card = t;
    askDate(c, box);
  }

  function askDate(c, box) {
    const d = draftOrRestart(c, box);
    if (!d) return;
    c.stage = 'date';
    const first = addDays(isoDay(now()), leadDays() + 1);
    const rows = [{ id: 'date:asap', title: C.dateAsap, description: C.dateAsapDescription(leadDays()) }];
    for (let i = 0; i < 8; i++) {
      const day = addDays(first, i);
      rows.push({ id: `date:${day.replace(/-/g, '')}`, title: longDate(day) });
    }
    box.say(c.id, list(C.dateAsk, C.dateButton, [{ title: 'Arriving', rows }], { footer: C.dateFooter }));
  }

  function chooseDate(c, value, box) {
    const d = draftOrRestart(c, box);
    if (!d) return;
    d.deliverOn = value === 'asap' ? null : `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    d.deliverNote = null;
    askAddress(c, box);
  }

  function askAddress(c, box) {
    const d = draftOrRestart(c, box);
    if (!d) return;
    c.stage = 'address';
    box.say(c.id, { type: 'address', body: C.addressAsk(d.isGift), forGift: !!d.isGift, saved: d.isGift ? [] : c.addresses.slice(-3) });
  }

  function onAddress(c, addr, box) {
    const d = c.ctx.draft;
    if (!d) return box.say(c.id, text(C.thanks));
    const p = catalogue.get(d.pieceId);
    if (!p) return collections(c, box);
    if (available(p, c.id) <= 0) { c.stage = null; return soldOut(c, p, box); }
    if (addr.text) box.say(c.id, text(C.addressText));
    if (!d.isGift && !addr.text) {
      const key = `${addr.pin}|${addr.house}`.toLowerCase();
      if (!c.addresses.some((a) => `${a.pin}|${a.house}`.toLowerCase() === key)) c.addresses.push(addr);
    }
    hold(p, c.id, Math.max(holdMinutes, holdMinutesLeft(p.id, c.id)));
    // The same form sent twice (or corrected) updates the waiting order instead of making a second one.
    const waiting = d.orderId && D().orders[d.orderId];
    if (waiting && waiting.status === 'awaiting_payment' && waiting.pieceId === p.id) {
      waiting.address = addr;
      c.stage = null;
      return sendOrder(c, waiting, box);
    }
    const extras = d.presentation === 'chest' ? config.prices.walnutChest : 0;
    const o = {
      id: store.nextOrderId(config.brand.orderPrefix), clientId: c.id, pieceId: p.id, name: p.name,
      price: p.price, gst_rate: p.gst_rate, extras, total: p.price + extras,
      presentation: d.presentation || 'box', presentationLabel: presentationLabel(d.presentation),
      isGift: !!d.isGift, recipient: d.recipient, occasion: d.occasion, card: d.card,
      deliverOn: d.deliverOn, deliverNote: d.deliverNote, address: addr,
      status: 'awaiting_payment', timeline: [], createdAt: now().toISOString(),
      editionNo: null, serial: null, payment: null, courier: null,
    };
    stamp(o, 'awaiting_payment');
    D().orders[o.id] = o;
    c.orders.push(o.id);
    c.ctx.pendingOrder = o.id;
    d.orderId = o.id;
    c.stage = null;
    sendOrder(c, o, box);
  }

  function sendOrder(c, o, box) {
    const p = catalogue.get(o.pieceId);
    const arrive = o.deliverOn ? `on ${longDate(o.deliverOn)}` : `by ${longDate(etaDay())}`;
    box.say(c.id, {
      type: 'order',
      body: C.orderBody({ p, presentation: o.presentationLabel, card: o.card, arrive }),
      footer: C.orderFooter,
      order: {
        ref: o.id,
        items: [{ id: p.id, name: p.name, price: o.price, media: pieceMedia(p.id, 'hero') }],
        extras: o.extras ? [{ name: 'Walnut chest', price: o.extras }] : [],
        lines: [
          [capital(o.presentationLabel), o.extras ? rupees(o.extras) : 'Complimentary'],
          ...(o.card ? [['Handwritten card', 'Complimentary']] : []),
          ['Insured delivery', 'Complimentary'],
        ],
        total: o.total,
        gstRate: o.gst_rate,
      },
    });
  }

  function pendingOrder(c) {
    const o = D().orders[c.ctx.pendingOrder];
    return o && ['awaiting_payment', 'awaiting_transfer'].includes(o.status) ? o : null;
  }

  function resendOrder(c, box) {
    const o = pendingOrder(c);
    if (!o) return box.say(c.id, buttons(C.noPendingOrder, [['col', 'The collection']]));
    const p = catalogue.get(o.pieceId);
    if (p && available(p, c.id) <= 0) return soldOut(c, p, box);
    if (p) hold(p, c.id, holdMinutes);
    sendOrder(c, o, box);
  }

  // "Continue" from the reminder or the welcome: pick up exactly where they left off.
  function resume(c, box) {
    const o = pendingOrder(c);
    if (o && o.status === 'awaiting_payment') return resendOrder(c, box);
    const d = c.ctx.draft;
    if (d && catalogue.get(d.pieceId)) return reserve(c, d.pieceId, box);
    return collections(c, box);
  }

  function releaseHold(c, pieceId, box) {
    const p = catalogue.get(pieceId);
    if (!p) return fallback(c, box);
    release(p.id, c.id);
    if (c.ctx.draft?.pieceId === p.id) c.ctx.draft = null;
    const o = pendingOrder(c);
    if (o && o.pieceId === p.id && o.status === 'awaiting_payment') { stamp(o, 'cancelled'); c.ctx.pendingOrder = null; }
    if (!c.shortlist.includes(p.id)) c.shortlist.push(p.id);
    box.say(c.id, text(C.released(p)));
  }

  function bankTransfer(c, box) {
    const o = pendingOrder(c);
    if (!o) return box.say(c.id, buttons(C.noPendingOrder, [['col', 'The collection']]));
    const p = catalogue.get(o.pieceId);
    if (o.status !== 'awaiting_transfer') stamp(o, 'awaiting_transfer');
    if (p) hold(p, c.id, config.transferHoldHours * 60);
    box.say(c.id, text(C.bankTransfer({ order: o, bank: config.bank, p: p || { name: o.name } })));
    box.alert({ kind: 'transfer', orderId: o.id, clientId: c.id, title: `Bank transfer expected for ${o.id}: ${rupees(o.total)}`,
      lines: [`${who(c)} chose bank transfer. Mark it received in Orders when it lands.`] });
  }

  function onPayment(c, ev, box) {
    const o = D().orders[ev.ref];
    if (!o || o.clientId !== c.id) return;
    const p = catalogue.get(o.pieceId);
    if (ev.status === 'captured') return confirmPayment(o, ev.method || 'UPI', box);
    if (['paid', 'wrapped', 'dispatched', 'delivered'].includes(o.status)) return;
    if (p) hold(p, c.id, holdMinutes);
    o.timeline.push({ status: 'payment_failed', at: now().toISOString() });
    box.say(c.id, buttons(C.payFailed(p || { name: o.name }, holdMinutes),
      [['pay:retry', 'Try again'], ['pay:bank', 'Bank transfer'], ['cur', 'Speak to a curator']]));
  }

  function confirmPayment(o, method, box) {
    if (!['awaiting_payment', 'awaiting_transfer', 'cancelled'].includes(o.status)) return;
    const c = store.client(o.clientId);
    const p = catalogue.get(o.pieceId);
    o.payment = { method, at: now().toISOString() };
    if (!p || available(p, c.id) <= 0) {
      stamp(o, 'attention');
      box.say(c.id, text(C.paymentAttention));
      box.alert({ kind: 'urgent', orderId: o.id, clientId: c.id, title: `Paid, but ${o.name} is no longer available: ${o.id}`,
        lines: ['Call the client today: offer a similar piece or a full refund.'] });
      return;
    }
    syncSold(p);
    const left = p.remaining - (D().sold[p.id] || 0);
    o.editionNo = p.edition_size - left + 1;
    o.serial = serialFor(p, o.editionNo);
    D().sold[p.id] = (D().sold[p.id] || 0) + 1;
    release(p.id, c.id);
    stamp(o, 'paid');
    c.ctx.draft = null;
    c.ctx.pendingOrder = null;
    c.shortlist = c.shortlist.filter((id) => id !== p.id);
    c.registered.push(o.serial);
    const dest = o.isGift ? (o.address?.city ? `to ${o.address.city}` : 'to its new home') : 'to you';
    const when = o.deliverOn ? `to arrive on ${longDate(o.deliverOn)}` : `within ${word(config.delivery.prepDays)} days`;
    const late = method === 'bank transfer';
    box.say(c.id, text(C.paid({ name: c.name, id: o.id, p, editionNo: o.editionNo, dest, when }), late ? { proactive: true, template: { name: 'payment_received', params: [o.id, p.name] } } : {}));
    box.say(c.id, doc({ kind: 'invoice', orderId: o.id }, `${brand}-${o.id}-invoice.pdf`, C.invoiceCaption(o.id), late ? { proactive: true } : {}));
    box.alert({ kind: 'order', orderId: o.id, clientId: c.id, title: `New order ${o.id}: ${rupees(o.total)}`, lines: C.ownerNewOrder(o, p, c) });
  }

  // ---------- concierge ----------

  function concierge(c, box) {
    c.stage = null;
    box.say(c.id, list(C.conciergeBody, C.conciergeButton, [{ title: 'Concierge', rows: C.conciergeRows }],
      { header: { type: 'text', text: C.conciergeHeader } }));
  }

  function openCurator(c, box, note) {
    c.stage = null;
    const open = curatorIsIn();
    c.thread = { open: true, openedAt: now().toISOString(), acked: false, messages: note ? [{ from: 'client', text: note, at: now().toISOString() }] : [] };
    box.say(c.id, text(C.curatorOpen({ curator, open, when: nextOpening() })));
    box.alert({ kind: 'curator', clientId: c.id, title: `${who(c)} would like to speak to a curator`,
      lines: [open ? 'Reply from the Inbox within the hour.' : `Promised: ${nextOpening()}.`] });
  }

  function forwardToCurator(c, t, box) {
    c.thread.messages.push({ from: 'client', text: t, at: now().toISOString() });
    box.alert({ kind: 'message', clientId: c.id, title: `${who(c)}: ${t.slice(0, 120)}`, lines: [] });
    if (!c.thread.acked) {
      c.thread.acked = true;
      box.say(c.id, text(C.curatorForwarded(curator)));
    }
  }

  function viewingSlots() {
    const taken = new Set(D().viewings.map((v) => v.at));
    const earliest = now().getTime() + 2 * 3600000;
    const slots = [];
    const today = isoDay(now());
    for (let dayOffset = 0; dayOffset < 5 && slots.length < 9; dayOffset++) {
      const day = addDays(today, dayOffset);
      const [y, m, d] = day.split('-').map(Number);
      for (const [h, min] of [[11, 0], [13, 0], [15, 0], [17, 0], [18, 0]]) {
        if (h < config.curator.opensAt || h >= config.curator.closesAt) continue;
        const at = istDate(y, m, d, h, min);
        if (at.getTime() < earliest || taken.has(at.toISOString())) continue;
        const rel = relativeDay(day, now());
        const label = rel === 'today' || rel === 'tomorrow' ? capital(rel) : shortDate(day);
        slots.push({ id: `view:${day.replace(/-/g, '')}-${String(h).padStart(2, '0')}${String(min).padStart(2, '0')}`, title: `${label}, ${clockTime(h, min)}` });
        if (slots.length >= 9) break;
      }
    }
    return slots;
  }

  function viewing(c, box) {
    c.stage = null;
    const slots = viewingSlots();
    const p = catalogue.get(c.ctx.piece);
    if (!slots.length) return box.say(c.id, buttons(C.viewingNone, [['cur', 'Yes, please'], ['col', 'The collection']]));
    box.say(c.id, list(C.viewingAsk(curator, p), C.viewingButton, [{
      title: 'Times (India)', rows: slots.map((s) => ({ id: s.id, title: s.title, description: 'Fifteen minutes, on WhatsApp video' })),
    }]));
  }

  function bookViewing(c, key, box) {
    const m = key.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
    if (!m) return viewing(c, box);
    const [, y, mo, d, h, min] = m.map(Number);
    const at = istDate(y, mo, d, h, min).toISOString();
    if (D().viewings.some((v) => v.at === at) || new Date(at) < now()) {
      box.say(c.id, text(C.viewingTaken));
      return viewing(c, box);
    }
    const day = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const label = `${capital(relativeDay(day, now()))}, ${clockTime(h, min)}`;
    const p = catalogue.get(c.ctx.piece);
    const v = { id: `vw-${Date.now().toString(36)}`, clientId: c.id, at, label, pieceId: p?.id || null, note: '', reminded: false };
    D().viewings.push(v);
    c.stage = 'lead:viewing';
    c.ctx.viewing = v.id;
    box.say(c.id, text(C.viewingBooked(label, curator)));
    box.alert({ kind: 'viewing', clientId: c.id, title: `Video viewing booked: ${label}`,
      lines: [`${who(c)}${p ? ', to see ' + p.name : ''}. Call them on WhatsApp video.`] });
  }

  function trousseau(c, box) {
    c.stage = null;
    box.say(c.id, list(C.trousseauAsk, C.trousseauButton, [{ title: 'Pieces', rows: TROUSSEAU_SIZES.map((s) => ({ id: `trou:${s.id}`, title: s.title })) }]));
  }

  function trousseauSize(c, sizeId, box) {
    c.ctx.trousseau = TROUSSEAU_SIZES.find((s) => s.id === sizeId)?.title || sizeId;
    c.stage = 'lead:trousseau';
    box.say(c.id, text(C.trousseauWhen));
  }

  function startLead(c, kind, message, box) {
    c.stage = `lead:${kind}`;
    box.say(c.id, text(message));
  }

  function captureLead(c, t, box) {
    const kind = c.stage.slice(5);
    c.stage = null;
    if (kind === 'viewing') {
      const v = D().viewings.find((x) => x.id === c.ctx.viewing);
      if (v) v.note = t;
      box.alert({ kind: 'viewing', clientId: c.id, title: `Viewing note from ${who(c)}: ${t.slice(0, 100)}`, lines: [] });
      return box.say(c.id, text(C.viewingNoted(curator)));
    }
    if (kind === 'reminder') {
      const o = D().orders[c.ctx.reminderOrder];
      D().reminders ||= [];
      D().reminders.push({ id: `rm-${Date.now().toString(36)}`, at: now().toISOString(), clientId: c.id, name: who(c),
        when: t, recipient: o?.recipient || null, occasion: o?.occasion || null, pieceId: o?.pieceId || null });
      return box.say(c.id, text(C.remindSaved));
    }
    const detail = kind === 'trousseau' ? `${c.ctx.trousseau || ''}, occasion: ${t}` : t;
    addLead(c, kind, detail, box);
    box.say(c.id, text(C.leadThanks(kind, curator)));
  }

  function addLead(c, kind, detail, box, { quiet = false } = {}) {
    const lead = { id: `ld-${Date.now().toString(36)}-${D().leads.length}`, at: now().toISOString(), kind, clientId: c.id, name: who(c), detail, done: false };
    D().leads.unshift(lead);
    if (!quiet) {
      const label = { trousseau: 'Wedding & family gifting', bespoke: 'Bespoke request', international: 'Delivery abroad', photo: 'Photo from a client' }[kind] || 'Request';
      box.alert({ kind: 'lead', clientId: c.id, title: `${label}: ${lead.name}`, lines: [detail] });
    }
  }

  // ---------- orders, registration, preferences ----------

  function myOrders(c, box) {
    c.stage = null;
    const orders = c.orders.map((id) => D().orders[id]).filter((o) => o && o.status !== 'awaiting_payment' && o.status !== 'cancelled');
    if (!orders.length) return box.say(c.id, buttons(C.noOrders, [['col', 'The collection'], ['gf', 'Find a gift']]));
    if (orders.length === 1) return orderDetail(c, orders[0].id, box);
    box.say(c.id, list(C.ordersBody, C.ordersButton, [{
      title: 'Orders', rows: orders.slice(-10).reverse().map((o) => ({ id: `order:${o.id}`, title: `${o.id} · ${o.name}`.slice(0, 24), description: statusWord(o) })),
    }]));
  }

  function statusWord(o) {
    return {
      awaiting_transfer: 'Waiting for your bank transfer', paid: 'Being prepared', wrapped: 'Wrapped, leaving soon',
      dispatched: `On its way, expected ${shortDate(o.courier?.eta || isoDay(now()))}`, delivered: 'Delivered', attention: 'A curator is looking after this',
    }[o.status] || o.status;
  }

  function orderDetail(c, orderId, box) {
    const o = D().orders[orderId];
    if (!o || o.clientId !== c.id) return myOrders(c, box);
    const day = (s) => { const e = o.timeline.find((t) => t.status === s); return e ? shortDate(isoDay(new Date(e.at))) : null; };
    const lines = [];
    if (day('paid')) lines.push(`✓ Paid · ${day('paid')}`);
    if (day('wrapped')) lines.push(`✓ Wrapped · ${day('wrapped')}`);
    if (day('dispatched')) lines.push(`✓ Sent with ${o.courier.name} · ${day('dispatched')}`);
    if (day('delivered')) lines.push(`✓ Delivered · ${day('delivered')}`);
    if (o.status === 'awaiting_transfer') lines.push('○ Waiting for your bank transfer');
    if (o.status === 'paid') lines.push('○ Being pressed and wrapped by hand');
    if (o.status === 'wrapped') lines.push('○ Leaving our studio shortly');
    if (o.status === 'dispatched') lines.push(`○ Arriving ${longDate(o.courier.eta)}`);
    if (o.status === 'attention') lines.push(`○ ${curator} is looking after this personally`);
    const body = `*${o.id} · ${o.name}*\n\n${lines.join('\n')}`;
    if (o.status === 'dispatched') return box.say(c.id, cta(body, C.trackButton, o.courier.url));
    box.say(c.id, buttons(body, [[`inv:${o.id}`, C.invoiceButton], ['cur', 'Speak to a curator']]));
  }

  function sendInvoice(c, orderId, box) {
    const o = D().orders[orderId];
    if (!o || o.clientId !== c.id || !o.payment) return myOrders(c, box);
    box.say(c.id, doc({ kind: 'invoice', orderId: o.id }, `${brand}-${o.id}-invoice.pdf`, C.invoiceCaption(o.id)));
  }

  function register(c, code, box) {
    const o = Object.values(D().orders).find((x) => x.serial && x.serial === code);
    if (!o) { c.stage = 'register'; return box.say(c.id, text(C.registerUnknown)); }
    c.stage = null;
    const p = catalogue.pieces.find((x) => x.id === o.pieceId) || { name: o.name, edition_size: '?', technique: '', hours: '', artisan: '', origin: '' };
    if (o.registeredTo === c.id) return box.say(c.id, text(C.registerAgain(p)));
    o.registeredTo = c.id;
    if (!c.registered.includes(o.serial)) c.registered.push(o.serial);
    box.say(c.id, doc({ kind: 'certificate', orderId: o.id }, `${brand}-${p.designName || p.name}-certificate.pdf`, C.registered(p, o.editionNo)));
    if (c.optIn == null) box.say(c.id, buttons(C.optInAsk, [['opt:yes', 'Yes, please'], ['opt:no', 'No, thank you']]));
    box.alert({ kind: 'register', clientId: c.id, title: `${p.name} No. ${o.editionNo} registered by ${c.name || c.profileName || 'a new client'}`,
      lines: [o.clientId !== c.id ? 'This is the gift recipient: a new client.' : 'Registered by the buyer.'] });
  }

  function setOptIn(c, yes, box) {
    c.optIn = yes;
    box.say(c.id, text(yes ? C.optInYes : C.optInNo));
  }

  function optOut(c, box) {
    c.optIn = false;
    c.stage = null;
    box.say(c.id, text(C.optOut));
  }

  function fallback(c, box) {
    box.say(c.id, buttons(C.fallback, [['col', 'The collection'], ['gf', 'Find a gift'], ['cur', 'Speak to a curator']]));
  }

  // ---------- your actions in the Studio ----------

  function studioAction(action, args = {}) {
    const box = outbox();
    const o = args.orderId ? D().orders[args.orderId] : null;
    const p = o ? (catalogue.pieces.find((x) => x.id === o.pieceId) || { name: o.name, edition_size: '' }) : null;
    const proactive = (template) => ({ proactive: true, template });

    switch (action) {
      case 'transferReceived':
        if (o && o.status === 'awaiting_transfer') confirmPayment(o, 'bank transfer', box);
        break;
      case 'wrapped':
        if (o && o.status === 'paid') {
          stamp(o, 'wrapped');
          box.say(o.clientId, image({ kind: 'wrap', orderId: o.id }, C.wrapped(p, partOfDay(now())), proactive({ name: 'piece_wrapped', params: [p.name] })));
        }
        break;
      case 'dispatch':
        if (o && ['paid', 'wrapped'].includes(o.status)) {
          const name = COURIERS[args.courier] ? args.courier : 'Blue Dart';
          const eta = o.deliverOn || addDays(isoDay(now()), config.delivery.transitDays);
          o.courier = { name, awb: args.awb || '', eta, url: `${COURIERS[name]}?awb=${encodeURIComponent(args.awb || '')}` };
          stamp(o, 'dispatched');
          box.say(o.clientId, cta(C.dispatched(p, name, eta), C.trackButton, o.courier.url, {}, proactive({ name: 'order_dispatched', params: [p.name, name, longDate(eta)] })));
        }
        break;
      case 'delivered':
        if (o && o.status === 'dispatched') {
          stamp(o, 'delivered');
          const t = ist(now());
          const certificate = { kind: 'certificate', orderId: o.id };
          const caption = o.isGift
            ? C.deliveredGift(p, o.address?.name || 'the recipient', o.address?.city, clockTime(t.h, t.min))
            : C.deliveredSelf(p, o.editionNo);
          box.say(o.clientId, doc(certificate, `${brand}-${p.designName || p.name}-certificate.pdf`, caption, proactive({ name: o.isGift ? 'gift_delivered' : 'order_delivered', params: [p.name] })));
          // The end of the experience is what is remembered: care, and (for gifts) next year's occasion.
          box.say(o.clientId, buttons(C.afterDelivery(p),
            o.isGift ? [[`remind:${o.id}`, C.remindBtn], ['care', 'Care guide']] : [['care', 'Care guide'], ['col', 'The collection']], {}, { proactive: true }));
        }
        break;
      case 'cancel':
        if (o && ['awaiting_payment', 'awaiting_transfer', 'attention'].includes(o.status)) {
          stamp(o, 'cancelled');
          release(o.pieceId, o.clientId);
        }
        break;
      case 'curatorReply': {
        const c = store.client(args.clientId);
        const t = String(args.text || '').trim();
        if (!t) break;
        if (!c.thread) c.thread = { open: true, openedAt: now().toISOString(), acked: true, messages: [] };
        c.thread.open = true;
        c.thread.messages.push({ from: 'curator', text: t, at: now().toISOString() });
        box.say(c.id, text(C.curatorSignOff(t, curator), proactive({ name: 'curator_followup', params: [curator] })));
        break;
      }
      case 'closeThread': {
        const c = store.client(args.clientId);
        if (c.thread) c.thread.open = false;
        break;
      }
      case 'leadDone': {
        const lead = D().leads.find((l) => l.id === args.leadId);
        if (lead) lead.done = true;
        break;
      }
      default: break;
    }
    store.save();
    return box.items;
  }

  // ---------- every minute: holds expire, one gentle reminder, viewing reminders ----------

  function tick() {
    const box = outbox();
    for (const id of Object.keys(D().holds)) liveHolds(id);
    const t = now().getTime();
    for (const v of D().viewings) {
      const at = new Date(v.at).getTime();
      if (!v.reminded && at > t && at - t <= 60 * 60000) {
        v.reminded = true;
        const w = ist(new Date(v.at));
        box.say(v.clientId, text(C.viewingReminder(curator, clockTime(w.h, w.min)), { proactive: true, template: { name: 'viewing_reminder', params: [curator, clockTime(w.h, w.min)] } }));
      }
    }
    // One reminder, ten minutes before a set-aside piece goes back. Never a second one.
    for (const c of Object.values(D().clients)) {
      const d = c.ctx?.draft;
      if (!d || d.nudged || c.thread?.open) continue;
      const h = holdOf(d.pieceId, c.id);
      const p = catalogue.get(d.pieceId);
      if (!h || !p) continue;
      const left = (new Date(h.until) - t) / 60000;
      const sinceClient = (t - new Date(c.lastInboundAt)) / 60000;
      if (left <= 10 && left > 0 && sinceClient >= 10 && sinceClient < 24 * 60) {
        d.nudged = true;
        const until = ist(new Date(h.until));
        box.say(c.id, buttons(C.nudge(p, clockTime(until.h, until.min)), [['resume', C.continueBtn], [`release:${p.id}`, C.releaseBtn]]));
      }
    }
    store.save();
    return box.items;
  }

  return { handle, studioAction, tick, available, availabilityLine: (p) => availabilityLine(p, available(p)) };
}
