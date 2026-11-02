#!/usr/bin/env node
/**
 * Opens every screen of the web app in a real browser, for each school, and fails on a screen that
 * crashes (an uncaught error, React's error screen, a blank page or "Unmatched Route").
 *
 * The app is built on its bundled demo data (EXPO_PUBLIC_DEMO=1), so nothing touches a live
 * database. Screens are found from the files in app/; [id] parts get a made-up id, so screens are
 * also checked for coping with something that isn't there; then the links found on the screens are
 * followed too (a few of each kind), so the screens are also opened on real demo data.
 *
 *   npm run test:web                      # both schools
 *   SCHOOL=wca npm run test:web           # one
 *   node scripts/web_smoke.mjs --no-build # reuse the last build in .web-smoke/
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SCHOOLS } = require(path.join(root, 'schools/index.js'));
const { chromium } = require('playwright');

const build = !process.argv.includes('--no-build');
const only = process.env.SCHOOL;
const schools = only ? [only] : SCHOOLS;
const out = path.join(root, '.web-smoke');

/** The URL path of every screen in app/ (route groups dropped, [param] → a made-up id). */
export function screens(dir = path.join(root, 'app'), prefix = '') {
  const list = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      const part = /^\(.*\)$/.test(name) ? '' : `/${name.replace(/^\[.*\]$/, 'nothing-here')}`;
      list.push(...screens(full, prefix + part));
    } else if (/\.tsx$/.test(name) && !/^[_+]/.test(name)) {
      const base = name.replace(/\.tsx$/, '').replace(/^\[.*\]$/, 'nothing-here');
      list.push(base === 'index' ? prefix || '/' : `${prefix}/${base}`);
    }
  }
  return list;
}

/** Screens opened on real demo data: the demo groups and posts, and each school's website pages and news. */
function withData(id) {
  const json = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const site = path.join('schools', id, 'content/site');
  const groups = json('mock-db/comms/groups.json').groups.slice(0, 4).map((g) => g.id);
  const posts = json('mock-db/comms/posts.json').posts.slice(0, 2).map((p) => p.id);
  const pages = fs.readdirSync(path.join(root, site, 'pages')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  const news = json(path.join(site, 'news.json')).articles.slice(0, 5).map((a) => a.slug);
  return [
    ...groups.flatMap((g) => ['', '/members', '/settings', '/stats'].map((x) => `/group/${g}${x}`)),
    ...posts.map((p) => `/post-stats/${p}`),
    ...pages.map((p) => `/page/${p}`),
    ...news.map((n) => `/news/${n}`),
  ];
}

function baseUrlOf(id) {
  return JSON.parse(fs.readFileSync(path.join(root, 'schools', id, 'app.json'), 'utf8')).expo.experiments?.baseUrl ?? '';
}

function serve(dir, base) {
  const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
  const server = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]);
    if (!u.startsWith(base)) { res.statusCode = 404; return res.end(); }
    u = u.slice(base.length);
    let f = path.join(dir, path.normalize(u));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dir, 'index.html');
    res.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream');
    res.end(fs.readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// Errors from things the test can't reach (fonts, maps, videos from other sites) aren't the app's.
const outside = /net::ERR|Permissions policy violation|Failed to load resource|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|youtube|vimeo|google/i;

async function check(id) {
  const dir = path.join(out, id);
  const base = baseUrlOf(id);
  if (build) {
    console.log(`Building ${id} on demo data…`);
    fs.rmSync(dir, { recursive: true, force: true });
    execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', dir], {
      cwd: root, stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, SCHOOL: id, EXPO_PUBLIC_DEMO: '1', CI: '1' },
    });
  }
  const server = await serve(dir, base);
  const origin = `http://127.0.0.1:${server.address().port}${base}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  let errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !outside.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));

  // Every screen, then the links found on them (real demo ids), a few per kind of screen.
  const queue = [...new Set([...screens(), ...withData(id)])];
  const seen = new Set(queue);
  const perKind = new Map();
  const kindOf = (r) => r.split('/').slice(0, 2).join('/') + '/' + r.split('/').length;
  const failed = [];
  while (queue.length) {
    const route = queue.shift();
    errors = [];
    try {
      await page.goto(origin + (route === '/' ? '/' : route), { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1200);
      const text = (await page.evaluate(() => document.body.innerText)).trim();
      if (!text) errors.push('blank page');
      if (/Unmatched Route|This screen doesn't exist/i.test(text)) errors.push('Unmatched Route');
      if (/Something went wrong|Render Error|Uncaught Error/i.test(text)) errors.push(`error screen: ${text.slice(0, 200)}`);
      const links = await page.evaluate((o) => [...document.querySelectorAll('a[href]')].map((x) => x.href)
        .filter((h) => h.startsWith(o)).map((h) => h.slice(o.length).split(/[?#]/)[0].replace(/\/$/, '') || '/'), origin);
      for (const l of links) {
        const k = kindOf(l);
        if (seen.has(l) || (perKind.get(k) ?? 0) >= 3 || seen.size > 400) continue;
        seen.add(l); perKind.set(k, (perKind.get(k) ?? 0) + 1); queue.push(l);
      }
    } catch (e) {
      errors.push(String(e.message ?? e).split('\n')[0]);
    }
    if (errors.length) failed.push({ route, errors: [...new Set(errors)] });
    console.log(`${errors.length ? 'FAIL' : ' ok '} ${id} ${route}${errors.length ? `\n       ${[...new Set(errors)].join('\n       ')}` : ''}`);
  }
  await browser.close();
  server.close();
  return failed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let bad = 0;
  for (const id of schools) bad += (await check(id)).length;
  console.log(bad ? `\n${bad} screen(s) failed.` : '\nEvery screen opened.');
  process.exit(bad ? 1 : 0);
}
