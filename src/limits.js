// WhatsApp's hard limits for each message type. A message that breaks one is rejected by WhatsApp,
// so every message the bot sends is checked here first (and the tests check them all).

const L = {
  text: 4096, caption: 1024, body: 1024, header: 60, footer: 60,
  buttonTitle: 20, buttons: 3, listButton: 20, rows: 10, sections: 10,
  rowTitle: 24, rowDescription: 72, sectionTitle: 24, id: 200,
};

export function check(msg) {
  const problems = [];
  const max = (value, limit, what) => {
    if (value != null && String(value).length > limit) problems.push(`${what} is ${String(value).length} characters; WhatsApp allows ${limit}`);
  };
  const need = (value, what) => { if (value == null || String(value).trim() === '') problems.push(`${what} is empty`); };

  switch (msg.type) {
    case 'text': need(msg.body, 'text'); max(msg.body, L.text, 'text'); break;
    case 'image': max(msg.caption, L.caption, 'caption'); break;
    case 'document': max(msg.caption, L.caption, 'caption'); need(msg.filename, 'filename'); break;
    case 'buttons':
      need(msg.body, 'body'); max(msg.body, L.body, 'body'); max(msg.footer, L.footer, 'footer');
      if (msg.header?.type === 'text') max(msg.header.text, L.header, 'header');
      if (!msg.buttons?.length || msg.buttons.length > L.buttons) problems.push(`${msg.buttons?.length || 0} buttons; WhatsApp allows 1 to ${L.buttons}`);
      for (const b of msg.buttons || []) { max(b.title, L.buttonTitle, `button "${b.title}"`); max(b.id, L.id, 'button id'); }
      if (new Set((msg.buttons || []).map((b) => b.id)).size !== (msg.buttons || []).length) problems.push('two buttons share an id');
      if (new Set((msg.buttons || []).map((b) => b.title)).size !== (msg.buttons || []).length) problems.push('two buttons share a title');
      break;
    case 'list': {
      need(msg.body, 'body'); max(msg.body, L.body, 'body'); max(msg.footer, L.footer, 'footer');
      if (msg.header?.type === 'text') max(msg.header.text, L.header, 'header');
      need(msg.button, 'list button'); max(msg.button, L.listButton, 'list button');
      const rows = (msg.sections || []).flatMap((s) => s.rows || []);
      if (!rows.length || rows.length > L.rows) problems.push(`${rows.length} rows; WhatsApp allows 1 to ${L.rows}`);
      if ((msg.sections || []).length > L.sections) problems.push('too many sections');
      for (const s of msg.sections || []) {
        if ((msg.sections || []).length > 1) need(s.title, 'section title');
        max(s.title, L.sectionTitle, `section "${s.title}"`);
      }
      for (const r of rows) {
        need(r.title, 'row title'); max(r.title, L.rowTitle, `row "${r.title}"`);
        max(r.description, L.rowDescription, `description of "${r.title}"`); max(r.id, L.id, 'row id');
      }
      if (new Set(rows.map((r) => r.id)).size !== rows.length) problems.push('two rows share an id');
      break;
    }
    case 'cta':
      need(msg.body, 'body'); max(msg.body, L.body, 'body'); max(msg.footer, L.footer, 'footer');
      need(msg.button?.title, 'link button'); max(msg.button?.title, L.buttonTitle, 'link button');
      if (!/^https?:\/\//.test(msg.button?.url || '')) problems.push('link must start with https://');
      break;
    case 'carousel': {
      // Meta: 2 to 10 cards, image or video header, card text up to 160 characters and 2 line breaks,
      // every card with the same number of quick-reply buttons.
      need(msg.body, 'body'); max(msg.body, L.body, 'body');
      const cards = msg.cards || [];
      if (cards.length < 2 || cards.length > 10) problems.push(`${cards.length} cards; WhatsApp allows 2 to 10`);
      const counts = new Set(cards.map((c) => (c.buttons || []).length));
      if (counts.size > 1) problems.push('cards must all have the same number of buttons');
      cards.forEach((c, i) => {
        if (!c.media) problems.push(`card ${i + 1} has no picture`);
        max(c.body, 160, `card ${i + 1} text`);
        if ((String(c.body || '').match(/\n/g) || []).length > 2) problems.push(`card ${i + 1} has more than 2 line breaks`);
        if (!c.buttons?.length || c.buttons.length > 2) problems.push(`card ${i + 1} needs 1 or 2 buttons`);
        for (const b of c.buttons || []) { max(b.title, L.buttonTitle, `card ${i + 1} button "${b.title}"`); max(b.id, 256, 'button id'); }
        if (new Set((c.buttons || []).map((b) => b.title)).size !== (c.buttons || []).length) problems.push(`card ${i + 1} has two buttons with the same title`);
      });
      break;
    }
    case 'flow':
      need(msg.body, 'body'); max(msg.body, L.body, 'body'); max(msg.footer, L.footer, 'footer');
      need(msg.button, 'form button'); max(msg.button, L.buttonTitle, 'form button');
      if (!msg.flow?.name) problems.push('form has no name');
      break;
    case 'catalog':
      need(msg.body, 'body'); max(msg.body, L.body, 'body'); max(msg.footer, L.footer, 'footer');
      break;
    case 'address': need(msg.body, 'body'); max(msg.body, L.body, 'body'); break;
    case 'order':
      need(msg.body, 'body'); max(msg.body, L.body, 'body'); max(msg.footer, L.footer, 'footer');
      if (!msg.order?.ref || msg.order.ref.length > 35) problems.push('order reference must be 1 to 35 characters');
      if (!(msg.order?.total > 0)) problems.push('order total must be above zero');
      break;
    default: problems.push(`unknown message type "${msg.type}"`);
  }
  return problems;
}
