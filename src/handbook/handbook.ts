/**
 * The Student / Parent Handbook for the in-app reader, from text extracted from the
 * school's PDF (schools/<id>/handbook.ts, made by scripts/import_handbook.swift).
 * Page numbers are the PDF's. The reader shows it as its table of contents: parts and
 * their sections (schools/<id>/handbookOutline.ts), each section holding its text from
 * where its heading appears to where the next section's does (`toSections`).
 */
import { HANDBOOK, HANDBOOK_SOURCE } from '@school/handbook';
import { HANDBOOK_OUTLINE } from '@school/handbookOutline';

export { HANDBOOK_SOURCE };
export type Block = { kind: 'heading' | 'text'; text: string };
export type Page = { page: number; blocks: Block[]; plain: string };

/**
 * A school's table of contents: each part's sections, in order, and the line each one starts at (its title if none).
 * `includes`: entries in the PDF's own contents that are kept inside this section (they have no heading of their own).
 */
export type HandbookOutline = { part: string; sections: { title: string; starts?: string; includes?: string[] }[] }[];
/** A section of the handbook: its text, and the PDF page it starts on. */
export type Section = { id: string; part: string; title: string; page: number; blocks: Block[]; plain: string };

/** Lines this long were wrapped mid-paragraph in the PDF. */
const WRAPPED = 72;

/** Title Case, allowing short joining words: "Early Drop Off and Late Pick Up". */
const TITLE = /^[A-Z0-9&][\w'’/&-]*(\s+([A-Z0-9&][\w'’/&-]*|a|an|and|at|by|for|from|in|of|on|or|the|to|with))*$/;

const isHeading = (line: string) =>
  line.length <= 60 && /[A-Za-z]{2}/.test(line) && !/[.,;:!?)]$/.test(line)
  && (line === line.toUpperCase() || TITLE.test(line));

/** Rebuild paragraphs and headings from a page's wrapped lines (dropping the printed page number). */
export function toBlocks(text: string): Block[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^\d{1,3}$/.test(lines[lines.length - 1])) lines.pop();
  const blocks: Block[] = [];
  let para = '';
  const flush = () => { if (para) blocks.push({ kind: 'text', text: para }); para = ''; };
  for (const line of lines) {
    // A title line right after a finished sentence starts a new section, even if that sentence's line was long.
    if ((!para || /[.!?]$/.test(para)) && isHeading(line)) { flush(); blocks.push({ kind: 'heading', text: line }); continue; }
    para = para ? `${para} ${line}` : line;
    if (line.length < WRAPPED || line.endsWith(':')) flush();
  }
  flush();
  return blocks;
}

/** Pages from the "[Page N]"-marked handbook text. */
export function parsePages(source: string): Page[] {
  return source.split(/\[Page (\d+)\]\n/).slice(1).reduce<Page[]>((pages, part, i, all) => {
    if (i % 2 === 0) {
      const blocks = toBlocks(all[i + 1] ?? '');
      pages.push({ page: Number(part), blocks, plain: blocks.map((b) => b.text).join('\n') });
    }
    return pages;
  }, []);
}

export const PAGES = parsePages(HANDBOOK);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A case-insensitive pattern for the search text (null when it's too short to search). */
export const pattern = (query: string) => (query.trim().length >= 2 ? new RegExp(escape(query.trim()), 'gi') : null);

/** Headings and lines compared loosely: case, apostrophes, "&" for "and", and punctuation don't matter. */
export const loose = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** The page banner that repeats at the top of every page of a part ("SCHOOL LIFE & DECORUM"). */
const isBanner = (p: Page, i: number) => i === 0 && p.blocks[0]?.kind === 'heading' && p.blocks[0].text === p.blocks[0].text.toUpperCase();

/** Where the handbook's text begins: the first page with a part's banner, else the page after the contents. */
function bodyStart(pages: Page[]): number {
  const banner = pages.findIndex((p) => isBanner(p, 0));
  return banner >= 0 ? banner : pages.findIndex((p) => p.blocks.some((b) => /^(table of )?contents$/i.test(b.text))) + 1;
}

/**
 * How many sections ahead a heading may match: a section whose line isn't found (renamed in a new edition) is skipped,
 * and its text stays with the one before, instead of holding up every section after it. Kept short, so a subheading
 * that shares a later section's name ("Bullying" inside Discipline) doesn't jump ahead to it.
 */
const LOOKAHEAD = 4;

/**
 * The handbook as its sections: each starts where its line appears (in the outline's order) and runs until the next
 * one starts. Sections are looked for from where the text begins (`bodyStart`), so the contents page's own lines don't
 * count. The pages' banners are left out, and so is the starting line when it just repeats the section's title.
 * Without an outline, each page is a section.
 */
export function toSections(pages: Page[], outline: HandbookOutline): Section[] {
  const wanted = outline.flatMap((g) => g.sections.map((s) => ({ ...s, part: g.part })));
  if (!wanted.length) {
    return pages.map((p) => ({ id: `page-${p.page}`, part: '', title: `Page ${p.page}`, page: p.page, blocks: p.blocks, plain: p.plain }));
  }
  const sections: Section[] = [];
  let next = 0;
  for (const p of pages.slice(bodyStart(pages))) {
    p.blocks.forEach((b, i) => {
      const line = loose(b.text);
      const ahead = wanted.slice(next, next + LOOKAHEAD).findIndex((w) => line === loose(w.starts ?? w.title));
      if (ahead >= 0) {
        const w = wanted[next + ahead];
        sections.push({ id: `s${next + ahead}`, part: w.part, title: w.title, page: p.page, blocks: [], plain: '' });
        next += ahead + 1;
        if (isBanner(p, i) || line === loose(w.title)) return;
      } else if (isBanner(p, i)) {
        return;
      }
      sections[sections.length - 1]?.blocks.push(b);
    });
  }
  for (const s of sections) s.plain = s.blocks.map((b) => b.text).join('\n');
  return sections;
}

export const SECTIONS = toSections(PAGES, HANDBOOK_OUTLINE);

/** How many times the search appears in each section (its title too), by section id; empty when there's no search. */
export function hits(sections: Section[], query: string): Map<string, number> {
  const re = pattern(query);
  const out = new Map<string, number>();
  if (!re) return out;
  for (const s of sections) {
    const n = (`${s.title}\n${s.plain}`.match(re) ?? []).length;
    if (n) out.set(s.id, n);
  }
  return out;
}

/** Which edition this is, from the cover ("2025-2026 · Version 1.2 · updated July 30, 2026"); empty if it doesn't say. */
export function edition(pages: Page[]): string {
  const cover = pages[0]?.plain ?? '';
  const years = cover.match(/\b(20\d\d)\s*[-–]\s*(20\d\d)\b/);
  const version = cover.match(/\bVersion\s+([\d.]+)/i);
  const updated = cover.match(/\b(?:Modified|Updated|Revised)\s+([A-Z][a-z]+\.? \d{1,2}, \d{4})/);
  return [years && `${years[1]}-${years[2]}`, version && `Version ${version[1]}`, updated && `updated ${updated[1]}`].filter(Boolean).join(' · ');
}

export const EDITION = edition(PAGES);

const words = (s: string) => new Set(loose(s).split(' ').filter((w) => w.length > 2 && !['and', 'the', 'for', 'with'].includes(w)));
const likeness = (a: string, b: string) => {
  const x = words(a), y = words(b);
  const shared = [...x].filter((w) => y.has(w) || y.has(w.replace(/s$/, '')) || y.has(`${w}s`)).length;
  return shared / Math.max(1, new Set([...x, ...y]).size);
};

/**
 * For updating the outline after a new edition is imported (`npm run handbook:check`, and the test's message): the
 * sections whose line wasn't found, each with the lines of the new text most like it, and the entries in the PDF's
 * own contents that no section covers yet (perhaps a new section).
 */
export function outlineReport(pages: Page[], outline: HandbookOutline) {
  const sections = toSections(pages, outline);
  const found = new Set(sections.map((s) => s.title));
  const start = bodyStart(pages);
  const lines = pages.slice(start).flatMap((p) => p.blocks.filter((b) => b.text.length <= 90).map((b) => ({ text: b.text, page: p.page })));
  const missing = outline.flatMap((g) => g.sections).filter((s) => !found.has(s.title)).map((s) => ({
    ...s,
    candidates: lines.map((l) => ({ ...l, score: likeness(s.starts ?? s.title, l.text) })).filter((l) => l.score >= 0.34)
      .sort((a, b) => b.score - a.score).slice(0, 3).map(({ text, page }) => ({ text, page })),
  }));
  const known = new Set(outline.flatMap((g) => [g.part, ...g.sections.flatMap((s) => [s.title, s.starts ?? s.title, ...(s.includes ?? [])])]).map(loose));
  const contents = pages.slice(Math.max(0, pages.findIndex((p) => p.blocks.some((b) => /^(table of )?contents$/i.test(b.text)))), start);
  const unlisted = [...new Set(contents.flatMap((p) => p.blocks.map((b) => b.text.replace(/(\s+\d{1,3})+$/, '').trim()))
    .filter((t) => /[a-z]{3}/i.test(t) && t.length <= 60 && !/^(table of|contents)$/i.test(t) && !known.has(loose(t))))];
  return { sections, missing, unlisted };
}
