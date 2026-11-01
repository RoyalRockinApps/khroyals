#!/usr/bin/env node
/**
 * GitHub Pages' one 404 page for every school's web app (dist/ = Kingdom Heights at /khroyals,
 * dist/<school>/ = the others under it). Deep links (/khroyals/wca/page/admissions) aren't
 * files, so Pages serves 404.html: it loads the app of the school whose address it is, and
 * the app then opens the page from the address.
 *
 *   node scripts/pages_404.mjs dist
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const ROOT = join(import.meta.dirname, '..');
const bases = readdirSync(join(ROOT, 'schools'), { withFileTypes: true }).filter((d) => d.isDirectory())
  .map((d) => JSON.parse(readFileSync(join(ROOT, 'schools', d.name, 'app.json'), 'utf8')).expo.experiments.baseUrl)
  .sort((a, b) => b.length - a.length);   // longest first: /khroyals/wca before /khroyals

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Loading…</title>
<script>
(function () {
  var bases = ${JSON.stringify(bases)}, path = location.pathname, base = bases[bases.length - 1];
  for (var i = 0; i < bases.length; i++) if (path === bases[i] || path.indexOf(bases[i] + '/') === 0) { base = bases[i]; break; }
  var x = new XMLHttpRequest();
  x.open('GET', base + '/index.html', false);
  x.send();
  document.open(); document.write(x.responseText); document.close();
})();
</script></head><body></body></html>
`;
writeFileSync(join(dist, '404.html'), html);
console.log(`404.html serves ${bases.join(', ')}`);
