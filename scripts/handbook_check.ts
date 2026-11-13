/**
 * After importing a new edition of a school's handbook (scripts/import_handbook.swift), check its outline
 * (schools/<school>/handbookOutline.ts) against the new text and say what to change:
 *
 *   npm run handbook:check              # Kingdom Heights
 *   SCHOOL=wca npm run handbook:check
 *
 * It lists every section with the page it starts on, the sections whose starting line is gone (with the new text's
 * closest lines, to put in `starts`), and entries in the PDF's own contents that no section covers yet (a new
 * section to add, or one to note in a section's `includes`). Exits with 1 while a section is missing.
 */
import { parsePages, edition, outlineReport, type HandbookOutline } from '../src/handbook/handbook';

async function main() {
  const school = process.env.SCHOOL || 'khroyals';
  const { HANDBOOK } = await import(`../schools/${school}/handbook`) as { HANDBOOK: string };
  const { HANDBOOK_OUTLINE } = await import(`../schools/${school}/handbookOutline`) as { HANDBOOK_OUTLINE: HandbookOutline };
  const pages = parsePages(HANDBOOK);
  if (!pages.length) { console.log(`${school}: no handbook imported yet.`); return; }
  const { sections, missing, unlisted } = outlineReport(pages, HANDBOOK_OUTLINE);

  console.log(`${school}: ${pages.length} pages${edition(pages) ? `, ${edition(pages)}` : ''}`);
  console.log(`\n${sections.length} sections found:`);
  let part = '';
  for (const s of sections) {
    if (s.part !== part) { part = s.part; console.log(`  ${part}`); }
    console.log(`    p.${String(s.page).padEnd(3)} ${s.title}`);
  }
  if (missing.length) {
    console.log(`\nNot found (its starting line isn't in the new text; set \`starts\` to the line it begins with now):`);
    for (const m of missing) {
      console.log(`  ${m.title}${m.starts ? ` (starts: "${m.starts}")` : ''}`);
      console.log(m.candidates.length ? m.candidates.map((c) => `      maybe: "${c.text}" (p.${c.page})`).join('\n') : '      no similar line: removed from the handbook?');
    }
  }
  if (unlisted.length) {
    console.log(`\nIn the PDF's contents but in no section yet (add a section, or list it in a section's \`includes\`):`);
    for (const u of unlisted) console.log(`  ${u}`);
  }
  if (!missing.length && !unlisted.length) console.log('\nThe outline matches this edition.');
  process.exitCode = missing.length ? 1 : 0;
}

main();
