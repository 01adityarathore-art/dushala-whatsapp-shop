// The connector to Meta's official WhatsApp Cloud API.
// It turns the bot's messages into the exact JSON WhatsApp expects, sends them, and reads what WhatsApp
// sends back (messages, taps, addresses, payments). It stays switched off until the keys are in .env.
//
// Payload shapes follow Meta's Cloud API docs (interactive button/list/cta_url, address_message and
// India order_details payments). Check them once against the live docs when the number is connected.

const offset = 100; // WhatsApp money = paise with offset 100

export function createWhatsApp({ env, resolveMedia, resolveDoc, log = () => {} }) {
  const enabled = Boolean(env.WA_TOKEN && env.WA_PHONE_ID);
  const version = env.WA_API_VERSION || 'v23.0';
  const endpoint = `https://graph.facebook.com/${version}/${env.WA_PHONE_ID}/messages`;

  function header(h) {
    if (!h) return undefined;
    if (h.type === 'text') return { type: 'text', text: h.text };
    if (h.type === 'image') {
      const m = resolveMedia(h.media);
      return m.photo ? { type: 'image', image: { link: m.url } } : undefined;
    }
    return undefined;
  }

  // One bot message -> one Cloud API request body. Returns { payload, notes }.
  function toPayload(to, msg, { windowOpen = true } = {}) {
    const notes = [];
    const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };

    if (!windowOpen) {
      if (!msg.template) return { payload: null, notes: ['Outside the 24-hour window and no template for this message: not sent'] };
      const components = [];
      if (msg.type === 'image') {
        const m = resolveMedia(msg.media);
        if (m.photo) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: m.url } }] });
      }
      components.push({ type: 'body', parameters: (msg.template.params || []).map((t) => ({ type: 'text', text: String(t) })) });
      if (msg.type === 'cta') {
        const awb = (msg.button.url.split('awb=')[1] || '').slice(0, 30);
        components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: awb || '-' }] });
      }
      notes.push(`Sent as approved template "${msg.template.name}" (the client hasn't written in 24 hours)`);
      return { payload: { ...base, type: 'template', template: { name: msg.template.name, language: { code: 'en' }, components } }, notes };
    }

    switch (msg.type) {
      case 'text':
        return { payload: { ...base, type: 'text', text: { body: msg.body, preview_url: false } }, notes };
      case 'image': {
        const m = resolveMedia(msg.media);
        if (!m.photo) {
          notes.push('No real photo yet for this picture, so the caption goes as text. Add the photo to photos/.');
          return { payload: { ...base, type: 'text', text: { body: msg.caption || '' } }, notes };
        }
        return { payload: { ...base, type: 'image', image: { link: m.url, caption: msg.caption } }, notes };
      }
      case 'document': {
        const d = resolveDoc(msg.doc);
        return { payload: { ...base, type: 'document', document: { link: d.pdfUrl, filename: msg.filename, caption: msg.caption } }, notes };
      }
      case 'buttons': {
        const h = header(msg.header);
        if (msg.header && !h) notes.push('Header picture left out until a real photo exists');
        return {
          payload: {
            ...base, type: 'interactive',
            interactive: {
              type: 'button', ...(h ? { header: h } : {}), body: { text: msg.body }, ...(msg.footer ? { footer: { text: msg.footer } } : {}),
              action: { buttons: msg.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
            },
          }, notes,
        };
      }
      case 'list':
        return {
          payload: {
            ...base, type: 'interactive',
            interactive: {
              type: 'list', ...(msg.header?.type === 'text' ? { header: { type: 'text', text: msg.header.text } } : {}),
              body: { text: msg.body }, ...(msg.footer ? { footer: { text: msg.footer } } : {}),
              action: {
                button: msg.button,
                sections: msg.sections.map((s) => ({ title: s.title, rows: s.rows.map((r) => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })) })),
              },
            },
          }, notes,
        };
      case 'cta':
        return {
          payload: {
            ...base, type: 'interactive',
            interactive: {
              type: 'cta_url', body: { text: msg.body }, ...(msg.footer ? { footer: { text: msg.footer } } : {}),
              action: { name: 'cta_url', parameters: { display_text: msg.button.title, url: msg.button.url } },
            },
          }, notes,
        };
      case 'carousel': {
        const cards = msg.cards.map((card, i) => {
          const m = resolveMedia(card.media);
          return {
            card_index: i, type: 'cta_url',
            header: { type: 'image', image: { link: m.url } },
            body: { text: card.body },
            action: { buttons: card.buttons.map((b) => ({ type: 'quick_reply', quick_reply: { id: b.id, title: b.title } })) },
          };
        });
        if (msg.cards.some((card) => !resolveMedia(card.media).photo)) notes.push('Some cards have no real photo yet; WhatsApp needs JPG or PNG photos');
        return { payload: { ...base, type: 'interactive', interactive: { type: 'carousel', body: { text: msg.body }, action: { cards } } }, notes };
      }
      case 'flow': {
        const id = env[`FLOW_${msg.flow.name.toUpperCase()}_ID`];
        if (!id) notes.push(`FLOW_${msg.flow.name.toUpperCase()}_ID is not set: upload flows/${msg.flow.name}.json in WhatsApp Manager first`);
        return {
          payload: {
            ...base, type: 'interactive',
            interactive: {
              type: 'flow', body: { text: msg.body }, ...(msg.footer ? { footer: { text: msg.footer } } : {}),
              action: {
                name: 'flow',
                parameters: {
                  flow_message_version: '3', flow_token: msg.flow.token, flow_id: id || 'not-set', flow_cta: msg.button,
                  flow_action: 'navigate', flow_action_payload: { screen: msg.flow.name === 'gift_finder' ? 'GIFT' : 'OPTIONS', data: msg.flow.data },
                },
              },
            },
          }, notes,
        };
      }
      case 'catalog':
        return {
          payload: {
            ...base, type: 'interactive',
            interactive: {
              type: 'catalog_message', body: { text: msg.body }, ...(msg.footer ? { footer: { text: msg.footer } } : {}),
              action: { name: 'catalog_message', ...(msg.thumbnail ? { parameters: { thumbnail_product_retailer_id: msg.thumbnail } } : {}) },
            },
          }, notes,
        };
      case 'address':
        return {
          payload: {
            ...base, type: 'interactive',
            interactive: {
              type: 'address_message', body: { text: msg.body },
              action: {
                name: 'address_message',
                parameters: {
                  country: 'IN',
                  ...(msg.saved?.length ? {
                    saved_addresses: msg.saved.map((a, i) => ({
                      id: `saved-${i}`,
                      value: { name: a.name, phone_number: a.phone, in_pin_code: a.pin, house_number: a.house, building_name: a.building || '', address: a.area || '', landmark_area: a.landmark || '', city: a.city, state: a.state },
                    })),
                  } : {}),
                },
              },
            },
          }, notes,
        };
      case 'order': {
        const o = msg.order;
        const items = [
          ...o.items.map((it) => ({ retailer_id: it.id, name: it.name, amount: { value: it.price * offset, offset }, quantity: 1 })),
          ...o.extras.map((x, i) => ({ retailer_id: `extra-${i}`, name: x.name, amount: { value: x.price * offset, offset }, quantity: 1 })),
        ];
        const subtotal = items.reduce((s, it) => s + it.amount.value, 0);
        if (!env.RAZORPAY_CONFIG_NAME) notes.push('RAZORPAY_CONFIG_NAME is not set: payments will fail until Razorpay is linked in WhatsApp Manager');
        return {
          payload: {
            ...base, type: 'interactive',
            interactive: {
              type: 'order_details', body: { text: msg.body }, ...(msg.footer ? { footer: { text: msg.footer } } : {}),
              action: {
                name: 'review_and_pay',
                parameters: {
                  reference_id: o.ref,
                  type: 'physical-goods',
                  payment_settings: [{
                    type: 'payment_gateway',
                    payment_gateway: { type: 'razorpay', configuration_name: env.RAZORPAY_CONFIG_NAME || 'not-set', razorpay: { receipt: o.ref, notes: { order: o.ref } } },
                  }],
                  currency: 'INR',
                  total_amount: { value: o.total * offset, offset },
                  order: {
                    status: 'pending', items,
                    subtotal: { value: subtotal, offset },
                    tax: { value: 0, offset, description: `GST ${o.gstRate}% included in price` },
                    shipping: { value: 0, offset, description: 'Insured delivery, complimentary' },
                  },
                },
              },
            },
          }, notes,
        };
      }
      default:
        return { payload: null, notes: [`Unknown message type ${msg.type}`] };
    }
  }

  async function post(body) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${json.error?.message || 'error'}`);
    return json;
  }

  async function send(payload) {
    if (!enabled) throw new Error('WhatsApp keys are not set');
    return post(payload);
  }

  // Shows "typing…" to the client and marks their message as read.
  async function typing(messageId) {
    if (!enabled || !messageId) return;
    try { await post({ messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }); }
    catch (e) { log(`typing indicator: ${e.message}`); }
  }

  function addressFrom(values = {}) {
    return {
      name: values.name, phone: values.phone_number, pin: values.in_pin_code, house: values.house_number,
      building: [values.floor_number, values.tower_number, values.building_name].filter(Boolean).join(', '),
      area: values.address, landmark: values.landmark_area, city: values.city, state: values.state,
    };
  }

  // WhatsApp webhook body -> what clients did.
  function parseWebhook(json) {
    const inbound = [], payments = [];
    for (const entry of json.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages || []) {
          let event = null;
          if (m.type === 'text') event = { type: 'text', text: m.text?.body || '' };
          else if (m.type === 'interactive') {
            const it = m.interactive || {};
            if (it.type === 'button_reply') event = { type: 'reply', id: it.button_reply.id, title: it.button_reply.title };
            else if (it.type === 'list_reply') event = { type: 'reply', id: it.list_reply.id, title: it.list_reply.title };
            else if (it.type === 'nfm_reply') {
              let data = {};
              try { data = JSON.parse(it.nfm_reply?.response_json || '{}'); } catch { /* ignore */ }
              // A WhatsApp Flow answer carries our flow_token ("order_options:<client>:<piece>"); an address form doesn't.
              if (data.flow_token) event = { type: 'form', name: String(data.flow_token).split(':')[0], values: data };
              else event = { type: 'address', address: addressFrom(data.values || data) };
            }
          } else if (m.type === 'button') event = { type: 'reply', id: m.button?.payload || '', title: m.button?.text || '' };
          else if (m.type === 'order') event = { type: 'cart', items: (m.order?.product_items || []).map((x) => x.product_retailer_id) };
          else if (['image', 'video', 'document', 'audio', 'sticker'].includes(m.type)) event = { type: 'media', kind: m.type };
          else if (m.type === 'location') event = { type: 'text', text: '[shared a location]' };
          if (!event) continue;
          if (m.referral) event.referral = { headline: m.referral.headline, body: m.referral.body, sourceId: m.referral.source_id };
          // "Message business" from a product page in the WhatsApp catalogue
          if (m.context?.referred_product) event.referral = { ...(event.referral || {}), pieceId: m.context.referred_product.product_retailer_id };
          inbound.push({ from: m.from, profileName: names[m.from], messageId: m.id, event });
        }
        for (const s of v.statuses || []) {
          if (s.type !== 'payment' || !s.payment) continue;
          const tx = s.payment.transaction || {};
          const ok = s.status === 'captured' || tx.status === 'success';
          const failed = s.status === 'failed' || tx.status === 'failed';
          if (ok || failed) payments.push({ from: s.recipient_id, ref: s.payment.reference_id, status: ok ? 'captured' : 'failed', method: tx.method?.type || 'UPI' });
        }
      }
    }
    return { inbound, payments };
  }

  return { enabled, toPayload, send, typing, parseWebhook };
}

// The message templates to submit in WhatsApp Manager. They're used only when a client
// hasn't written in the last 24 hours (WhatsApp's rule for messages a business starts).
export const TEMPLATES = [
  { name: 'payment_received', category: 'UTILITY', body: 'Thank you. Your payment for order {{1}} has reached us, and {{2}} is now being prepared for you.' },
  { name: 'piece_wrapped', category: 'UTILITY', header: 'IMAGE', body: '{{1}}, being wrapped for you today.' },
  { name: 'order_dispatched', category: 'UTILITY', body: '{{1}} has left our studio, insured, with {{2}}. Expected {{3}}.', button: { type: 'URL', text: 'Track the parcel', url: 'https://www.bluedart.com/tracking?awb={{1}}' } },
  { name: 'order_delivered', category: 'UTILITY', body: '{{1}} has arrived. We hope it is everything you imagined. Reply to this message for its certificate and care guide.' },
  { name: 'gift_delivered', category: 'UTILITY', body: '{{1}} has been delivered. We hope it is received with great joy. Reply to this message for your copy of its certificate.' },
  { name: 'viewing_reminder', category: 'UTILITY', body: 'A gentle reminder: your private viewing with {{1}} is at {{2}} today. We will call you on WhatsApp, from this number.' },
  { name: 'curator_followup', category: 'UTILITY', body: '{{1}}, our curator, has replied to your enquiry. Reply to this message to read it.' },
];
