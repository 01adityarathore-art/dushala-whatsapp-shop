// Stand-in pictures, drawn in code from each piece's colours, so the test phone looks finished
// before the real photography exists. Put real photos in photos/<piece id>/hero.jpg (and detail.jpg,
// flat.jpg) and they replace these automatically. WhatsApp itself needs the real JPG/PNG photos.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SERIF = "'Bodoni 72', Didot, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const SCRIPT = "'Snell Roundhand', 'Apple Chancery', 'Brush Script MT', cursive";

const BOTEH = 'M22 58 C8 56 2 44 5 32 C8 21 20 17 25 8 C27 3 33 1 35 6 C37 11 31 13 33 20 C41 33 38 52 22 58 Z';
const LEAF = 'M15 30 L13 22 L6 24 L9 18 L2 14 L9 12 L7 5 L13 8 L15 0 L17 8 L23 5 L21 12 L28 14 L21 18 L24 24 L17 22 Z';

function seeded(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * (amt > 0 ? 255 - v : v))));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function palette(p) {
  return { g: p.ground || '#E8E0D2', m: p.motif || '#7A2433', a: p.accent || '#B08A3E' };
}

// ---------- woven patterns ----------

function fieldPattern(id, p, scale = 1) {
  const { g, m, a } = palette(p);
  const t = (w, h, inner) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse" patternTransform="scale(${scale})"><rect width="${w}" height="${h}" fill="${g}"/>${inner}</pattern>`;
  switch (p.pattern) {
    case 'sozni':
      return t(140, 140, `
        <g fill="none" stroke="${m}" stroke-width="1.6" stroke-linecap="round" opacity=".85">
          <path d="M20 120 C40 90 30 60 60 40 C80 28 95 30 110 18"/><path d="M90 140 C100 120 120 110 140 112"/></g>
        <g fill="${shade(m, .15)}" opacity=".8">
          <ellipse cx="38" cy="86" rx="7" ry="3" transform="rotate(-50 38 86)"/><ellipse cx="52" cy="58" rx="7" ry="3" transform="rotate(30 52 58)"/>
          <ellipse cx="84" cy="30" rx="7" ry="3" transform="rotate(-20 84 30)"/><ellipse cx="118" cy="114" rx="6" ry="2.6" transform="rotate(10 118 114)"/></g>
        <g fill="${a}">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="110" cy="12" rx="2.6" ry="5" transform="rotate(${r} 110 18)"/>`).join('')}<circle cx="110" cy="18" r="2.4" fill="${m}"/></g>
        <g fill="${a}" opacity=".9">${[0, 90, 180, 270].map((r) => `<ellipse cx="22" cy="116" rx="2" ry="4" transform="rotate(${r} 22 120)"/>`).join('')}</g>`);
    case 'kani':
      return t(64, 96, `
        <path d="${BOTEH}" fill="${m}" transform="translate(6 8) scale(.62)"/>
        <path d="${BOTEH}" fill="${a}" transform="translate(13 20) scale(.32)"/>
        <path d="${BOTEH}" fill="${shade(m, -.2)}" transform="translate(58 56) scale(-.62 .62)"/>
        <path d="${BOTEH}" fill="${a}" transform="translate(51 68) scale(-.32 .32)"/>
        <g fill="${a}" opacity=".75"><circle cx="48" cy="16" r="2"/><circle cx="16" cy="70" r="2"/><path d="M32 44 l4 4 -4 4 -4 -4z"/></g>`);
    case 'jamawar':
      return t(170, 210, `
        <g opacity=".95"><path d="${BOTEH}" fill="${m}" transform="translate(30 30) scale(2.1)"/>
        <path d="${BOTEH}" fill="${shade(g, .12)}" transform="translate(52 66) scale(1.2)"/>
        <path d="${BOTEH}" fill="${a}" transform="translate(64 92) scale(.6)"/></g>
        <g fill="none" stroke="${a}" stroke-width="1.4" opacity=".7"><path d="M120 20 C150 40 140 80 160 100"/><path d="M10 180 C40 170 60 200 90 196"/></g>
        <g fill="${a}" opacity=".7"><circle cx="150" cy="160" r="3"/><circle cx="20" cy="20" r="2.5"/></g>`);
    case 'herringbone':
      return t(20, 20, `<g stroke="${shade(g, -.12)}" stroke-width="2.2" fill="none"><path d="M0 5 L10 0 M0 15 L10 10 M0 25 L10 20"/><path d="M10 0 L20 5 M10 10 L20 15 M10 20 L20 25"/></g>`);
    case 'block':
      return t(60, 60, `
        <g transform="translate(30 30)" fill="${m}" opacity=".55">${[0, 45, 90, 135, 180, 225, 270, 315].map((r) => `<ellipse cx="0" cy="-8" rx="3" ry="6" transform="rotate(${r})"/>`).join('')}</g>
        <circle cx="30" cy="30" r="3" fill="${a}"/><g fill="${m}" opacity=".35"><circle cx="0" cy="0" r="2"/><circle cx="60" cy="0" r="2"/><circle cx="0" cy="60" r="2"/><circle cx="60" cy="60" r="2"/></g>`);
    case 'zari':
      return t(70, 70, `<path d="${BOTEH}" fill="${a}" opacity=".55" transform="translate(26 22) scale(.32)"/><circle cx="0" cy="0" r="1.5" fill="${a}" opacity=".5"/>`);
    case 'tilla':
      return t(150, 150, `
        <path d="${BOTEH}" fill="none" stroke="${a}" stroke-width="1.6" transform="translate(40 30) scale(1.4)"/>
        <path d="${BOTEH}" fill="${a}" opacity=".35" transform="translate(54 58) scale(.55)"/>
        <g fill="${a}" opacity=".7"><circle cx="120" cy="120" r="2.4"/><circle cx="20" cy="130" r="1.8"/></g>`);
    case 'stripe':
      return t(36, 36, `<rect x="0" y="0" width="7" height="36" fill="${m}"/><rect x="14" y="0" width="1.5" height="36" fill="${shade(g, .08)}"/>`);
    case 'chinar':
    case 'plain':
    default:
      return t(8, 8, `<path d="M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6" stroke="${shade(g, -.05)}" stroke-width="1"/>`);
  }
}

function borderPattern(id, p, scale = 1) {
  const { g, m, a } = palette(p);
  const t = (w, h, inner) => `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse" patternTransform="scale(${scale})"><rect width="${w}" height="${h}" fill="${shade(g, -.08)}"/>${inner}</pattern>`;
  switch (p.pattern) {
    case 'chinar':
      return t(44, 40, `<path d="${LEAF}" fill="${m}" transform="translate(7 5)"/><path d="${LEAF}" fill="${a}" opacity=".7" transform="translate(30 22) scale(.45)"/>`);
    case 'zari':
    case 'tilla':
      return t(40, 40, `<rect width="40" height="40" fill="${shade(m, -.05)}"/><rect y="4" width="40" height="3" fill="${a}"/><rect y="33" width="40" height="3" fill="${a}"/><path d="${BOTEH}" fill="${a}" transform="translate(12 10) scale(.35)"/>`);
    case 'herringbone':
    case 'stripe':
    case 'plain':
      return t(40, 40, `<rect y="10" width="40" height="3" fill="${a}" opacity=".8"/><rect y="20" width="40" height="8" fill="${m}" opacity=".6"/><rect y="32" width="40" height="2" fill="${a}" opacity=".8"/>`);
    case 'block':
      return t(40, 40, `<rect width="40" height="40" fill="${m}"/><g transform="translate(20 20)" fill="${a}">${[0, 60, 120, 180, 240, 300].map((r) => `<ellipse cx="0" cy="-6" rx="2.4" ry="5" transform="rotate(${r})"/>`).join('')}</g>`);
    default:
      return t(36, 40, `<rect width="36" height="40" fill="${m}"/><path d="${BOTEH}" fill="${a}" transform="translate(9 6) scale(.45)"/><rect y="0" width="36" height="2" fill="${a}"/><rect y="38" width="36" height="2" fill="${a}"/>`);
  }
}

const GRAIN = `<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .07"/></feComponentTransfer></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>`;

const wrap = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}<rect width="${w}" height="${h}" filter="url(#grain)"/></svg>`;

function signature(brand, x, y, fill, size = 17, anchor = 'start') {
  return `<text x="${x}" y="${y}" font-family="${SERIF}" font-size="${size}" letter-spacing="${size * .42}" fill="${fill}" text-anchor="${anchor}">${esc(brand.toUpperCase())}</text>`;
}

// ---------- the three views of a piece ----------

export function heroSVG(p, brand) {
  const { g, m, a } = palette(p);
  const r = seeded(p.id);
  const W = 800, H = 1000, top = 150, L0 = 205, R0 = 595, flare = 46, base = 870;
  const left = L0 - flare, right = R0 + flare;
  const waves = 4 + Math.floor(r() * 3), phase = r() * 3;
  const by = (x) => base + 15 * Math.sin(((x - left) / (right - left)) * Math.PI * waves + phase);
  const xs = Array.from({ length: 91 }, (_, i) => left + (i * (right - left)) / 90);
  const bottom = xs.map((x) => `L${x.toFixed(1)} ${by(x).toFixed(1)}`).reverse().join(' ');
  const drape = `M${L0} ${top} L${R0} ${top} Q${R0 + flare * .15} ${top + 380} ${right} ${by(right).toFixed(1)} ${bottom} Q${L0 - flare * .15} ${top + 380} ${L0} ${top} Z`;
  const band = (o1, o2) => `M${xs.map((x) => `${x.toFixed(1)} ${(by(x) - o1).toFixed(1)}`).join(' L')} L${xs.map((x) => `${x.toFixed(1)} ${(by(x) - o2).toFixed(1)}`).reverse().join(' L')} Z`;
  const stops = [];
  for (let i = 0; i <= 18; i++) {
    const dark = i % 2 === 1;
    stops.push(`<stop offset="${(i / 18 + (r() - .5) * .02).toFixed(3)}" stop-color="${dark ? '#000' : '#fff'}" stop-opacity="${dark ? (.14 + r() * .12).toFixed(2) : (.04 + r() * .06).toFixed(2)}"/>`);
  }
  const fringe = [];
  for (let x = left + 3; x < right - 2; x += 4.5) {
    const y0 = by(x) - 1, len = 24 + r() * 12;
    fringe.push(`<path d="M${x.toFixed(1)} ${y0.toFixed(1)} q${(r() - .5) * 4} ${len / 2} ${(r() - .5) * 6} ${len.toFixed(1)}" />`);
  }
  return wrap(W, H, `<defs>${GRAIN}
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EFE8DD"/><stop offset=".86" stop-color="#E0D5C5"/><stop offset=".86" stop-color="#CDBFAB"/><stop offset="1" stop-color="#C2B39D"/></linearGradient>
    <radialGradient id="light" cx=".28" cy=".18" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="folds" x1="0" y1="0" x2="1" y2="0">${stops.join('')}</linearGradient>
    <linearGradient id="topshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".12" stop-color="#000" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    ${fieldPattern('field', p, 1.15)}${borderPattern('border', p, 1.1)}
    <clipPath id="cloth"><path d="${drape}"/></clipPath></defs>
    <rect width="${W}" height="${H}" fill="url(#wall)"/><rect width="${W}" height="${H}" fill="url(#light)"/>
    <path d="${drape}" fill="#3a2a20" opacity=".28" filter="url(#soft)" transform="translate(22 26)"/>
    <g clip-path="url(#cloth)">
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#field)"/>
      <path d="${band(26, 64)}" fill="url(#border)"/>
      <path d="${band(70, 74)}" fill="${a}" opacity=".9"/>
      <path d="M${L0 + 16} ${top} L${L0 + 44} ${top} L${left + 44} ${base - 64} L${left + 16} ${base - 64} Z" fill="url(#border)" opacity=".95"/>
      <path d="M${R0 - 44} ${top} L${R0 - 16} ${top} L${right - 16} ${base - 64} L${right - 44} ${base - 64} Z" fill="url(#border)" opacity=".95"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#folds)"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#topshade)"/>
    </g>
    <g stroke="${shade(g, -.18)}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".95">${fringe.join('')}</g>
    <line x1="${L0 - 70}" y1="${top - 4}" x2="${R0 + 70}" y2="${top - 4}" stroke="#7E6040" stroke-width="7" stroke-linecap="round"/>
    <circle cx="${L0 - 74}" cy="${top - 4}" r="9" fill="#8E6D48"/><circle cx="${R0 + 74}" cy="${top - 4}" r="9" fill="#8E6D48"/>
    ${signature(brand, 56, 968, '#5E5245', 16)}
    <text x="${W - 56}" y="968" font-family="${SERIF}" font-style="italic" font-size="24" fill="#5E5245" text-anchor="end">${esc(p.name)}</text>`);
}

export function detailSVG(p) {
  const { g, a } = palette(p);
  const r = seeded(p.id + 'd');
  const fringe = [];
  for (let x = -260; x < 1300; x += 7) fringe.push(`<path d="M${x} 790 q${(r() - .5) * 6} 50 ${(r() - .5) * 10} ${(90 + r() * 30).toFixed(0)}"/>`);
  return wrap(1000, 1000, `<defs>${GRAIN}
    ${fieldPattern('field', p, 2.6)}${borderPattern('border', p, 2.6)}
    <pattern id="twill" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="scale(1.6)"><path d="M0 6 L6 0" stroke="#000" stroke-opacity=".07" stroke-width="1.2"/></pattern>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
    <radialGradient id="vig" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></radialGradient></defs>
    <rect width="1000" height="1000" fill="#CFC2AE"/>
    <g transform="rotate(-12 500 500)">
      <rect x="-300" y="-400" width="1600" height="1100" fill="url(#field)"/>
      <rect x="-300" y="-400" width="1600" height="1100" fill="url(#twill)"/>
      <rect x="-300" y="660" width="1600" height="130" fill="url(#border)"/>
      <rect x="-300" y="652" width="1600" height="6" fill="${a}"/>
      <g stroke="${shade(g, -.2)}" stroke-width="2.6" fill="none" stroke-linecap="round">${fringe.join('')}</g>
    </g>
    <rect width="1000" height="1000" fill="url(#sheen)"/><rect width="1000" height="1000" fill="url(#vig)"/>`);
}

export function flatSVG(p, brand) {
  const { g, a } = palette(p);
  const r = seeded(p.id + 'f');
  const X = 170, Y = 120, W = 460, H = 760;
  const fringe = (y, dir) => {
    const out = [];
    for (let x = X + 4; x < X + W - 2; x += 5) out.push(`<path d="M${x} ${y} q${(r() - .5) * 3} ${dir * 10} ${(r() - .5) * 4} ${dir * (18 + r() * 8)}"/>`);
    return out.join('');
  };
  return wrap(800, 1000, `<defs>${GRAIN}
    ${fieldPattern('field', p, .9)}${borderPattern('border', p, .8)}
    <pattern id="linen" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#E9E2D6"/><path d="M0 2.5 H5 M2.5 0 V5" stroke="#D9D0C2" stroke-width=".8"/></pattern>
    <linearGradient id="crease" x1="0" y1="0" x2="0" y2="1"><stop offset=".48" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".12"/><stop offset=".52" stop-color="#fff" stop-opacity=".08"/><stop offset=".56" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
    <rect width="800" height="1000" fill="url(#linen)"/>
    <g transform="rotate(-2.5 400 500)">
      <rect x="${X + 10}" y="${Y + 16}" width="${W}" height="${H}" fill="#3a2a20" opacity=".25" filter="url(#soft)"/>
      <rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#field)"/>
      <rect x="${X}" y="${Y + 14}" width="${W}" height="44" fill="url(#border)"/>
      <rect x="${X}" y="${Y + H - 58}" width="${W}" height="44" fill="url(#border)"/>
      <rect x="${X + 12}" y="${Y + 58}" width="26" height="${H - 116}" fill="url(#border)" opacity=".9"/>
      <rect x="${X + W - 38}" y="${Y + 58}" width="26" height="${H - 116}" fill="url(#border)" opacity=".9"/>
      <rect x="${X}" y="${Y + 62}" width="${W}" height="3" fill="${a}" opacity=".85"/><rect x="${X}" y="${Y + H - 65}" width="${W}" height="3" fill="${a}" opacity=".85"/>
      <rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="url(#crease)"/>
      <g stroke="${shade(g, -.2)}" stroke-width="1.4" fill="none" stroke-linecap="round">${fringe(Y, -1)}${fringe(Y + H, 1)}</g>
    </g>
    ${signature(brand, 400, 968, '#6B5E50', 14, 'middle')}`);
}

// ---------- brand pictures ----------

export function brandCoverSVG(brand, tagline) {
  return wrap(1200, 628, `<defs>${GRAIN}
    <radialGradient id="bg" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="#6E1C2C"/><stop offset="1" stop-color="#3E0E19"/></radialGradient>
    <pattern id="wm" width="120" height="150" patternUnits="userSpaceOnUse"><path d="${BOTEH}" fill="none" stroke="#E2C48A" stroke-opacity=".10" stroke-width="1" transform="translate(30 30) scale(1.4)"/><path d="${BOTEH}" fill="none" stroke="#E2C48A" stroke-opacity=".07" stroke-width="1" transform="translate(110 110) scale(-.9 .9)"/></pattern></defs>
    <rect width="1200" height="628" fill="url(#bg)"/><rect width="1200" height="628" fill="url(#wm)"/>
    <rect x="34" y="34" width="1132" height="560" fill="none" stroke="#C9A35E" stroke-opacity=".55" stroke-width="1.2"/>
    <rect x="44" y="44" width="1112" height="540" fill="none" stroke="#C9A35E" stroke-opacity=".3" stroke-width=".8"/>
    <text x="600" y="300" font-family="${SERIF}" font-size="104" letter-spacing="30" fill="#F2E4C8" text-anchor="middle">${esc(brand.toUpperCase())}</text>
    <line x1="470" y1="350" x2="730" y2="350" stroke="#C9A35E" stroke-width="1"/>
    <path d="M600 343 l7 7 -7 7 -7 -7z" fill="#C9A35E"/>
    <text x="600" y="400" font-family="${SERIF}" font-size="20" letter-spacing="7" fill="#D9BE8A" text-anchor="middle">${esc(tagline.toUpperCase())}</text>`);
}

export function collectionCoverSVG(col, piece, brand) {
  const words = col.name.split(' ');
  const lines = col.name.length > 14 && words.length > 1 ? [words.slice(0, -1).join(' '), words.at(-1)] : [col.name];
  const { a } = palette(piece || {});
  return wrap(1200, 628, `<defs>${GRAIN}${fieldPattern('field', piece || {}, 1.6)}${borderPattern('border', piece || {}, 1.6)}
    <linearGradient id="folds" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".25" stop-color="#fff" stop-opacity=".06"/><stop offset=".45" stop-color="#000" stop-opacity=".16"/><stop offset=".7" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>
    <rect width="1200" height="628" fill="#F5EFE5"/>
    <rect width="620" height="628" fill="url(#field)"/>
    <rect x="0" y="520" width="620" height="70" fill="url(#border)"/><rect x="0" y="512" width="620" height="4" fill="${a}"/>
    <rect width="620" height="628" fill="url(#folds)"/>
    <text x="700" y="210" font-family="${SERIF}" font-size="16" letter-spacing="7" fill="#A8854A">THE COLLECTION</text>
    ${lines.map((l, i) => `<text x="696" y="${290 + i * 70}" font-family="${SERIF}" font-size="62" fill="#2B201A">${esc(l)}</text>`).join('')}
    <text x="700" y="${300 + lines.length * 70}" font-family="${SERIF}" font-style="italic" font-size="24" fill="#6B5E50">${esc(col.line)}</text>
    ${signature(brand, 700, 570, '#8A7B6A', 14)}`);
}

export function presentationSVG(brand) {
  return wrap(1200, 628, `<defs>${GRAIN}
    <pattern id="linen" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#ECE4D6"/><path d="M0 3 H6 M3 0 V6" stroke="#DED3C2" stroke-width=".9"/></pattern>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6B4A2F"/><stop offset=".5" stop-color="#553923"/><stop offset="1" stop-color="#3F2918"/></linearGradient>
    <pattern id="grainwood" width="160" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 C40 2 80 10 160 5" stroke="#2E1D10" stroke-opacity=".25" fill="none"/></pattern></defs>
    <rect width="1200" height="628" fill="#F4EEE4"/>
    <g transform="translate(150 150)">
      <rect x="12" y="22" width="360" height="250" fill="#000" opacity=".16" filter="url(#soft)"/>
      <rect width="360" height="250" fill="url(#linen)" stroke="#D6CAB6"/>
      <rect x="160" y="0" width="40" height="250" fill="#6E1E2C"/><rect x="0" y="105" width="360" height="40" fill="#6E1E2C"/>
      <ellipse cx="158" cy="125" rx="34" ry="16" fill="#7D2535" transform="rotate(-18 158 125)"/><ellipse cx="202" cy="125" rx="34" ry="16" fill="#7D2535" transform="rotate(18 202 125)"/>
      <circle cx="180" cy="125" r="12" fill="#5E1724"/>
      <text x="180" y="320" font-family="${SERIF}" font-size="26" fill="#2B201A" text-anchor="middle">Signature box</text>
      <text x="180" y="352" font-family="${SERIF}" font-style="italic" font-size="19" fill="#6B5E50" text-anchor="middle">complimentary</text>
    </g>
    <g transform="translate(680 160)">
      <rect x="12" y="22" width="370" height="240" fill="#000" opacity=".2" filter="url(#soft)"/>
      <rect width="370" height="240" rx="6" fill="url(#wood)"/><rect width="370" height="240" rx="6" fill="url(#grainwood)"/>
      <rect x="18" y="18" width="334" height="204" rx="4" fill="none" stroke="#C9A35E" stroke-opacity=".55" stroke-width="2"/>
      <path d="${BOTEH}" fill="none" stroke="#C9A35E" stroke-opacity=".6" stroke-width="1.4" transform="translate(160 70) scale(1.4)"/>
      <rect x="168" y="214" width="34" height="14" rx="2" fill="#B8935A"/>
      <text x="185" y="310" font-family="${SERIF}" font-size="26" fill="#2B201A" text-anchor="middle">Walnut chest</text>
      <text x="185" y="342" font-family="${SERIF}" font-style="italic" font-size="19" fill="#6B5E50" text-anchor="middle">hand-carved in Srinagar</text>
    </g>
    ${signature(brand, 600, 590, '#8A7B6A', 13, 'middle')}`);
}

export function wrapSVG(p, brand) {
  const { a } = palette(p);
  return wrap(800, 800, `<defs>${GRAIN}${fieldPattern('field', p, 1.1)}${borderPattern('border', p, 1)}
    <pattern id="table" width="200" height="14" patternUnits="userSpaceOnUse"><rect width="200" height="14" fill="#B79A78"/><path d="M0 7 C60 3 120 11 200 6" stroke="#8F7456" stroke-opacity=".35" fill="none"/></pattern>
    <linearGradient id="tissue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EDE7DD"/></linearGradient></defs>
    <rect width="800" height="800" fill="url(#table)"/>
    <rect x="128" y="138" width="560" height="540" fill="#000" opacity=".25" filter="url(#soft)"/>
    <rect x="110" y="120" width="560" height="540" fill="#EEE6D8" stroke="#D7CAB5"/>
    <path d="M130 140 L400 170 L650 138 L640 640 L380 610 L132 642 Z" fill="url(#tissue)"/>
    <g transform="rotate(-4 400 390)">
      <rect x="215" y="215" width="370" height="330" fill="url(#field)"/>
      <rect x="215" y="470" width="370" height="54" fill="url(#border)"/><rect x="215" y="464" width="370" height="4" fill="${a}"/>
      <rect x="215" y="215" width="370" height="330" fill="#000" opacity=".06"/>
    </g>
    <path d="M130 140 L310 400 L132 642 Z" fill="#F6F2EB" opacity=".92"/><path d="M650 138 L470 390 L640 640 Z" fill="#F3EEE6" opacity=".92"/>
    <rect x="370" y="120" width="34" height="540" fill="#6E1E2C"/>
    <ellipse cx="362" cy="392" rx="44" ry="20" fill="#7D2535" transform="rotate(-20 362 392)"/><ellipse cx="412" cy="392" rx="44" ry="20" fill="#7D2535" transform="rotate(20 412 392)"/>
    <circle cx="387" cy="392" r="14" fill="#5E1724"/>
    <g transform="rotate(6 560 590)"><rect x="470" y="540" width="200" height="120" fill="#FBF7EF" stroke="#E2D8C6"/>
    <text x="570" y="610" font-family="${SCRIPT}" font-size="34" fill="#3B2A22" text-anchor="middle">with love</text></g>
    ${signature(brand, 140, 740, '#3B2A22', 14)}`);
}

export function avatarSVG(brand) {
  const letter = esc(brand.trim()[0] || 'D');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
    <defs><radialGradient id="bg" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#7A2132"/><stop offset="1" stop-color="#4A111D"/></radialGradient></defs>
    <rect width="256" height="256" fill="url(#bg)"/>
    <circle cx="128" cy="128" r="104" fill="none" stroke="#C9A35E" stroke-opacity=".7" stroke-width="2"/>
    <text x="128" y="160" font-family="${SERIF}" font-size="104" fill="#F2E4C8" text-anchor="middle">${letter}</text></svg>`;
}
