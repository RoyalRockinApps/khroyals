/** src/share/targets.ts: what the Share tab offers, only with public links. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareTargets, shortUrl } from '../src/share/targets';

const school = {
  appName: 'KH Royals', schoolName: 'Kingdom Heights', fullName: 'Kingdom Heights Preparatory School', newsName: 'Royal News',
  webApp: 'https://royalrockinapps.github.io/khroyals/', website: { label: 'khroyals.com', url: 'https://www.khroyals.com' },
  calendarPdf: 'https://www.khroyals.com/s/calendar.pdf', news: { title: 'November 7', url: 'https://app.smore.com/n/abc' },
};

test('the app first, then the website, the calendar and the latest issue', () => {
  assert.deepEqual(shareTargets(school).map((t) => t.key), ['app', 'website', 'calendar', 'news']);
  assert.equal(shareTargets(school)[0].headline, 'Scan to get KH Royals');
});

test('only what has a public link: no calendar PDF, an issue written in the app', () => {
  assert.deepEqual(shareTargets({ ...school, calendarPdf: null, news: { title: 'x', url: 'app:123' } }).map((t) => t.key), ['app', 'website']);
  assert.deepEqual(shareTargets({ ...school, news: null }).map((t) => t.key), ['app', 'website', 'calendar']);
});

test('short addresses read the way people type them', () => {
  assert.equal(shortUrl('https://www.khroyals.com'), 'khroyals.com');
  assert.equal(shortUrl('https://royalrockinapps.github.io/khroyals/'), 'royalrockinapps.github.io/khroyals');
});
