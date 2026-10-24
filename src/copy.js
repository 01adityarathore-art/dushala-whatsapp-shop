// Every word a client reads lives in this file, so the voice stays the same everywhere.
//
// House style
//   - Quiet and warm, like a private client desk. No emoji, no exclamation marks, no capitals for shouting.
//   - "piece", never "product". "client", never "customer". "set aside", never "added to cart".
//   - The first name at most once per reply. Never "Dear customer".
//   - Short paragraphs. Bold (*...*) only for a piece's name or a price. Italics (_..._) for craft notes.
//   - Never pushy: no countdowns, no "hurry", no discounts.

import { rupees, word, capital, longDate, clockTime } from './format.js';

export const COLLECTIONS = [
  { id: 'heirloom', name: 'Heirloom', line: 'Museum-grade hand work, numbered',
    intro: 'Each Heirloom piece takes between three hundred and nine hundred hours by hand. We make no more than twelve of any design, and number every one.' },
  { id: 'winter', name: 'The Winter Edit', line: 'Light, warm, effortless',
    intro: 'For the everyday rituals of winter: early walks, late dinners, long drives. Light enough to forget, warm enough to remember.' },
  { id: 'trousseau', name: 'The Wedding Trousseau', line: 'Pieces to be given, and kept',
    intro: 'Made to be given at one wedding and kept for the next. Zari, tilla and the deep colours of celebration.' },
  { id: 'him', name: 'For Him', line: 'Quiet colours, generous drape',
    intro: 'Generous in size, quiet in colour. Made to be worn over a bandhgala, a sherwani or a winter coat.' },
];

export const RECIPIENTS = [
  { id: 'mother', title: 'My mother', phrase: 'your mother' },
  { id: 'wife', title: 'My wife', phrase: 'your wife' },
  { id: 'husband', title: 'My husband', phrase: 'your husband' },
  { id: 'father', title: 'My father', phrase: 'your father' },
  { id: 'daughter', title: 'My daughter', phrase: 'your daughter' },
  { id: 'sister', title: 'My sister', phrase: 'your sister' },
  { id: 'friend', title: 'A friend', phrase: 'a friend' },
  { id: 'colleague', title: 'A colleague', phrase: 'a colleague' },
  { id: 'special', title: 'Someone special', phrase: 'someone special' },
];

export const OCCASIONS = [
  { id: 'wedding', title: 'A wedding', phrase: 'for a wedding' },
  { id: 'anniversary', title: 'An anniversary', phrase: 'for an anniversary' },
  { id: 'birthday', title: 'A birthday', phrase: 'for a birthday' },
  { id: 'festive', title: 'Diwali or a festival', phrase: 'for the festive season' },
  { id: 'thanks', title: 'A thank-you', phrase: 'as a thank-you' },
  { id: 'just', title: 'Just because', phrase: null },
];

export const BUDGETS = [
  { id: 'b1', title: 'Up to ₹15,000', min: 0, max: 15000 },
  { id: 'b2', title: '₹15,000 to ₹50,000', min: 15000, max: 50000 },
  { id: 'b3', title: '₹50,000 to ₹1,00,000', min: 50000, max: 100000 },
  { id: 'b4', title: 'Above ₹1,00,000', min: 100000, max: Infinity },
  { id: 'b5', title: 'No limit', description: 'Show me the finest', min: 0, max: Infinity, finest: true },
];

export const TROUSSEAU_SIZES = [
  { id: 's1', title: '5 to 10 pieces' },
  { id: 's2', title: '10 to 25 pieces' },
  { id: 's3', title: '25 to 50 pieces' },
  { id: 's4', title: 'More than 50' },
];

export const COURIERS = {
  'Blue Dart': 'https://www.bluedart.com/tracking',
  'Delhivery': 'https://www.delhivery.com/tracking',
  'DTDC': 'https://www.dtdc.in/tracking.asp',
};

// Card messages people can pick instead of facing a blank card (most people freeze at a blank card).
export function cardSuggestions(recipient, occasion) {
  const byOccasion = {
    anniversary: 'Happy anniversary. Here is to many more winters together, with all my love.',
    birthday: 'Happy birthday. Something to keep you warm, and to remind you of me.',
    wedding: 'With love, and every blessing for the years ahead.',
    festive: 'Wishing you a season full of light and warmth.',
    thanks: 'With heartfelt thanks, for everything.',
    just: 'Just because you deserve something beautiful.',
  };
  const byRecipient = {
    mother: 'For the warmest person I know. With all my love.',
    father: 'For the man who taught me everything. With love.',
    wife: 'For you, always. With all my love.',
    husband: 'For you, always. With all my love.',
    daughter: 'For my girl, to keep and one day pass on. With love.',
    sister: 'For my favourite person to argue with. With love.',
    friend: 'For a friend who feels like family.',
    colleague: 'With warm regards and thanks.',
    special: 'Thinking of you, always.',
  };
  return [
    { id: 's1', title: 'For the occasion', description: byOccasion[occasion] || byOccasion.just },
    { id: 's2', title: 'Warm and personal', description: byRecipient[recipient] || byRecipient.special },
    { id: 's3', title: 'Short and simple', description: 'With love.' },
  ];
}

// The first line of a story, short enough for a carousel card.
export function shortStory(p, max = 80) {
  const s = p.story || '';
  if (s.length <= max) return s;
  return s.slice(0, s.lastIndexOf(' ', max - 1)) + '…';
}

// ---------- availability ----------

export function availabilityLine(p, available) {
  if (available <= 0) return `All ${word(p.edition_size)} have found homes.`;
  if (p.edition_size <= 15) {
    if (available === 1) return `The last of ${word(p.edition_size)}.`;
    return `${capital(word(available))} of ${word(p.edition_size)} remain.`;
  }
  if (available <= 5) return `Only ${word(available)} remain.`;
  return `Made in an edition of ${word(p.edition_size)}.`;
}

function madeBy(p) {
  return `by ${p.artisan} in ${p.origin}`;
}

// ---------- the copy ----------

export const copy = {
  welcomeNew: ({ greet, name, brand }) =>
    `${greet}${name ? ', ' + name : ''}. Welcome to *${brand}*.\n\n` +
    'We make heirloom shawls by hand, in small numbered editions. Some take a whole season on the loom.\n\n' +
    'Swipe to explore.\n_A curator reads every conversation._',
  welcomeBack: ({ greet, name, status }) =>
    `${greet}${name ? ', ' + name : ''}. How lovely to hear from you again.` +
    (status ? `\n\n_${status}_` : '') +
    '\n\nSwipe to explore.',
  welcomeGiftCard: '*Find a gift*\nThree quick choices, three pieces chosen for them',
  welcomeConciergeCard: '*Concierge*\nA curator, a video viewing, wedding gifting',
  welcomeShortlistCard: (n) => `*Your shortlist*\n${capital(word(n))} piece${n === 1 ? '' : 's'} waiting for you`,
  welcomeContinueCard: (p, recipient) => `*Where you left off*\n${p.name}${recipient ? ', for ' + recipient : ''}`,
  welcomeOrderCard: (o) => `*Your order*\n${o.name}, ${o.status === 'dispatched' ? 'on its way' : 'being prepared'}`,
  welcomeFooter: 'A curator reads every conversation',
  welcomeAgain: 'Of course. How may I help?',

  welcomeToPiece: ({ greet, name, brand, p }) =>
    `${greet}${name ? ', ' + name : ''}. Welcome to *${brand}*.\n\nThis is *${p.name}*.\n_${p.story}._`,

  collectionsHeader: 'The Collection',
  collectionsBody: 'This winter there are four collections. Every piece is made in a small, numbered edition.',
  collectionsButton: 'View collections',
  collectionFrom: (col, from) => `${col.line} · from ${rupees(from)}`,
  giftRowTitle: 'Help me choose a gift',
  giftRowDescription: "Tell us who it's for, and we'll suggest three",

  collectionIntro: (col) => `*${col.name}*\n_${col.intro}_`,
  piecesBody: 'Which piece would you like to see?',
  piecesButton: 'View pieces',
  pieceRow: (p, available) => available > 0
    ? `${p.colour} · ${p.technique} · ${rupees(p.price)}`
    : `${p.colour} · all ${word(p.edition_size)} have found homes`,

  pieceCaption: (p) => `*${p.name}*\n_${p.story}._`,
  pieceBody: (p, available) =>
    `${capital(p.technique)}, ${p.hours} hours ${madeBy(p)}.\n\n` +
    `*${rupees(p.price)}*, with our signature box and insured delivery.\n` +
    `_${availabilityLine(p, available)}_`,
  pricesFooter: 'Prices include GST',

  details: (p) =>
    `*${p.name}, in detail*\n\n` +
    `Material: ${p.material}\n` +
    `Work: ${p.technique}, ${p.hours} hours\n` +
    `Made ${madeBy(p)}\n` +
    `Size: ${p.size}, ${p.weight_g} g\n` +
    `Edition: ${word(p.edition_size)}` +
    (p.gi_certificate ? `\nCertified: ${p.gi_certificate}` : '') +
    '\n\n_To care for it: dry-clean only, and rest it folded in muslin, away from light._',
  detailsAsk: (p, curator) =>
    `Would you like to see *${p.name}* in daylight, live, with ${curator}, our curator? A video viewing takes about fifteen minutes.`,

  soldOut: (p, alt, relation) =>
    `*${p.name}* has found its home. All ${word(p.edition_size)} are spoken for.` +
    (alt ? `\n\nMay I show you *${alt.name}*? ${relation}.` : '\n\nWe may make it again. Shall I let you know if we do?'),
  notifyYes: (p) => `Of course. If we make *${p.name}* again, you'll be the first to know.`,

  reservedAsk: (p, minutes) =>
    `A beautiful choice. *${p.name}* is set aside for you for the next ${word(minutes)} minutes.\n\nIs it a gift?`,
  reservedGift: (p, minutes, recipient) =>
    `A beautiful choice for ${recipient}. *${p.name}* is set aside for you for the next ${word(minutes)} minutes.`,

  presentation: (chestPrice) =>
    'How shall we present it?\n\n' +
    '*Signature box*: linen-covered and made by hand, with tissue and a silk ribbon. Complimentary.\n\n' +
    `*Walnut chest*: hand-carved in Srinagar, to keep the shawl in for a lifetime. ${rupees(chestPrice)}.`,

  cardAsk: 'Would you like to include a handwritten card?\n\nSimply type your message here, and our calligrapher will write it by hand, in ink.',
  cardFooter: 'Up to 200 characters',
  cardTooLong: (n) => `That's a lovely message, but a little long for the card: ${n} characters. Could you keep it within 200?`,
  cardConfirm: (t) =>
    'Thank you. Your card will read:\n\n' +
    t.split('\n').map((l) => '> ' + l).join('\n') +
    '\n\n_The price will not appear anywhere in the box._',
  cardRedo: "Of course. Please type it again, just as you'd like it written.",

  dateAsk: 'When would you like it to arrive?',
  dateButton: 'Choose a date',
  dateFooter: 'For another date, simply type it',
  dateAsap: 'As soon as possible',
  dateAsapDescription: (days) => `Usually within ${word(days)} days`,
  dateNoted: (t) => `Noted: _${t}_. A curator will confirm the date with you.`,

  addressAsk: (isGift) => isGift
    ? "And where shall we deliver it?\n\n_We'll contact the recipient only if the courier needs directions, so the surprise is safe. And if it isn't quite right, they can exchange it quietly: no price, no questions._"
    : 'Where shall we deliver it?',
  addressText: "Thank you. We'll use this address, and a curator will check it with you if anything is unclear.",

  orderBody: ({ p, presentation, card, arrive }) =>
    `*${p.name}* · ${presentation}${card ? ' · handwritten card' : ''}\n` +
    `Arriving ${arrive}. Insured delivery, complimentary.\n\n` +
    '_Prefer a bank transfer? Simply reply "bank transfer"._',
  orderFooter: 'UPI, cards, netbanking · secured by Razorpay',

  paid: ({ name, id, p, editionNo, dest, when }) =>
    `Thank you${name ? ', ' + name : ''}. Your order *${id}* is confirmed.\n\n` +
    `*${p.name}*, No. ${editionNo} of ${p.edition_size}, will be pressed, wrapped by hand and sent ${dest} by insured courier, ${when}.\n\n` +
    "We'll write only when there is something to tell you.",
  invoiceCaption: (id) => `Your invoice for ${id}.`,
  paymentAttention: 'Thank you, your payment has reached us. A curator will write to you personally within the hour about your order.',
  payFailed: (p, minutes) =>
    "The payment didn't go through, and nothing has been charged.\n\n" +
    `*${p.name}* is still set aside for you for another ${word(minutes)} minutes.`,
  bankTransfer: ({ order, bank, p }) =>
    `Of course. Please transfer *${rupees(order.total)}* to:\n\n` +
    `${bank.accountName}\n${bank.bank}\nAccount ${bank.account}\nIFSC ${bank.ifsc}\nReference: ${order.id}\n\n` +
    `When it reaches us, a curator will confirm here personally, usually within a few hours. *${p.name}* stays reserved for you until then.`,
  noPendingOrder: "There's nothing waiting for payment just now. Would you like to see the collection?",

  wrapped: (p, when) => `*${p.name}*, being wrapped for you ${when}.`,
  dispatched: (p, courier, eta) =>
    `*${p.name}* has left our studio, insured, with ${courier}.\n\nExpected ${longDate(eta)}.`,
  trackButton: 'Track the parcel',
  deliveredGift: (p, recipient, city, time) =>
    `*${p.name}* was delivered to ${recipient}${city ? ' in ' + city : ''} at ${time} today. We hope it is received with great joy.\n\n` +
    'Your copy of its certificate of authenticity is attached.',
  deliveredSelf: (p, editionNo) =>
    `*${p.name}* has arrived. We hope it is everything you imagined.\n\n` +
    `Its certificate of authenticity is attached: No. ${editionNo} of ${p.edition_size}, registered to you.`,
  afterDelivery: (p) =>
    "If anything is not exactly as you hoped, simply tell us, and we'll make it right.\n\n" +
    `And once a year, we'll collect *${p.name}*, clean and refresh it, and bring it back, at no cost.`,

  conciergeHeader: 'Concierge',
  conciergeBody: 'How may we be of service?',
  conciergeButton: 'Choose',
  conciergeRows: [
    { id: 'cur', title: 'Speak to a curator', description: 'A person, not a bot. Usually within the hour' },
    { id: 'sl', title: 'My shortlist', description: 'The pieces you saved' },
    { id: 'cat', title: 'The full catalogue', description: 'Every piece and every colour, in one place' },
    { id: 'view', title: 'Private video viewing', description: 'See any piece live, in daylight, with a curator' },
    { id: 'trou', title: 'Wedding & family gifting', description: 'Five or more pieces, each boxed and carded by hand' },
    { id: 'besp', title: 'Bespoke & monograms', description: 'Initials in silk, or a piece made for you' },
    { id: 'orders', title: 'My orders', description: 'Status, tracking and invoices' },
    { id: 'reg', title: 'Register a piece', description: 'Have one of our pieces? Unlock yearly care' },
    { id: 'prom', title: 'Delivery, returns & care', description: 'How we look after you, and the piece' },
  ],

  curatorOpen: ({ curator, open, when }) =>
    (open
      ? `Of course. ${curator}, our curator, will write to you personally within the hour.`
      : `Of course. Our curators are with clients from 10 am to 7 pm. ${curator} will write to you personally ${when}.`) +
    "\n\nIf you'd like, tell me a little about what you have in mind, and I'll pass it on.",
  curatorForwarded: (curator) => `Thank you. I've passed this to ${curator}.`,
  curatorSignOff: (text, curator) => `${text}\n\n— ${curator}`,

  viewingAsk: (curator, p) =>
    `A private viewing is a video call with ${curator}, our curator, usually about fifteen minutes. ` +
    (p ? `We'll have *${p.name}* ready, and anything else you'd like to see.` : 'We can show you any piece in the collection, in daylight.') +
    '\n\nWhen would suit you?',
  viewingButton: 'Choose a time',
  viewingNone: 'Our curators are fully booked for the next few days. May I ask one of them to write to you with a time?',
  viewingBooked: (label, curator) =>
    `Confirmed: *${label}*.\n\n${curator} will video call you on WhatsApp, from this number. ` +
    "Is there anything you'd particularly like to see? Simply tell me here.",
  viewingTaken: 'That time has just been taken. Here are the times still free.',
  viewingNoted: (curator) => `Noted. ${curator} will have it ready.`,
  viewingReminder: (curator, time) =>
    `A gentle reminder: your private viewing with ${curator} is at ${time} today. We'll call you on WhatsApp, from this number.`,

  trousseauAsk:
    'For weddings and family occasions, we prepare a private selection, with every piece boxed individually and a card written by hand for each guest.\n\n' +
    'Roughly how many pieces are you thinking of?',
  trousseauButton: 'Choose',
  trousseauWhen: 'Thank you. And when is the occasion? A date or a month is plenty.',

  bespoke: (price) =>
    `We can embroider initials in silk thread in one corner of most pieces: ${rupees(price)}, and five extra days. ` +
    'A piece made entirely for you, from the yarn up, takes eight to twelve weeks.\n\n' +
    'Tell me what you have in mind, and a curator will take it from there.',
  international:
    'We do send pieces abroad, insured, usually in seven to ten days. Duties are paid on arrival in most countries.\n\n' +
    'Which country should it go to? A curator will confirm the cost with you.',
  leadThanks: (kind, curator) => kind === 'trousseau'
    ? `Thank you. ${curator} will prepare a selection for you and write personally within a day.`
    : `Thank you. ${curator} will write to you personally about it, usually within a few hours.`,

  noOrders: "You don't have any orders with us yet. When you do, you'll find them here, with tracking and invoices.",
  ordersBody: 'Which order would you like to see?',
  ordersButton: 'View orders',
  invoiceButton: 'Invoice',

  registerAsk: 'Every piece carries a numbered seal. Please type the code printed on it. It looks like *NR09-7Q2K*.',
  registered: (p, editionNo) =>
    `Welcome. This is *${p.name}*, No. ${editionNo} of ${p.edition_size}: ${p.technique.toLowerCase()}, ${p.hours} hours ${madeBy(p)}.\n\n` +
    "It's now registered to you. Once a year, we'll collect it, clean and refresh it, and bring it back, at no cost. " +
    'Simply write "care" here when it\'s time.',
  registerUnknown: "I couldn't find that code. Could you check it once more? It's printed on the seal, for example *NR09-7Q2K*.",
  registerAgain: (p) => `*${p.name}* is already registered to you. It's in good hands.`,

  optInAsk: 'May we write to you when a new collection is ready? Never more than once a month.',
  optInYes: "Thank you. You'll hear from us only when there is something worth seeing.",
  optInNo: "Of course. We won't write unless you do.",
  optOut: "Of course. You won't receive any news from us. You can still write to us any time.",

  promises: (s, hasGi) =>
    '*Our promises*\n\n' +
    '*Delivery*: complimentary and insured across India, usually in three to five days. Abroad on request.\n\n' +
    '*Returns*: within seven days of delivery, collected from your door and refunded in full. We only ask that the numbered seal stays attached.\n\n' +
    '*Authenticity*: every piece is numbered and comes with a certificate.' +
    (hasGi ? ' Our Pashmina and Kani pieces also carry their GI certificate and a lab report.' : '') + '\n\n' +
    '*Payment*: UPI, cards and netbanking, secured by Razorpay. Bank transfer for larger orders.\n\n' +
    '*Pricing*: our pieces are priced once, fairly, and never placed on sale.\n\n' +
    `_${s.legalName} · ${s.address} · GSTIN ${s.gstin}. Grievance officer: ${s.grievanceOfficer}, ${s.grievanceEmail}._`,

  care:
    '*Caring for your piece*\n\n' +
    '1. Let it rest for a day between wears.\n' +
    '2. Dry-clean only, with a specialist. Never machine-wash.\n' +
    '3. Store it folded in muslin, never plastic, away from light.\n' +
    '4. A few neem leaves or a cedar block in the drawer keep moths away.\n' +
    '5. Steam it; never iron it directly.\n\n' +
    'Once a year we refresh registered pieces at no cost. Simply write "care" here when it\'s time.',

  discount: "Our pieces are priced once, fairly, and never placed on sale. It's a promise we keep to everyone who owns one.",
  cod: "We don't offer cash on delivery. Every piece travels insured, and is paid for securely in this chat: by UPI, card, netbanking or bank transfer.",
  authenticity: (hasGi) =>
    'Every piece is numbered and comes with a certificate of authenticity.' +
    (hasGi ? " Our Pashmina and Kani pieces also carry their government GI certificate and a lab report; you'll find the number in each piece's details." : ''),
  returns:
    "Of course. If a piece isn't exactly as you hoped, we'll collect it from your door within seven days of delivery and refund you in full. " +
    'We only ask that the numbered seal stays attached.',
  price: (p) => `*${p.name}* is ${rupees(p.price)}, including GST, our signature box and insured delivery.`,
  priceRange: (min, max) =>
    `Our pieces range from ${rupees(min)} to ${rupees(max)}, each including GST, our signature box and insured delivery.`,
  thanks: "It's our pleasure.",
  fallback: 'Forgive me, I may not have understood. Here is where I can help. You can also simply ask for a curator.',
  mediaThanks: (curator) => `Thank you. I'll make sure ${curator} sees this.`,

  giftWho: 'Lovely. Who is the gift for?',
  giftOccasion: 'And the occasion?',
  giftBudget: "Is there a budget you'd like me to keep to?",
  giftButton: 'Choose',
  suggestIntro: ({ recipient, occasion, count, stretched }) =>
    `For ${recipient}${occasion ? ', ' + occasion : ''}, I'd suggest ${count === 1 ? 'this piece' : 'these ' + word(count)}. ` +
    "Each arrives in our signature box, with a handwritten card if you'd like." +
    (stretched ? '\n\n_One sits a little above your budget; it felt too right to leave out._' : ''),
  suggestFromText: ({ colour, budget, occasion }) =>
    "Here is what I'd suggest" + (colour ? ` in ${colour}` : '') + (occasion ? ` ${occasion}` : '') + (budget ? `, within ${rupees(budget)}` : '') + '.',
  suggestNone: "Nothing in the collection fits that perfectly just now. May a curator suggest something? There are often pieces we haven't shown here yet.",
  suggestButton: 'View suggestions',

  // --- swipeable catalogue ---
  collectionsCarousel: 'Four collections this winter, each made in small numbered editions. Swipe to explore.',
  collectionCard: (col, from) => `*${col.name}*\n${col.line}\n_From ${rupees(from)}_`,
  viewPieces: 'View pieces',
  collectionCarousel: (col) => `*${col.name}*\n_${col.intro}_\n\nSwipe through the pieces. *See closely* shows every angle, and every colour it comes in.`,
  designCard: (p, versions, available) => available > 0
    ? `*${p.designName}* · ${rupees(p.price)}\n${shortStory(p)}\n_${versions > 1 ? `In ${word(versions)} colours` : availabilityLine(p, available)}_`
    : `*${p.designName}*\n${shortStory(p)}\n_${availabilityLine(p, 0)}_`,
  seeClosely: 'See closely',
  save: 'Save to shortlist',
  notifyMe: 'Notify me',
  reserve: 'Reserve',
  videoViewing: 'Video viewing',

  closely: ({ p, available, curator, intro }) =>
    (intro ? `${intro}\n\n` : '') +
    `*${p.name}*\n_${p.story}._\n\n` +
    `${capital(p.technique)}, ${p.hours} hours ${madeBy(p)}.\n${p.material} · ${p.size} · ${p.weight_g} g` +
    (p.gi_certificate ? `\n${p.gi_certificate}` : '') +
    `\n\n*${rupees(p.price)}*, with our signature box and insured delivery.\n_${availabilityLine(p, available)}_` +
    (p.curator_note ? `\n\n${curator}'s note: “${p.curator_note}”` : ''),
  cardWorn: (p) => `*As it is worn*\n${p.version}`,
  cardDetail: (p) => `*Up close*\n${p.technique}`,
  cardFlat: (p) => `*Laid flat*\n${p.size}, ${p.weight_g} g`,
  cardVersion: (v, available) => `*In ${v.version}*\n${available > 0 ? availabilityLine(v, available) : 'All have found homes'}`,

  saved: (names) => `Saved. Your shortlist: ${names}.`,
  viewShortlist: 'View shortlist',
  shortlistEmpty: 'Your shortlist is empty. Tap *Save to shortlist* on any piece and it waits here for you.',
  shortlist: (n) => `Your shortlist: ${word(n)} pieces. Take your time; they wait here for you.`,
  shortlistLine: (n) => `Your shortlist has ${word(n)} piece${n === 1 ? '' : 's'} waiting.`,

  reservedFlow: (p, minutes) =>
    `A beautiful choice. *${p.name}* is set aside for you for the next ${word(minutes)} minutes.\n\n` +
    "Everything else is on one page: who it's for, the box, a handwritten card and the day it arrives.",
  reservedFlowButton: 'Box, card & delivery',
  giftFinderFlow: "Lovely. Three quick choices, and I'll suggest three pieces.",
  giftFinderFlowButton: 'Find the right piece',
  pickCard: (p, curator, first) => `*${p.name}* · ${rupees(p.price)}\n${first ? `${curator}'s pick` : shortStory(p, 70)}`,

  nudge: (p, time) => `*${p.name}* is still set aside for you, until ${time}. Shall we continue?`,
  continueBtn: 'Continue',
  releaseBtn: 'Release it',
  released: (p) => `Of course. *${p.name}* is back in the collection, and on your shortlist if you'd like it later.`,
  resumeLine: (p, recipient) => `You were choosing ${p.name}${recipient ? ' for ' + recipient : ''}. It's on your shortlist.`,

  catalogBody: 'Every piece, in one place. Tap any piece to see it closely and ask us about it.',
  catalogButton: 'View catalogue',

  remindBtn: 'Remind me next year',
  remindAsk: 'Of course. When is the occasion each year? A date like 12 March is plenty.',
  remindSaved: "Noted. We'll write to you once, two weeks before, with a thought or two. Never more than that.",
  giftExchange: "If it isn't quite right, they can exchange it quietly: no price, no questions.",
  cartMany: (names) => `Thank you. I'll set these aside one at a time, starting with ${names[0]}. The others are on your shortlist.`,

  // Owner alerts (read by you, in the Studio and on your phone)
  ownerNewOrder: (o, p, client) =>
    [`Paid${o.payment?.method ? ' by ' + o.payment.method : ''}`,
      `${p.name}, No. ${o.editionNo} of ${p.edition_size} · seal ${o.serial}`,
      `${o.presentationLabel}${o.card ? ` · card: "${o.card}"` : ''}${o.isGift ? ' · gift, price hidden' : ''}`,
      `Deliver to ${o.address?.name || client.name || 'client'}, ${o.address?.city || ''}${o.deliverOn ? ' by ' + longDate(o.deliverOn) : ''}`],
};

export function viewingSlotLabel(day, h, min, now, relativeDayFn) {
  return `${capital(relativeDayFn(day, now))}, ${clockTime(h, min)}`;
}
