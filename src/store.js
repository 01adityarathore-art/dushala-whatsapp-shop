// Everything the bot remembers. Where it's kept is up to the caller:
// a JSON file on the Mac (store-node.js), or the browser's local storage for the online demo.
// Swap for a database (Cloudflare D1, Postgres) when the shop moves online; the shape stays the same.

function fresh() {
  return {
    seq: 1040,
    clients: {},
    orders: {},
    holds: {},      // pieceId -> [{ clientId, until }]
    sold: {},       // pieceId -> pieces sold since the catalogue's "remaining" was last changed
    seenRemaining: {},
    viewings: [],
    leads: [],
    reminders: [],
    waitlist: {},   // pieceId -> [clientId]
    alerts: [],
    queue: [],      // messages held back during quiet hours
    transcripts: {},
    settings: { quietHours: true, failNextPayment: false },
  };
}

// load(): returns saved data or null. persist(data): saves it. Both optional (tests keep it in memory).
export function createStore({ load = () => null, persist = () => {} } = {}) {
  let data = fresh();
  try { const saved = load(); if (saved) data = { ...fresh(), ...saved }; } catch { /* start fresh if the saved copy is damaged */ }
  let timer = null;
  return {
    get data() { return data; },
    client(id) {
      if (!data.clients[id]) {
        data.clients[id] = {
          id, seen: false, name: null, profileName: null, createdAt: new Date().toISOString(),
          lastInboundAt: null, stage: null, ctx: {}, orders: [], addresses: [], registered: [],
          optIn: null, thread: null, shortlist: [],
        };
      }
      return data.clients[id];
    },
    nextOrderId(prefix) {
      data.seq += 1;
      return `${prefix}-${data.seq}`;
    },
    transcript(clientId) {
      if (!data.transcripts[clientId]) data.transcripts[clientId] = [];
      return data.transcripts[clientId];
    },
    addAlert(alert) {
      data.alerts.unshift(alert);
      data.alerts.length = Math.min(data.alerts.length, 200);
    },
    reset() { data = fresh(); this.save(); },
    resetClient(id) {
      delete data.clients[id];
      delete data.transcripts[id];
      this.save();
    },
    save() {
      clearTimeout(timer);
      timer = setTimeout(() => persist(data), 150);
    },
  };
}
