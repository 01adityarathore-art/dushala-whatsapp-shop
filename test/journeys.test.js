// Every client journey, run end to end against the real brain, with a fixed clock.
// Every message sent is also checked against WhatsApp's limits and the house style.  Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEngine } from '../src/engine.js';
import { createStore } from '../src/store.js';
import { loadCatalogue } from '../src/node.js';
import { check } from '../src/limits.js';
import { understand } from '../src/nlu.js';
import { createWhatsApp } from '../src/whatsapp.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const catalogue = loadCatalogue(path.join(ROOT, 'catalogue.csv'));

function setup({ start = '2026-10-24T06:00:00Z', flows = true } = {}) { // 11:30 am in India
  const clock = { t: new Date(start) };
  const store = createStore();
  const engine = createEngine({ store, catalogue, config, now: () => clock.t, canFlow: () => flows });
  const record = (items) => {
    for (const it of items) {
      if (it.to !== 'client') continue;
      const problems = check(it.msg);
      assert.deepEqual(problems, [], `${it.msg.type} breaks a WhatsApp limit: ${problems.join('; ')}\n${JSON.stringify(it.msg).slice(0, 400)}`);
      const words = [it.msg.body, it.msg.caption, ...(it.msg.cards || []).map((c) => c.body)].join(' ');
      assert.doesNotMatch(words, /!/, 'house style: no exclamation marks');
    }
    return items;
  };
  const as = (clientId, name) => ({
    say: (text, extra = {}) => record(engine.handle(clientId, { type: 'text', text, ...extra }, { name })),
    tap: (id) => record(engine.handle(clientId, { type: 'reply', id }, { name })),
    form: (formName, values) => record(engine.handle(clientId, { type: 'form', name: formName, values }, { name })),
    address: (address) => record(engine.handle(clientId, { type: 'address', address }, { name })),
    pay: (ref, status = 'captured') => record(engine.handle(clientId, { type: 'payment', ref, status, method: 'UPI' }, { name })),
    cart: (items) => record(engine.handle(clientId, { type: 'cart', items }, { name })),
  });
  const studio = (action, args) => record(engine.studioAction(action, args));
  const advance = (minutes) => { clock.t = new Date(clock.t.getTime() + minutes * 60000); return record(engine.tick()); };
  return { store, engine, as, studio, advance, clock };
}

const msgs = (items) => items.filter((i) => i.to === 'client').map((i) => i.msg);
const alerts = (items) => items.filter((i) => i.to === 'owner').map((i) => i.alert);
const texts = (items) => msgs(items).map((m) => [m.body, m.caption, ...(m.cards || []).map((c) => c.body)].filter(Boolean).join('\n')).join('\n---\n');
const ids = (m) => (m.buttons || []).map((b) => b.id)
  .concat((m.sections || []).flatMap((s) => s.rows.map((r) => r.id)))
  .concat((m.cards || []).flatMap((c) => c.buttons.map((b) => b.id)));
const cardIds = (m) => m.cards.map((c) => c.buttons[0].id);
const GIFT_ADDRESS = { name: 'Sunita Sharma', phone: '9829000000', pin: '302006', house: '14', area: 'Civil Lines', city: 'Jaipur', state: 'Rajasthan' };
const HOME_ADDRESS = { name: 'Meera Kapoor', phone: '9810000000', pin: '110024', house: 'C-41', area: 'Defence Colony', city: 'New Delhi', state: 'Delhi' };
const GIFT_FORM = { for_whom: 'gift', presentation: 'box', card_choice: 's1', card_text: '', delivery: 'asap', date: '' };

test('the catalogue loads, with colour versions grouped by design', () => {
  assert.equal(catalogue.warnings.length, 0, JSON.stringify(catalogue.warnings));
  assert.equal(catalogue.all().length, 15);
  const mehr = catalogue.get('mehr');
  assert.equal(mehr.name, 'Mehr in Dove grey');
  assert.equal(mehr.designName, 'Mehr');
  assert.deepEqual(catalogue.versions(mehr).map((p) => p.version), ['Dove grey', 'Camel', 'Ink blue']);
  assert.equal(catalogue.get('noor').name, 'Noor', 'single-colour pieces keep their plain name');
});

test('a new client is welcomed by name, and the welcome is itself a swipe of the lookbook', () => {
  const { as } = setup();
  const [m] = msgs(as('c1', 'Meera ✨ Kapoor').say('Hi'));
  assert.equal(m.type, 'carousel');
  assert.match(m.body, /Good morning, Meera\. Welcome to \*Dushala\*/);
  assert.deepEqual(cardIds(m), ['col:heirloom', 'col:winter', 'col:trousseau', 'col:him', 'gf', 'conc']);
});

test('a returning client sees where they left off as the first card', () => {
  const { as, clock } = setup();
  const c = as('c1', 'Meera');
  c.say('Hi');
  c.tap('save:noor');
  clock.t = new Date(clock.t.getTime() + 86400000);
  const [m] = msgs(c.say('Hi'));
  assert.equal(cardIds(m)[0], 'sl');
  assert.match(m.cards[0].body, /One piece waiting for you/);
});

test('saying hi again mid-conversation does not repeat the grand welcome', () => {
  const { as } = setup();
  const c = as('c1', 'Meera');
  c.say('Hi');
  const [m] = msgs(c.say('hello'));
  assert.equal(m.body, 'Of course. How may I help?');
});

test('the collection is a swipe of pictures: collections, then one card per design', () => {
  const { as } = setup();
  const c = as('c1', 'Meera');
  const [cols] = msgs(c.tap('col'));
  assert.equal(cols.type, 'carousel');
  assert.deepEqual(cardIds(cols), ['col:heirloom', 'col:winter', 'col:trousseau', 'col:him']);
  const [winter] = msgs(c.tap('col:winter'));
  assert.equal(winter.type, 'carousel');
  assert.equal(winter.cards.length, 3, 'Mehr, Sahar and Kahwa: three designs, not seven colour cards');
  assert.match(winter.cards.map((x) => x.body).join(' '), /In three colours/);
  assert.deepEqual(winter.cards[0].buttons.map((b) => b.title), ['See closely', 'Save to shortlist']);
  const [heirloom] = msgs(c.tap('col:heirloom'));
  assert.equal(heirloom.cards[0].buttons[0].id, 'piece:zarina', 'the dearest piece leads');
  assert.deepEqual(heirloom.cards.at(-1).buttons.map((b) => b.title), ['See closely', 'Notify me'], 'sold out sits last');
});

test('"See closely" shows every angle and every other colour in one swipe', () => {
  const { as } = setup();
  const [m] = msgs(as('c1', 'Meera').tap('piece:mehr'));
  assert.equal(m.type, 'carousel');
  assert.deepEqual(m.cards.map((x) => x.media.view + ':' + x.media.id), ['hero:mehr', 'detail:mehr', 'flat:mehr', 'hero:mehr-camel', 'hero:mehr-ink']);
  assert.match(m.body, /\*Mehr in Dove grey\*/);
  assert.match(m.body, /₹12,500/);
  assert.match(m.body, /Ayesha's note/);
  assert.deepEqual(m.cards[3].buttons.map((b) => b.id), ['res:mehr-camel', 'piece:mehr-camel']);
  const [noor] = msgs(as('c2', 'X').tap('piece:noor'));
  assert.equal(noor.cards.length, 3);
  assert.match(noor.body, /GI tag and lab certificate/);
});

test('the shortlist: save, view, and it greets you when you come back', () => {
  const { as, clock } = setup();
  const c = as('c1', 'Meera');
  c.say('Hi');
  const [saved] = msgs(c.tap('save:noor'));
  assert.match(saved.body, /Saved\. Your shortlist: \*Noor\*/);
  c.tap('save:gulnar');
  const [list] = msgs(c.tap('sl'));
  assert.equal(list.type, 'carousel');
  assert.deepEqual(cardIds(list), ['res:noor', 'res:gulnar']);
  clock.t = new Date(clock.t.getTime() + 2 * 86400000);
  const [back] = msgs(c.say('Hi'));
  assert.match(back.body, /Your shortlist has two pieces waiting/);
  assert.ok(ids(back).includes('sl'));
});

test('the full gift journey: finder form, three picks, one-page details, address, pay, wrap, ship, deliver, remind', () => {
  const { as, studio, store } = setup();
  const c = as('c1', 'Meera');
  const [finder] = msgs(c.tap('gf'));
  assert.equal(finder.type, 'flow');
  assert.equal(finder.flow.name, 'gift_finder');
  const [picks] = msgs(c.form('gift_finder', { recipient: ['mother'], occasion: ['anniversary'], budget: ['b3'] }));
  assert.equal(picks.type, 'carousel');
  assert.match(picks.body, /For your mother, for an anniversary/);
  assert.match(picks.cards[0].body, /Ayesha's pick/);
  const designs = picks.cards.map((x) => catalogue.get(x.buttons[0].id.split(':')[1]).design);
  assert.equal(new Set(designs).size, designs.length, 'three different designs');

  c.tap('piece:noor');
  const [options] = msgs(c.tap('res:noor'));
  assert.equal(options.type, 'flow');
  assert.match(options.body, /\*Noor\* is set aside for you for the next thirty minutes/);
  assert.equal(options.flow.data.for_whom, 'gift', 'known from the finder');
  const suggestion = options.flow.data.card_options.find((o) => o.id === 's1');
  assert.match(suggestion.description, /Happy anniversary/);

  const [addr] = msgs(c.form('order_options', GIFT_FORM));
  assert.equal(addr.type, 'address');
  assert.match(addr.body, /exchange it quietly/);
  const [order] = msgs(c.address(GIFT_ADDRESS));
  assert.equal(order.type, 'order');
  assert.equal(order.order.total, 48000);
  const ref = order.order.ref;
  const o = store.data.orders[ref];
  assert.match(o.card, /Happy anniversary/);
  const paid = c.pay(ref);
  assert.match(texts(paid), /Your order \*DU-1041\* is confirmed/);
  assert.match(texts(paid), /No\. 9 of 12/);
  assert.match(alerts(paid)[0].lines.join(' '), /gift, price hidden/);

  assert.equal(msgs(studio('wrapped', { orderId: ref }))[0].type, 'image');
  assert.equal(msgs(studio('dispatch', { orderId: ref, courier: 'Delhivery', awb: '123' }))[0].type, 'cta');
  const delivered = msgs(studio('delivered', { orderId: ref }));
  assert.match(delivered[0].caption, /delivered to Sunita Sharma in Jaipur/);
  assert.deepEqual(ids(delivered[1]), [`remind:${ref}`, 'care']);
  assert.match(texts(c.tap(`remind:${ref}`)), /When is the occasion each year/);
  assert.match(texts(c.say('12 March')), /write to you once, two weeks before/);
  assert.equal(store.data.reminders[0].when, '12 March');
});

test('buying for yourself on the one-page form: chest, a chosen day, no card, address saved', () => {
  const { as, store } = setup();
  const c = as('c1', 'Meera');
  c.tap('res:mehr-camel');
  const [addr] = msgs(c.form('order_options', { for_whom: 'me', presentation: 'chest', card_choice: 's2', card_text: '', delivery: 'date', date: '2026-11-12' }));
  assert.equal(addr.type, 'address');
  const [order] = msgs(c.address(HOME_ADDRESS));
  assert.equal(order.order.total, 12500 + config.prices.walnutChest);
  const o = store.data.orders[order.order.ref];
  assert.equal(o.card, null, 'no card on a piece for yourself');
  assert.equal(o.deliverOn, '2026-11-12');
  assert.equal(o.name, 'Mehr in Camel');
  c.pay(order.order.ref);
  c.tap('res:sahar');
  const [again] = msgs(c.form('order_options', { for_whom: 'me', presentation: 'box', delivery: 'asap' }));
  assert.equal(again.saved.length, 1, 'saved address offered');
});

test('without WhatsApp Flows switched on, the same purchase works as a conversation', () => {
  const { as, store } = setup({ flows: false });
  const c = as('c1', 'Meera');
  const [who] = msgs(c.tap('gf'));
  assert.equal(who.type, 'list');
  c.tap('gf:r:mother'); c.tap('gf:o:anniversary');
  const [picks] = msgs(c.tap('gf:b:b3'));
  assert.equal(picks.type, 'carousel');
  const reserved = msgs(c.tap('res:noor'));
  assert.deepEqual(ids(reserved[1]), ['pres:box', 'pres:chest']);
  c.tap('pres:box');
  c.say('Happy anniversary, Maa.\nWith all my love, Meera');
  const [dates] = msgs(c.tap('card:ok'));
  assert.equal(ids(dates)[0], 'date:asap');
  const [addr] = msgs(c.tap(ids(dates)[2]));
  assert.equal(addr.type, 'address');
  const [order] = msgs(c.address(GIFT_ADDRESS));
  assert.equal(store.data.orders[order.order.ref].card, 'Happy anniversary, Maa.\nWith all my love, Meera');
});

test('sending the address twice updates the order instead of making a second one', () => {
  const { as, store } = setup();
  const c = as('c1', 'Meera');
  c.tap('res:mehr');
  c.form('order_options', { for_whom: 'me', presentation: 'box', delivery: 'asap' });
  c.address(HOME_ADDRESS);
  c.address({ ...HOME_ADDRESS, house: 'C-42' });
  assert.equal(Object.keys(store.data.orders).length, 1);
  assert.equal(Object.values(store.data.orders)[0].address.house, 'C-42');
});

test('a failed payment keeps the piece; bank transfer works and you confirm it', () => {
  const { as, studio, store } = setup();
  const c = as('c1', 'Meera');
  c.tap('res:noor');
  c.form('order_options', { for_whom: 'me', presentation: 'box', delivery: 'asap' });
  const [order] = msgs(c.address(HOME_ADDRESS));
  const ref = order.order.ref;
  const [failed] = msgs(c.pay(ref, 'failed'));
  assert.match(failed.body, /nothing has been charged/);
  assert.equal(msgs(c.tap('pay:retry'))[0].type, 'order');
  assert.match(texts(c.tap('pay:bank')), /Reference: DU-1041/);
  assert.equal(store.data.orders[ref].status, 'awaiting_transfer');
  assert.match(texts(studio('transferReceived', { orderId: ref })), /is confirmed/);
  assert.equal(store.data.orders[ref].status, 'paid');
});

test('one gentle reminder before a set-aside piece goes back, with a way to release it', () => {
  const { as, advance, store } = setup();
  const c = as('c1', 'Meera');
  c.tap('res:noor');
  assert.equal(msgs(advance(15)).length, 0, 'no reminder while there is plenty of time');
  const [nudge] = msgs(advance(6));
  assert.match(nudge.body, /\*Noor\* is still set aside for you, until 12:00 pm/);
  assert.deepEqual(ids(nudge), ['resume', 'release:noor']);
  assert.equal(msgs(advance(2)).length, 0, 'never a second reminder');
  const [released] = msgs(c.tap('release:noor'));
  assert.match(released.body, /back in the collection, and on your shortlist/);
  assert.equal(store.data.holds.noor.length, 0);
  assert.ok(store.data.clients.c1.shortlist.includes('noor'));
});

test('coming back to an unfinished gift: the welcome offers to continue where you left off', () => {
  const { as, clock } = setup();
  const c = as('c1', 'Meera');
  c.tap('gf');
  c.form('gift_finder', { recipient: ['mother'], occasion: ['birthday'], budget: ['b5'] });
  c.tap('res:noor');
  clock.t = new Date(clock.t.getTime() + 8 * 3600000);
  const [back] = msgs(c.say('Hi'));
  assert.match(back.body, /You were choosing Noor for your mother/);
  assert.ok(ids(back).includes('resume'));
  const [again] = msgs(c.tap('resume'));
  assert.equal(again.type, 'flow', 'picks up at the details page, piece set aside again');
});

test('a piece held by one client cannot be taken by another; it frees up after 30 minutes', () => {
  const { as, advance } = setup();
  as('a', 'Asha').tap('res:zarina');
  as('b', 'Bina').tap('res:zarina'); // the second of two left
  const [third] = msgs(as('c', 'Chitra').tap('res:zarina'));
  assert.match(third.body, /has found its home/);
  advance(31);
  const [later] = msgs(as('c', 'Chitra').tap('res:zarina'));
  assert.equal(later.type, 'flow');
});

test('sold out: a graceful note, a similar piece, and a waitlist', () => {
  const { as, store } = setup();
  const c = as('c1', 'Meera');
  const [m] = msgs(c.tap('piece:shahi'));
  assert.match(m.body, /\*Shahi\* has found its home\. All nine are spoken for/);
  c.tap('notify:shahi');
  assert.deepEqual(store.data.waitlist.shahi, ['c1']);
});

test('the gift recipient scans the QR in the box and becomes a client', () => {
  const { as, store } = setup();
  const c = as('buyer', 'Meera');
  c.tap('res:noor');
  c.form('order_options', GIFT_FORM);
  const [order] = msgs(c.address(GIFT_ADDRESS));
  c.pay(order.order.ref);
  const serial = store.data.orders[order.order.ref].serial;
  const r = as('recipient', 'Sunita').say(`Register my piece ${serial}`);
  const [cert, optin] = msgs(r);
  assert.equal(cert.doc.kind, 'certificate');
  assert.match(cert.caption, /registered to you/);
  assert.deepEqual(ids(optin), ['opt:yes', 'opt:no']);
  assert.match(alerts(r)[0].lines[0], /gift recipient: a new client/);
});

test('speak to a curator: the bot steps aside, you reply, then hand back', () => {
  const { as, studio } = setup();
  const c = as('c1', 'Meera');
  assert.match(texts(c.tap('cur')), /Ayesha, our curator, will write to you personally within the hour/);
  assert.match(texts(c.say('Something for a mehendi')), /passed this to Ayesha/);
  assert.equal(msgs(c.say('In green, ideally')).length, 0, 'acknowledged once, then quiet');
  assert.match(texts(studio('curatorReply', { clientId: 'c1', text: 'Mohtarma would be lovely.' })), /— Ayesha$/);
  studio('closeThread', { clientId: 'c1' });
  assert.equal(msgs(c.say('Hi'))[0].type, 'buttons');
});

test('after hours, the curator promise changes to tomorrow morning', () => {
  const { as } = setup({ start: '2026-10-24T16:30:00Z' }); // 10 pm in India
  assert.match(texts(as('c1', 'Meera').tap('cur')), /at 10 tomorrow morning/);
});

test('a private viewing is booked, noted, and reminded an hour before', () => {
  const { as, advance, store } = setup();
  const c = as('c1', 'Meera');
  c.tap('piece:noor');
  const [slots] = msgs(c.tap('view'));
  assert.match(slots.body, /We'll have \*Noor\* ready/);
  const first = ids(slots)[0];
  assert.match(texts(c.tap(first)), /Confirmed: \*Today, 3:00 pm\*/);
  c.say('Also the emerald one please');
  assert.equal(store.data.viewings[0].note, 'Also the emerald one please');
  assert.match(texts(advance(150)), /your private viewing with Ayesha is at 3:00 pm today/);
});

test('wedding gifting, bespoke and delivery abroad become requests for you', () => {
  const { as, store } = setup();
  const c = as('c1', 'Meera');
  c.say('I need 30 shawls for my daughter’s wedding');
  c.tap('trou:s3');
  c.say('February, in Udaipur');
  c.say('Can you add my initials?');
  c.say('MK in gold, please');
  c.say('Do you ship to Dubai?');
  c.say('Dubai Marina, for my sister');
  assert.deepEqual(store.data.leads.map((l) => l.kind).sort(), ['bespoke', 'international', 'trousseau']);
});

test('free text finds the right pieces, shown as pictures', () => {
  const { as } = setup();
  const [red] = msgs(as('c1', 'Meera').say('do you have something in red for my mom under 70k'));
  assert.equal(red.type, 'carousel');
  assert.match(red.body, /\*Gulnar\*/, 'only one red piece fits, so it opens straight on it');
  const [green] = msgs(as('c2', 'X').say('Show me green shawls'));
  assert.deepEqual(green.cards.map((x) => x.buttons[0].id).sort(), ['piece:mohtarma', 'piece:sahar-sage', 'piece:taarik-forest']);
  const [men] = msgs(as('c3', 'X').say('gift for my father'));
  const designs = men.cards.map((x) => catalogue.get(x.buttons[0].id.split(':')[1]).design);
  assert.equal(new Set(designs).size, designs.length, 'one card per design');
  const [camel] = msgs(as('c4', 'X').say('Tell me about Mehr in camel'));
  assert.match(camel.body, /\*Mehr in Camel\*/);
});

test('common questions get calm, correct answers', () => {
  const { as } = setup();
  const c = as('c1', 'Meera');
  c.say('Hi');
  assert.match(texts(c.say('any discount?')), /never placed on sale/);
  assert.match(texts(c.say('Can I pay cash on delivery?')), /don't offer cash on delivery/);
  assert.match(texts(c.say('Is it real pashmina?')), /GI certificate/);
  assert.match(texts(c.say('how do I wash it')), /Dry-clean only/);
  assert.match(texts(c.say('I want to return it')), /collect it from your door/);
  assert.match(texts(c.say('how much?')), /range from ₹9,800 to ₹1,65,000/);
  c.tap('piece:noor');
  assert.match(texts(c.say('how much is it')), /\*Noor\* is ₹48,000/);
  assert.match(texts(c.say('thanks')), /It's our pleasure/);
  assert.match(texts(c.say('asdfgh')), /Forgive me/);
  assert.equal(msgs(c.say('show me the full catalogue'))[0].type, 'catalog');
  assert.match(texts(c.say('STOP')), /won't receive any news/);
});

test('the WhatsApp catalogue: a product message opens that piece; a cart sets aside the first piece', () => {
  const { as, store } = setup();
  const [m] = msgs(as('c1', 'Meera').say("I'd like to see Sahar in Sage", { referral: { pieceId: 'sahar-sage' } }));
  assert.equal(m.type, 'carousel');
  assert.match(m.body, /Welcome to \*Dushala\*/);
  assert.match(m.body, /\*Sahar in Sage\*/);
  const cart = msgs(as('c2', 'Bina').cart(['kahwa', 'chinar']));
  assert.match(cart[0].body, /starting with \*Kahwa\*/);
  assert.equal(cart[1].type, 'flow');
  assert.ok(store.data.clients.c2.shortlist.includes('chinar'));
});

test('my orders shows status and tracking', () => {
  const { as, studio } = setup();
  const c = as('c1', 'Meera');
  assert.match(texts(c.say('where is my order')), /don't have any orders/);
  c.tap('res:kahwa');
  c.form('order_options', { for_whom: 'me', presentation: 'box', delivery: 'asap' });
  const [order] = msgs(c.address(HOME_ADDRESS));
  c.pay(order.order.ref);
  assert.match(texts(c.say('where is my order')), /○ Being pressed and wrapped by hand/);
  studio('dispatch', { orderId: order.order.ref, courier: 'Blue Dart', awb: '9' });
  assert.equal(msgs(c.say('track my order'))[0].type, 'cta');
});

test('old buttons tapped later still behave', () => {
  const { as } = setup();
  const c = as('c1', 'Meera');
  assert.equal(msgs(c.tap('pres:box'))[0].type, 'carousel', 'no reservation in progress: back to the collection');
  assert.match(texts(c.tap('pay:retry')), /nothing waiting for payment/);
  assert.equal(msgs(c.tap('more:noor'))[0].type, 'carousel');
  assert.match(texts(c.tap('nonsense:1')), /Forgive me/);
  assert.equal(msgs(c.form('order_options', GIFT_FORM))[0].type, 'carousel', 'a stale form with nothing set aside');
});

test('a GI name without a certificate hides the piece', () => {
  const tmp = path.join(ROOT, 'test', '.tmp-cat.csv');
  const csv = fs.readFileSync(path.join(ROOT, 'catalogue.csv'), 'utf8').replace('GI tag and lab certificate PTQCC-SAMPLE-0412', '');
  fs.writeFileSync(tmp, csv);
  try {
    const cat = loadCatalogue(tmp);
    assert.equal(cat.get('noor'), null);
    assert.match(cat.warnings[0].problems[0], /protected craft name/);
  } finally { fs.unlinkSync(tmp); }
});

test('Hinglish and everyday phrasing are understood', () => {
  assert.equal(understand('maa ke liye kuch dikhao').recipient, 'mother');
  assert.equal(understand('kitne ka hai').intent, 'price');
  assert.equal(understand('shaadi ke liye').occasion, 'wedding');
  assert.equal(understand('budget 1.5 lakh').budget, 150000);
  assert.equal(understand('2 pieces').budget, null);
  assert.equal(understand('show me my shortlist').intent, 'shortlist');
});

test('the WhatsApp connector builds valid payloads and reads webhooks', () => {
  const wa = createWhatsApp({
    env: { RAZORPAY_CONFIG_NAME: 'dushala-rzp', FLOW_ORDER_OPTIONS_ID: '111', FLOW_GIFT_FINDER_ID: '222' },
    resolveMedia: () => ({ url: 'https://example.com/a.jpg', photo: true }),
    resolveDoc: () => ({ pdfUrl: 'https://example.com/a.pdf' }),
  });
  const { as } = setup();
  const c = as('c1', 'Meera');
  const all = [...msgs(c.say('Hi')), ...msgs(c.tap('col')), ...msgs(c.tap('piece:mehr')), ...msgs(c.tap('gf')), ...msgs(c.tap('res:noor')), ...msgs(c.say('catalogue'))];
  for (const m of all) assert.ok(wa.toPayload('919810000000', m).payload, m.type);
  const car = wa.toPayload('919810000000', all.find((m) => m.type === 'carousel')).payload.interactive;
  assert.equal(car.type, 'carousel');
  assert.equal(car.action.cards[0].action.buttons[0].type, 'quick_reply');
  const flow = wa.toPayload('919810000000', all.find((m) => m.type === 'flow' && m.flow.name === 'order_options')).payload.interactive;
  assert.equal(flow.action.parameters.flow_id, '111');
  assert.equal(flow.action.parameters.flow_action_payload.screen, 'OPTIONS');
  c.form('order_options', { for_whom: 'me', presentation: 'chest', delivery: 'asap' });
  const order = msgs(c.address(HOME_ADDRESS))[0];
  const p = wa.toPayload('919810000000', order).payload.interactive.action.parameters;
  assert.equal(p.total_amount.value, (48000 + 6500) * 100);
  assert.equal(p.order.subtotal.value, p.total_amount.value);

  const hook = {
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: '919810000000', profile: { name: 'Meera' } }],
      messages: [
        { from: '919810000000', id: 'w1', type: 'text', text: { body: 'Hi' }, context: { referred_product: { catalog_id: '1', product_retailer_id: 'mehr-ink' } } },
        { from: '919810000000', id: 'w2', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'save:noor', title: 'Save to shortlist' } } },
        { from: '919810000000', id: 'w3', type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { name: 'flow', response_json: JSON.stringify({ flow_token: 'order_options:919810000000:noor', for_whom: 'gift', presentation: 'box' }) } } },
        { from: '919810000000', id: 'w4', type: 'interactive', interactive: { type: 'nfm_reply', nfm_reply: { name: 'address_message', response_json: JSON.stringify({ values: { name: 'M', in_pin_code: '110024', city: 'New Delhi', state: 'Delhi', house_number: 'C-41' } }) } } },
        { from: '919810000000', id: 'w5', type: 'order', order: { product_items: [{ product_retailer_id: 'kahwa', quantity: 1 }] } },
      ],
      statuses: [{ type: 'payment', status: 'captured', recipient_id: '919810000000', payment: { reference_id: 'DU-1041', transaction: { status: 'success', method: { type: 'upi' } } } }],
    } }] }],
  };
  const { inbound, payments } = wa.parseWebhook(hook);
  assert.deepEqual(inbound.map((i) => i.event.type), ['text', 'reply', 'form', 'address', 'cart']);
  assert.equal(inbound[0].event.referral.pieceId, 'mehr-ink');
  assert.equal(inbound[2].event.name, 'order_options');
  assert.equal(inbound[3].event.address.pin, '110024');
  assert.deepEqual(inbound[4].event.items, ['kahwa']);
  assert.equal(payments[0].status, 'captured');
});

test('the shared layer behind both screens: transcript, clear chat, Studio view', async () => {
  const { createApp } = await import('../src/app-core.js');
  const store = createStore();
  const engine = createEngine({ store, catalogue, config, canFlow: () => true });
  const events = [];
  const media = (ref) => ({ rel: `photos/${ref.id || ref.kind}.jpg`, url: '', photo: true });
  const docs = (ref) => ({ rel: `#doc/${ref.kind}/${ref.orderId}`, url: '', pdfUrl: '' });
  const wa = createWhatsApp({ env: {}, resolveMedia: media, resolveDoc: docs });
  const app = createApp({ store, catalogue, config, engine, wa, media, docs, broadcast: (e) => events.push(e), pace: false, log: () => {} });
  app.api('POST', '/api/sim/inbound', {}, { clientId: 'sim-meera', profileName: 'Meera Kapoor', event: { type: 'text', text: 'Hi' } });
  await app.idle();
  const history = app.api('GET', '/api/sim/history', { client: 'sim-meera' }).body;
  assert.deepEqual(history.map((e) => e.dir), ['in', 'out']);
  assert.equal(history[1].msg.type, 'carousel');
  assert.ok(history[1].msg.cards[0].mediaUrl.startsWith('photos/'));
  assert.ok(events.some((e) => e.kind === 'typing') && events.some((e) => e.kind === 'msg'));
  app.api('POST', '/api/sim/scenario', {}, { name: 'clearChat', clientId: 'sim-meera' });
  assert.equal(app.api('GET', '/api/sim/history', { client: 'sim-meera' }).body.length, 0);
  assert.ok(store.data.clients['sim-meera'], 'clearing the chat keeps the client');
  const state = app.api('GET', '/api/studio/state').body;
  assert.equal(state.catalogue.length, 15);
  assert.equal(state.wire[0].problems.length, 0);
  assert.equal(app.api('POST', '/api/sim/inbound', {}, { clientId: '919810000000', event: { type: 'text', text: 'x' } }).status, 400, 'the test phone cannot pose as a real number');
});
