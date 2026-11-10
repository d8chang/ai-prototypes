// Sends Reset v2 reminders. Runs every 15 minutes from GitHub Actions.
// Reads the device list from the Reset v2 reminders Apps Script, sends each device that is due,
// then reports back which were sent and which devices are gone.
import webpush from 'web-push';

const { PUSH_URL, PUSH_KEY, VAPID_PUBLIC, VAPID_PRIVATE, TEST_ID } = process.env;
if (!PUSH_URL || !PUSH_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) { console.log('Missing settings; nothing to do.'); process.exit(0); }
webpush.setVapidDetails('https://d8chang.github.io/ai-prototypes/reset/', VAPID_PUBLIC, VAPID_PRIVATE);

const DAYS = { daily: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], weekdays: ['Mon','Tue','Wed','Thu','Fri'], mwf: ['Mon','Wed','Fri'] };
const WINDOW_MIN = 180; // send up to 3 hours late if a run was skipped, never twice a day

function local(tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour) * 60 + (+p.minute), weekday: p.weekday };
}
function dayOfYear(date) { const d = new Date(date + 'T00:00:00Z'); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5); }
async function post(body) { return fetch(PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ ...body, key: PUSH_KEY }) }); }

const res = await fetch(`${PUSH_URL}?key=${encodeURIComponent(PUSH_KEY)}`);
const { subs = [] } = await res.json();
const sent = [], gone = [];
for (const s of subs) {
  let tz = s.tz; try { local(tz); } catch { tz = 'America/Los_Angeles'; }
  const t = local(tz);
  const [h, m] = String(s.time).split(':').map(Number);
  const target = h * 60 + m;
  const due = TEST_ID ? (TEST_ID === 'all' || TEST_ID === s.id)
    : (DAYS[s.freq] || DAYS.daily).includes(t.weekday) && t.minutes >= target && t.minutes < target + WINDOW_MIN && String(s.last).slice(0, 10) !== t.date;
  if (!due) continue;
  try {
    await webpush.sendNotification(s.sub, JSON.stringify({ n: dayOfYear(t.date) }), { TTL: 3 * 3600, urgency: 'normal' });
    if (!TEST_ID) sent.push({ id: s.id, date: t.date });
    console.log('sent', s.id.slice(0, 4));
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.id);
    console.log('failed', s.id.slice(0, 4), e.statusCode || e.message);
  }
}
if (sent.length) await post({ action: 'sent', ids: sent });
if (gone.length) await post({ action: 'remove', ids: gone });
console.log(`devices ${subs.length}, sent ${sent.length}${TEST_ID ? ' (test)' : ''}, removed ${gone.length}`);
