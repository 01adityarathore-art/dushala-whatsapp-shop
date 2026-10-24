// Builds the online demo into site/: plain files that GitHub Pages (or any static host) can serve.
// The bot runs inside the visitor's browser, so no server is needed.   Run: npm run build:demo

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avatarSVG } from '../src/art.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'src'), { recursive: true });

// The page, switched to demo mode.
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
  .replace('<script src="app.js" type="module"></script>', '<script>window.SHAWL_DEMO = true;</script>\n<script src="app.js" type="module"></script>')
  .replace('<title>Dushala Bot Studio</title>', `<title>${config.brand.name} WhatsApp Shop · Demo</title>\n<meta name="description" content="A working demo of a premium WhatsApp shop for heirloom shawls.">`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
for (const f of ['app.js', 'app.css', 'demo-backend.js']) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(OUT, f));

// The bot itself (everything except the Mac-only file helpers).
for (const f of fs.readdirSync(path.join(ROOT, 'src'))) {
  if (f.endsWith('.js') && f !== 'node.js') fs.copyFileSync(path.join(ROOT, 'src', f), path.join(OUT, 'src', f));
}
fs.copyFileSync(path.join(ROOT, 'catalogue.csv'), path.join(OUT, 'catalogue.csv'));
fs.copyFileSync(path.join(ROOT, 'config.json'), path.join(OUT, 'config.json'));

// Photos, and a list of them so the demo knows which pictures exist.
const manifest = [];
(function copyDir(rel) {
  for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const r = `${rel}/${entry.name}`;
    if (entry.isDirectory()) { fs.mkdirSync(path.join(OUT, r), { recursive: true }); copyDir(r); }
    else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) { fs.copyFileSync(path.join(ROOT, r), path.join(OUT, r)); manifest.push(r); }
  }
})('photos');
fs.writeFileSync(path.join(OUT, 'photos', 'manifest.json'), JSON.stringify(manifest.sort()));

fs.mkdirSync(path.join(OUT, 'media', 'asset'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'media', 'asset', 'avatar.svg'), avatarSVG(config.brand.name));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`Demo built in site/: ${manifest.length} photos.`);
