// Small helpers for dates (always India time), money and words.

const TZ = 'Asia/Kolkata';
const IST_OFFSET_MIN = 330;

export function ist(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { y: +get('year'), m: +get('month'), d: +get('day'), h: +get('hour'), min: +get('minute'), weekday: get('weekday') };
}

// A Date for a wall-clock moment in India.
export function istDate(y, m, d, h = 0, min = 0) {
  return new Date(Date.UTC(y, m - 1, d, h, min) - IST_OFFSET_MIN * 60000);
}

export function isoDay(date) {
  const t = ist(date);
  return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function dayDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

// "Thursday, 6 November"
export function longDate(day) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(dayDate(day));
}

// "Thu 6 Nov"
export function shortDate(day) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(dayDate(day));
}

// "Today", "Tomorrow" or "Thursday, 6 November"
export function relativeDay(day, now) {
  const today = isoDay(now);
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  return longDate(day);
}

// "11:00 am"
export function clockTime(h, min = 0) {
  const suffix = h < 12 ? 'am' : 'pm';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(min).padStart(2, '0')} ${suffix}`;
}

export function greeting(now) {
  const h = ist(now).h;
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function partOfDay(now) {
  const h = ist(now).h;
  if (h >= 5 && h < 12) return 'this morning';
  if (h >= 12 && h < 17) return 'this afternoon';
  return 'this evening';
}

export function rupees(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// 4 → "four", 23 → "twenty-three"; larger numbers stay as digits.
export function word(n) {
  if (n < 20) return SMALL[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + SMALL[n % 10] : '');
  return String(n);
}

export function capital(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// "Meera ✨ K." → "Meera". Returns null when the profile name isn't a usable first name.
export function firstName(profileName) {
  if (!profileName) return null;
  const cleaned = String(profileName).replace(/[^\p{L}\s'-]/gu, ' ').trim();
  const first = cleaned.split(/\s+/)[0] || '';
  if (first.length < 2 || first.length > 20) return null;
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

export function minutesBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 60000);
}
