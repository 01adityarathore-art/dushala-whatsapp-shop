// The two documents a client receives: the invoice and the certificate of authenticity.
// They are print-ready HTML pages. On the live WhatsApp number they're turned into PDFs before sending.

import { rupees, longDate, isoDay } from './format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SERIF = "'Bodoni 72', Didot, 'Iowan Old Style', Palatino, Georgia, serif";

function page(title, css, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>
*{box-sizing:border-box} body{margin:0;background:#E9E3D8;color:#2B201A;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:32px 16px}
.sheet{max-width:820px;margin:0 auto;background:#FBF8F2;box-shadow:0 20px 50px -24px rgba(43,32,26,.45)}
@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:none}.noprint{display:none}}
.noprint{max-width:820px;margin:0 auto 14px;text-align:right}.noprint button{font:600 13px/1 -apple-system,sans-serif;border:1px solid #C9B9A0;background:#fff;border-radius:999px;padding:9px 16px;cursor:pointer}
${css}</style></head><body><div class="noprint"><button onclick="window.print()">Save as PDF</button></div>${body}</body></html>`;
}

export function certificateHTML({ order, piece, brand, clientName }) {
  const p = piece;
  const css = `
.cert{padding:56px 64px;border:1px solid #C9A35E;outline:1px solid #C9A35E;outline-offset:-12px;position:relative;text-align:center}
.brand{font:400 30px/1 ${SERIF};letter-spacing:.42em;margin-right:-.42em}
.rule{width:160px;height:1px;background:#C9A35E;margin:22px auto;position:relative}.rule:after{content:"";position:absolute;left:50%;top:-4px;width:8px;height:8px;background:#C9A35E;transform:translateX(-50%) rotate(45deg)}
.kicker{font:600 12px/1 -apple-system,sans-serif;letter-spacing:.32em;color:#A8854A;text-transform:uppercase}
h1{font:400 46px/1.1 ${SERIF};margin:18px 0 6px}
.no{font:italic 22px/1.3 ${SERIF};color:#6B5E50}
dl{display:grid;grid-template-columns:1fr 1fr;gap:18px 40px;text-align:left;max-width:560px;margin:38px auto 0}
dt{font:600 11px/1 -apple-system,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#A8854A;margin-bottom:6px}
dd{margin:0;font:17px/1.4 ${SERIF}}
.seal{display:inline-block;margin-top:40px;padding:12px 20px;border:1px dashed #C9A35E;font:600 15px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em}
.sign{display:flex;justify-content:space-between;max-width:560px;margin:46px auto 0;text-align:center}
.sign div{width:220px}.sign i{display:block;font:30px/1.2 'Snell Roundhand','Apple Chancery',cursive;color:#3B2A22;min-height:40px}
.sign span{display:block;border-top:1px solid #C9B9A0;padding-top:8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6B5E50}
.foot{margin-top:36px;font-size:12.5px;color:#6B5E50}`;
  const body = `<div class="sheet"><div class="cert">
<div class="brand">${esc(brand.toUpperCase())}</div><div class="rule"></div>
<div class="kicker">Certificate of authenticity</div>
<h1>${esc(p.name)}</h1><div class="no">No. ${order.editionNo} of ${p.edition_size}</div>
<dl>
<div><dt>Material</dt><dd>${esc(p.material)}</dd></div>
<div><dt>Work</dt><dd>${esc(p.technique)}</dd></div>
<div><dt>Made by</dt><dd>${esc(p.artisan)}, ${esc(p.origin)}</dd></div>
<div><dt>Time on the loom</dt><dd>${p.hours} hours by hand</dd></div>
<div><dt>Size</dt><dd>${esc(p.size)}, ${p.weight_g} g</dd></div>
<div><dt>Completed</dt><dd>${longDate(isoDay(new Date(order.timeline.find((t) => t.status === 'paid')?.at || order.createdAt)))}</dd></div>
${p.gi_certificate ? `<div style="grid-column:1/-1"><dt>Certification</dt><dd>${esc(p.gi_certificate)}</dd></div>` : ''}
</dl>
<div class="seal">SEAL ${esc(order.serial)}</div>
<div class="sign"><div><i>${esc(p.artisan.replace(/^the /, ''))}</i><span>Artisan</span></div><div><i>${esc(brand)}</i><span>Studio</span></div></div>
<p class="foot">${clientName ? `Registered to ${esc(clientName)}. ` : ''}To register this piece or arrange its yearly care, message us on WhatsApp with the code on the seal.</p>
</div></div>`;
  return page(`${p.name} · Certificate`, css, body);
}

export function invoiceHTML({ order, piece, brand, seller, clientName }) {
  const o = order, p = piece;
  const rate = o.gst_rate || 18;
  const sameState = (o.address?.state || '').trim().toLowerCase() === (seller.state || '').trim().toLowerCase();
  const lines = [{ name: `${p.name}, No. ${o.editionNo} of ${p.edition_size}: ${p.material}, ${p.technique}`, hsn: '6214', amount: o.price }];
  if (o.extras) lines.push({ name: 'Walnut presentation chest, hand-carved', hsn: '4420', amount: o.extras });
  const taxable = (amt) => amt / (1 + rate / 100);
  const totalTaxable = lines.reduce((s, l) => s + taxable(l.amount), 0);
  const totalTax = o.total - totalTaxable;
  const money = (n) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sample = /sample/i.test(seller.gstin || '') || /sample/i.test(seller.legalName || '');
  const css = `
.inv{padding:48px 56px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:1px solid #E2D8C6;padding-bottom:24px}
.brand{font:400 26px/1 ${SERIF};letter-spacing:.38em}.muted{color:#6B5E50;font-size:13px}
h1{font:400 30px/1 ${SERIF};margin:0 0 6px;text-align:right}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}
.lbl{font:600 11px/1 -apple-system,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#A8854A;margin-bottom:8px}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #E8DFD0;font-size:14px;vertical-align:top}
th{font:600 11px/1.2 -apple-system,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6B5E50}td.r,th.r{text-align:right;white-space:nowrap}
.tot td{border:0;padding:6px 8px}.grand td{font:600 18px/1.3 ${SERIF};border-top:1px solid #C9B9A0;padding-top:12px}
.banner{background:#FBF0E2;color:#8A4B0F;border:1px solid #F0DCC0;padding:10px 14px;font-size:13px;margin-bottom:20px;border-radius:6px}`;
  const body = `<div class="sheet"><div class="inv">
${sample ? '<div class="banner">Sample layout. Replace the seller details in config.json and confirm GST treatment with your CA before going live.</div>' : ''}
<div class="top"><div><div class="brand">${esc(brand.toUpperCase())}</div><p class="muted">${esc(seller.legalName)}<br>${esc(seller.address)}<br>GSTIN ${esc(seller.gstin)}</p></div>
<div><h1>Tax invoice</h1><p class="muted" style="text-align:right">${esc(o.id)}<br>${longDate(isoDay(new Date(o.payment?.at || o.createdAt)))}<br>Paid by ${esc(o.payment?.method || '')}</p></div></div>
<div class="cols"><div><div class="lbl">Billed to</div>${esc(clientName || 'Client')}</div>
<div><div class="lbl">Delivered to</div>${o.address?.text ? esc(o.address.text) : `${esc(o.address?.name)}<br>${esc([o.address?.house, o.address?.building, o.address?.area].filter(Boolean).join(', '))}<br>${esc(o.address?.city)}, ${esc(o.address?.state)} ${esc(o.address?.pin)}`}</div></div>
<table><thead><tr><th>Item</th><th>HSN</th><th class="r">Taxable value</th><th class="r">Amount</th></tr></thead><tbody>
${lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${l.hsn}</td><td class="r">${money(taxable(l.amount))}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}
<tr><td>Signature presentation and insured delivery</td><td></td><td class="r">${money(0)}</td><td class="r">Complimentary</td></tr>
</tbody></table>
<table class="tot" style="margin-top:12px;max-width:360px;margin-left:auto">
<tr><td>Taxable value</td><td class="r">${money(totalTaxable)}</td></tr>
${sameState
    ? `<tr><td>CGST ${rate / 2}%</td><td class="r">${money(totalTax / 2)}</td></tr><tr><td>SGST ${rate / 2}%</td><td class="r">${money(totalTax / 2)}</td></tr>`
    : `<tr><td>IGST ${rate}%</td><td class="r">${money(totalTax)}</td></tr>`}
<tr class="grand"><td>Total paid</td><td class="r">${rupees(o.total)}</td></tr></table>
<p class="muted" style="margin-top:28px">Grievance officer: ${esc(seller.grievanceOfficer)}, ${esc(seller.grievanceEmail)}. Returns accepted within seven days of delivery with the numbered seal attached.</p>
</div></div>`;
  return page(`${o.id} · Invoice`, css, body);
}
