// Reads catalogue.csv (later: a published Google Sheet) and checks every row before a client can see it.

import { COLLECTIONS } from './copy.js';

const NUMBER_FIELDS = ['edition_size', 'remaining', 'price', 'gst_rate', 'hours', 'weight_g'];
const TAG_FIELDS = ['colour_words', 'for', 'occasions'];
const REQUIRED = ['id', 'code', 'name', 'collection', 'edition_size', 'remaining', 'price', 'material', 'technique', 'hours', 'artisan', 'origin', 'colour', 'story'];
// Legally protected (GI) craft names: only allowed with a certificate. Shahtoosh is illegal to trade.
const GI_WORDS = /\b(pashmina|kani|sozni|sozani)\b/i;
const BANNED_WORDS = /\bshahtoosh\b/i;

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

function toPieces(text) {
  const [header, ...rows] = parseCSV(text);
  const keys = header.map((h) => h.trim().toLowerCase());
  return rows.map((cells) => {
    const p = {};
    keys.forEach((k, i) => { p[k] = (cells[i] ?? '').trim(); });
    for (const k of NUMBER_FIELDS) p[k] = p[k] === '' ? null : Number(String(p[k]).replace(/[^\d.]/g, ''));
    for (const k of TAG_FIELDS) p[k] = (p[k] || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
    p.id = (p.id || '').toLowerCase();
    p.code = (p.code || '').toUpperCase();
    p.design = (p.design || p.id).toLowerCase();
    p.version = p.version || p.colour;
    if (p.gst_rate == null) p.gst_rate = 18;
    return p;
  });
}

// Pieces sharing a design are colour versions of one shawl: "Mehr in Camel", "Mehr in Ink blue".
function groupVersions(pieces) {
  const byDesign = {};
  for (const p of pieces) (byDesign[p.design] ||= []).push(p);
  for (const p of pieces) {
    const family = byDesign[p.design];
    p.designName = p.name;
    p.versionIds = family.map((x) => x.id);
    if (family.length > 1) p.name = `${p.designName} in ${p.version}`;
    if (!p.curator_note) p.curator_note = family.find((x) => x.curator_note)?.curator_note || '';
  }
}

function validate(pieces) {
  const warnings = [];
  const seenIds = new Set(), seenCodes = new Set();
  const collectionIds = new Set(COLLECTIONS.map((c) => c.id));
  for (const p of pieces) {
    const problems = [];
    for (const k of REQUIRED) if (p[k] == null || p[k] === '') problems.push(`missing ${k}`);
    if (p.id && seenIds.has(p.id)) problems.push('duplicate id');
    if (p.code && seenCodes.has(p.code)) problems.push('duplicate code');
    if (p.code && !/^[A-Z]{2}$/.test(p.code)) problems.push('code must be two letters, like NR');
    if (p.collection && !collectionIds.has(p.collection)) problems.push(`unknown collection "${p.collection}"`);
    if (p.price != null && !(p.price > 0)) problems.push('price must be above zero');
    if (p.remaining != null && p.edition_size != null && p.remaining > p.edition_size) problems.push('remaining is more than the edition size');
    const words = [p.name, p.material, p.technique, p.story].join(' ');
    if (BANNED_WORDS.test(words)) problems.push('mentions shahtoosh, which is illegal to trade');
    if (GI_WORDS.test(words) && !p.gi_certificate) problems.push('uses a protected craft name (Pashmina, Kani or Sozni) but has no GI certificate');
    for (const k of ['ground', 'motif', 'accent']) if (p[k] && !/^#[0-9a-f]{6}$/i.test(p[k])) problems.push(`${k} colour must look like #A1B2C3`);
    p.live = problems.length === 0;
    if (problems.length) warnings.push({ id: p.id || '(no id)', name: p.name || '(no name)', problems, hidden: true });
    if (p.id) seenIds.add(p.id);
    if (p.code) seenCodes.add(p.code);
  }
  return warnings;
}

// readText() returns the CSV text: from a file on the Mac, or fetched once by the online demo.
export function createCatalogue(readText) {
  const cat = {
    path: 'catalogue.csv', pieces: [], warnings: [], loadedAt: null,
    reload() {
      const pieces = toPieces(readText());
      this.warnings = validate(pieces);
      groupVersions(pieces);
      this.pieces = pieces;
      this.loadedAt = new Date().toISOString();
      return this;
    },
    get(id) { return this.pieces.find((p) => p.id === id && p.live) || null; },
    all() { return this.pieces.filter((p) => p.live); },
    inCollection(id) { return this.all().filter((p) => p.collection === id); },
    versions(p) { return this.all().filter((x) => x.design === p.design); },
    collection(id) { return COLLECTIONS.find((c) => c.id === id) || null; },
    hasGi() { return this.all().some((p) => p.gi_certificate); },
  };
  return cat.reload();
}
