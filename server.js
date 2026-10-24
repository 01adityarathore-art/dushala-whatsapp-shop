// Shawl Bot server.
//   http://127.0.0.1:8985        the test phone and your Studio
//   /webhook                     where WhatsApp delivers real messages (once keys are in .env)
// Run: node server.js

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createFileStore, loadCatalogue } from './src/node.js';
import { createEngine } from './src/engine.js';
import { createWhatsApp } from './src/whatsapp.js';
import { createApp } from './src/app-core.js';
import { COLLECTIONS } from './src/copy.js';
import * as art from './src/art.js';
import { certificateHTML, invoiceHTML } from './src/docs.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const env = { ...loadEnv(path.join(ROOT, '.env')), ...process.env };
const PORT = Number(env.PORT || config.port || 8985);
const HOST = env.HOST || '127.0.0.1';
const BASE = (env.PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const DATA = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data');
const store = createFileStore(path.join(DATA, 'state.json'));
const catalogue = loadCatalogue(path.join(ROOT, 'catalogue.csv'));
// WhatsApp Flows (the one-page forms) are always on for the test phone; on the live number only once both are uploaded.
const flowsLive = Boolean(env.FLOW_ORDER_OPTIONS_ID && env.FLOW_GIFT_FINDER_ID);
const engine = createEngine({ store, catalogue, config, canFlow: (clientId) => clientId.startsWith('sim-') || flowsLive });
const secret = loadSecret(path.join(DATA, 'secret.txt'));
const wa = createWhatsApp({ env, resolveMedia, resolveDoc, log: (m) => console.log('[whatsapp]', m) });
const streams = new Set(); // open Studio/phone pages
const app = createApp({ store, catalogue, config, engine, wa, media: resolveMedia, docs: resolveDoc, broadcast, onAlert: telegram, publicUrl: env.PUBLIC_URL || null });

fs.watchFile(catalogue.path, { interval: 1500 }, () => {
  try { catalogue.reload(); console.log('catalogue reloaded'); broadcast({ kind: 'studio' }); }
  catch (e) { console.log('catalogue reload failed:', e.message); }
});
setInterval(app.tick, 30000);

// ---------- helpers ----------

function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function loadSecret(file) {
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const s = crypto.randomBytes(24).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}

const docToken = (kind, orderId) => crypto.createHmac('sha256', secret).update(`${kind}:${orderId}`).digest('hex').slice(0, 20);

// The ?v= stamp changes when a photo file is replaced, so phones show the new picture at once.
function photoFor(...parts) {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const rel = path.join('photos', ...parts) + '.' + ext;
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file)) return '/' + rel.split(path.sep).join('/') + `?v=${Math.round(fs.statSync(file).mtimeMs)}`;
  }
  return null;
}

function resolveMedia(ref = {}) {
  let photo = null, drawn = null;
  if (ref.kind === 'piece') { photo = photoFor(ref.id, ref.view); drawn = `/media/piece/${ref.id}/${ref.view}.svg`; }
  if (ref.kind === 'asset') { photo = photoFor('brand', ref.id); drawn = `/media/asset/${ref.id}.svg`; }
  if (ref.kind === 'cover') { photo = photoFor('collections', ref.id); drawn = `/media/cover/${ref.id}.svg`; }
  if (ref.kind === 'wrap') { photo = photoFor('wrap', ref.orderId) || photoFor('wrap', 'default'); drawn = `/media/wrap/${ref.orderId}.svg`; }
  const rel = photo || drawn;
  return { rel, url: BASE + rel, photo: Boolean(photo) };
}

function resolveDoc(ref = {}) {
  const t = docToken(ref.kind, ref.orderId);
  const rel = `/doc/${ref.kind}/${ref.orderId}?t=${t}`;
  return { rel, url: BASE + rel, pdfUrl: `${BASE}/doc/${ref.kind}/${ref.orderId}.pdf?t=${t}` };
}

function verifySignature(raw, signature) {
  if (!env.WA_APP_SECRET) return true;
  if (!signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', env.WA_APP_SECRET).update(raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Product feed for Meta Commerce Manager (Catalogue → Data sources → Data feed), so WhatsApp's catalogue stays in sync.
function feedCSV() {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'additional_image_link', 'brand', 'color']];
  for (const p of catalogue.all()) {
    const img = (view) => resolveMedia({ kind: 'piece', id: p.id, view });
    rows.push([p.id, p.design, p.name, `${p.story}. ${p.material}, ${p.technique}. ${p.size}.`, engine.available(p) > 0 ? 'in stock' : 'out of stock',
      'new', `${p.price.toFixed(2)} INR`, `${BASE}/`, img('hero').url, [img('detail').url, img('flat').url].join(','), config.brand.name, p.version]);
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n');
}

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of streams) res.write(data);
}

async function telegram(alert) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: [alert.title, ...(alert.lines || [])].join('\n') }),
    });
  } catch (e) { console.log('telegram:', e.message); }
}

// ---------- HTTP ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveFile(res, file, cache = 'max-age=60') {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', { 'Cache-Control': cache });
}

// Serves a file from inside one folder only.
function serveFrom(res, dir, rel, cache) {
  const file = path.resolve(dir, '.' + decodeURIComponent(rel));
  if (!file.startsWith(dir + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  return serveFile(res, file, cache);
}

function studioAllowed(req, url) {
  if (!env.STUDIO_KEY) return true;
  const cookie = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('studio_key='));
  return url.searchParams.get('key') === env.STUDIO_KEY || cookie === `studio_key=${env.STUDIO_KEY}`;
}

async function pdf(kind, orderId, t) {
  const out = path.join(DATA, 'pdf', `${kind}-${orderId}.pdf`);
  if (fs.existsSync(out)) return out;
  if (!fs.existsSync(CHROME)) throw new Error('Google Chrome is needed to make PDFs');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await new Promise((resolve, reject) => {
    const p = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${out}`,
      `http://127.0.0.1:${PORT}/doc/${kind}/${orderId}?t=${t}&print=1`], { stdio: 'ignore' });
    const timer = setTimeout(() => { p.kill(); reject(new Error('PDF timed out')); }, 25000);
    p.on('exit', () => { clearTimeout(timer); fs.existsSync(out) ? resolve() : reject(new Error('PDF failed')); });
  });
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    // --- WhatsApp webhook (public) ---
    if (p === '/webhook' && req.method === 'GET') {
      if (url.searchParams.get('hub.mode') === 'subscribe' && env.WA_VERIFY_TOKEN && url.searchParams.get('hub.verify_token') === env.WA_VERIFY_TOKEN) {
        return send(res, 200, url.searchParams.get('hub.challenge') || '', 'text/plain');
      }
      return send(res, 403, 'Forbidden', 'text/plain');
    }
    if (p === '/webhook' && req.method === 'POST') {
      const raw = await readBody(req);
      if (!verifySignature(raw, req.headers['x-hub-signature-256'])) return send(res, 401, 'Bad signature', 'text/plain');
      send(res, 200, 'ok', 'text/plain');
      const { inbound: msgs, payments } = wa.parseWebhook(JSON.parse(raw.toString('utf8') || '{}'));
      for (const m of msgs) {
        if (m.event.referral && !m.event.referral.pieceId) {
          const hay = `${m.event.referral.headline || ''} ${m.event.referral.body || ''}`.toLowerCase();
          const hit = catalogue.all().find((x) => hay.includes(x.designName.toLowerCase()));
          if (hit) m.event.referral.pieceId = hit.id;
        }
        app.inbound(m.from, m.event, { name: m.profileName }, { lastMessageId: m.messageId });
      }
      for (const pay of payments) {
        const o = store.data.orders[pay.ref];
        if (o) app.inbound(o.clientId, { type: 'payment', ref: pay.ref, status: pay.status, method: pay.method }, {});
      }
      return;
    }

    // --- pictures and documents (public, documents need their token) ---
    if (p.startsWith('/photos/')) return serveFrom(res, path.join(ROOT, 'photos'), p.slice('/photos'.length));
    let m;
    if ((m = p.match(/^\/media\/piece\/([a-z0-9-]+)\/(hero|detail|flat)\.svg$/))) {
      const piece = catalogue.pieces.find((x) => x.id === m[1]);
      if (!piece) return send(res, 404, 'Not found', 'text/plain');
      const svg = m[2] === 'hero' ? art.heroSVG(piece, config.brand.name) : m[2] === 'detail' ? art.detailSVG(piece) : art.flatSVG(piece, config.brand.name);
      return send(res, 200, svg, TYPES['.svg'], { 'Cache-Control': 'max-age=300' });
    }
    if ((m = p.match(/^\/media\/asset\/(brand|presentation|avatar|concierge)\.svg$/))) {
      const svg = m[1] === 'presentation' ? art.presentationSVG(config.brand.name)
        : m[1] === 'avatar' ? art.avatarSVG(config.brand.name) : art.brandCoverSVG(config.brand.name, config.brand.tagline);
      return send(res, 200, svg, TYPES['.svg'], { 'Cache-Control': 'max-age=300' });
    }
    if ((m = p.match(/^\/media\/cover\/([a-z]+)\.svg$/))) {
      const col = COLLECTIONS.find((c) => c.id === m[1]);
      if (!col) return send(res, 404, 'Not found', 'text/plain');
      const lead = catalogue.inCollection(col.id).sort((a, b) => b.price - a.price)[0];
      return send(res, 200, art.collectionCoverSVG(col, lead, config.brand.name), TYPES['.svg'], { 'Cache-Control': 'max-age=300' });
    }
    if ((m = p.match(/^\/media\/wrap\/([A-Z]+-\d+)\.svg$/))) {
      const o = store.data.orders[m[1]];
      const piece = o && catalogue.pieces.find((x) => x.id === o.pieceId);
      if (!piece) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, art.wrapSVG(piece, config.brand.name), TYPES['.svg']);
    }
    if ((m = p.match(/^\/doc\/(invoice|certificate)\/([A-Z]+-\d+)(\.pdf)?$/))) {
      const [, kind, orderId, asPdf] = m;
      const t = url.searchParams.get('t');
      if (t !== docToken(kind, orderId)) return send(res, 403, 'This link has expired.', 'text/plain');
      const o = store.data.orders[orderId];
      const piece = o && catalogue.pieces.find((x) => x.id === o.pieceId);
      if (!o || !piece || !o.payment) return send(res, 404, 'Not found', 'text/plain');
      if (asPdf) return serveFile(res, await pdf(kind, orderId, t));
      const owner = store.data.clients[kind === 'certificate' && o.registeredTo ? o.registeredTo : o.clientId];
      const clientName = owner?.profileName || owner?.name;
      const html = kind === 'invoice'
        ? invoiceHTML({ order: o, piece, brand: config.brand.name, seller: config.seller, clientName })
        : certificateHTML({ order: o, piece, brand: config.brand.name, clientName });
      return send(res, 200, html, TYPES['.html']);
    }

    if (p === '/catalogue-feed.csv') return send(res, 200, feedCSV(), 'text/csv; charset=utf-8');

    // --- everything below is the Studio and test phone ---
    if (!studioAllowed(req, url)) return send(res, 401, 'Studio key required', 'text/plain');
    if (url.searchParams.get('key')) res.setHeader('Set-Cookie', `studio_key=${env.STUDIO_KEY}; HttpOnly; SameSite=Strict; Path=/`);

    if (p === '/' || p === '/index.html') return serveFile(res, path.join(ROOT, 'public', 'index.html'), 'no-cache');
    if (['/app.js', '/app.css'].includes(p)) return serveFile(res, path.join(ROOT, 'public', p.slice(1)), 'no-cache');

    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      streams.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); streams.delete(res); });
      return;
    }
    if (p.startsWith('/api/')) {
      const body = req.method === 'POST' ? JSON.parse((await readBody(req)).toString('utf8') || '{}') : {};
      const out = app.api(req.method, p, Object.fromEntries(url.searchParams), body);
      if (out) return send(res, out.status, out.body);
    }
    send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  ${config.brand.name} bot is running`);
  console.log(`  Test phone and Studio:  http://127.0.0.1:${PORT}`);
  console.log(`  WhatsApp:               ${wa.enabled ? 'LIVE, webhook at ' + BASE + '/webhook' : 'not connected yet (test mode)'}\n`);
});
