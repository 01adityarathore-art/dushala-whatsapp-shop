// Understands what a client types, on this machine, with no AI service.
// It reads English and everyday Hinglish ("maa ke liye", "kitne ka hai").
// It only works out what the client wants. Prices, stock and payments are always handled by plain code.

const RECIPIENT_WORDS = [
  ['mother', /\b(mother|mom|mommy|mummy|mum|maa|ma|amma|mummyji|mother[- ]in[- ]law|saas|mil)\b/],
  ['wife', /\b(wife|biwi|patni|missus)\b/],
  ['husband', /\b(husband|hubby|pati)\b/],
  ['father', /\b(father|dad|daddy|papa|pitaji|father[- ]in[- ]law|sasur)\b/],
  ['daughter', /\b(daughter|beti)\b/],
  ['sister', /\b(sister|didi|behen|bahen|sis)\b/],
  ['friend', /\b(friend|dost|bestie)\b/],
  ['colleague', /\b(colleague|boss|client|manager|team)\b/],
  ['special', /\b(girlfriend|boyfriend|fiance|fiancee|partner|someone special)\b/],
];

const OCCASION_WORDS = [
  ['wedding', /\b(wedding|shaadi|shadi|marriage|vivah|engagement|sagai)\b/],
  ['anniversary', /\b(anniversary|anniv)\b/],
  ['birthday', /\b(birthday|bday|b'day|janamdin)\b/],
  ['festive', /\b(diwali|deepavali|festival|festive|karva ?chauth|eid|christmas|new year|rakhi|bhai dooj)\b/],
  ['thanks', /\b(thank you gift|thank-you|farewell|retirement)\b/],
];

const INTENTS = [
  ['optout', /^(stop|unsubscribe|stop messages|no more messages)\b/],
  ['curator', /\b(speak|talk|call me|call|human|person|agent|someone real|curator|representative|executive|baat)\b/],
  ['orders', /\b(track|tracking|where is my|where's my|order status|my order|dispatch|shipped|not received|kab (aayega|aaega|milega)|awb)\b/],
  ['returns', /\b(return|exchange|refund|damaged|defect|wrong piece|not happy)\b/],
  ['discount', /\b(discount|offer|coupon|sale|deal|cheaper|best price|kam (karo|kijiye)|less price)\b/],
  ['cod', /\b(cod|cash on delivery|cash)\b/],
  ['international', /\b(international|abroad|overseas|usa|america|uk|london|dubai|uae|canada|singapore|australia|outside india|nri)\b/],
  ['trousseau', /\b(bulk|corporate|trousseau|guests|return gifts?|wholesale|\d{2,}\s*(pieces|shawls|nos))\b/],
  ['bespoke', /\b(monogram|initials|custom|bespoke|personali[sz]e|made to order|engrave)\b/],
  ['viewing', /\b(video call|see it live|live video|viewing|visit you|visit your|showroom|your store|boutique|in person)\b/],
  ['authenticity', /\b(real|genuine|authentic|pure|original|fake|certified|certificate|gi tag|ring test)\b/],
  ['care', /\b(care|wash|washing|clean|dry ?clean|moth|storage|store it|iron)\b/],
  ['promises', /\b(policy|policies|delivery time|shipping|how long|terms|returns policy)\b/],
  ['register', /\b(register|seal|code on the)\b/],
  ['price', /\b(price|prices|cost|how much|rate|kitne|kitna|daam|kya rate)\b/],
  ['buy', /\b(buy|purchase|reserve|i'?ll take|take it|want (it|this)|book it|order it|place order)\b/],
  ['shortlist', /\b(shortlist|saved|my list|wishlist|favou?rites)\b/],
  ['catalogue', /\b(catalog|catalogue|everything|all (the )?pieces|full range|all designs)\b/],
  ['gift', /\b(gift|present|tohfa|surprise)\b/],
  ['browse', /\b(collection|show me|browse|options|designs|shawls?|stoles?|what do you have|new)\b/],
  ['thanks', /^(thank|thanks|thx|ty|shukriya|dhanyavad|great|perfect|lovely|ok thanks|okay thanks|wonderful)\b/],
  ['greet', /^(hi+|hello|hey|hola|namaste|namaskar|good (morning|afternoon|evening)|salaam|aadab|start|menu|home|main menu)\b/],
];

const SERIAL = /\b([a-z]{2}\d{2}-[a-z0-9]{4})\b/i;
const NO_CARD = /^(no|none|skip|no card|no thanks|no, thank you|nahi|not needed)\b/i;

function budgetFrom(text) {
  // "under 50k", "below 1 lakh", "around 30,000", "1.5L", "₹60000"
  const m = text.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:[.,]\d+)*)\s*(k|thousand|lakh|lakhs|lac|l)?\b/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'k' || unit === 'thousand') n *= 1000;
  if (unit.startsWith('la') || unit === 'l') n *= 100000;
  if (!unit && n < 1000) return null; // "2 pieces" is not a budget
  return n >= 1000 ? Math.round(n) : null;
}

export function understand(raw, pieces = []) {
  const text = String(raw || '').toLowerCase().replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
  const out = { text, intent: null, piece: null, recipient: null, occasion: null, colour: null, budget: null, serial: null, noCard: NO_CARD.test(text) };

  const serial = raw && String(raw).match(SERIAL);
  if (serial) { out.serial = serial[1].toUpperCase(); out.intent = 'register'; return out; }

  // A design named in the text ("mehr"), and the colour version if one is named too ("mehr in camel").
  const named = pieces.filter((p) => new RegExp(`\\b${(p.designName || p.name).toLowerCase()}\\b`).test(text));
  if (named.length) {
    const inColour = named.find((p) => p.colour_words.some((w) => new RegExp(`\\b${w}\\b`).test(text)));
    out.piece = (inColour || named[0]).id;
  }
  for (const [id, re] of RECIPIENT_WORDS) if (re.test(text)) { out.recipient = id; break; }
  for (const [id, re] of OCCASION_WORDS) if (re.test(text)) { out.occasion = id; break; }
  for (const p of pieces) {
    const hit = p.colour_words.find((w) => new RegExp(`\\b${w}\\b`).test(text));
    if (hit) { out.colour = hit; break; }
  }
  out.budget = budgetFrom(text);

  for (const [intent, re] of INTENTS) {
    if (re.test(text)) { out.intent = intent; break; }
  }
  // A greeting with a real question after it ("hi, do you have red shawls?") is about the question.
  if (out.intent === 'greet' && text.split(' ').length > 4 && (out.colour || out.recipient || out.budget || out.piece)) out.intent = null;
  return out;
}
