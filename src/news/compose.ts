/**
 * Writing a newsletter issue in the app: text typed or pasted (from the newsletter email or its
 * web page) becomes the issue's blocks, the same shapes a Smore import makes. Blank lines separate
 * items; an item's first line is its title when it's short and doesn't end like a sentence; a short
 * item on its own ("Important / Information") is a section heading; web addresses become links.
 * Smore's page furniture (Loading indicator, Powered by…) and the repeated title and date are dropped.
 * No app imports, so tests run it.
 */
import type { NewsBlock, Span } from '../../supabase/functions/import-newsletter/smore';

const NOISE = /^(page background|smore|use smore to create beautiful newsletters|loading indicator|close|powered by)$/i;
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s)]+[^\s).,!?])/gi;

/** A short line that doesn't end like a sentence: a title or a heading. */
const titleLike = (l: string) => l.length <= 60 && !/[.!?:,;]$/.test(l) && !/^(https?:\/\/|www\.)/i.test(l);

/** Text with its web addresses as links. */
export function spans(text: string): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    const url = m[1];
    out.push({ text: url, href: url.startsWith('www.') ? `https://${url}` : url });
    at = m.index! + url.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out.length ? out : [{ text }];
}

/** The issue's blocks from typed or pasted text; `title` and `date` (as written) are dropped where repeated. */
export function composeIssue(text: string, repeated: string[] = []): NewsBlock[] {
  const skip = new Set(repeated.map((r) => r.trim().toLowerCase()).filter(Boolean));
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim())
    .filter((l) => !NOISE.test(l) && !skip.has(l.toLowerCase()));
  // Items: runs of lines between blank lines.
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l) cur.push(l);
    else if (cur.length) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);

  const blocks: NewsBlock[] = [];
  for (const g of groups) {
    if (g.every(titleLike) && g.length <= 3) {
      // A short group on its own: a heading if the next thing is a titled item, else a short note.
      blocks.push({ kind: 'heading', text: g.join(' ') });
      continue;
    }
    // Short lines before the text: the last one is the item's title, any before it a section heading
    // ("Important / Information / Book Fair 📚 / The Book Fair will…").
    let k = 0;
    while (k < g.length - 1 && titleLike(g[k])) k++;
    if (k >= 2) { blocks.push({ kind: 'heading', text: g.slice(0, k - 1).join(' ') }); g.splice(0, k - 1); }
    const titled = k >= 1;
    const body = (titled ? g.slice(1) : g).map(spans);
    const last = blocks[blocks.length - 1];
    // Untitled paragraphs in a row are one card (an intro or a closing note).
    if (!titled && last?.kind === 'text' && !last.title) last.paragraphs.push(...body);
    else blocks.push({ kind: 'text', title: titled ? g[0] : null, paragraphs: body });
  }
  // A heading with nothing after it is just a short paragraph.
  return blocks.map((b, i) => (b.kind === 'heading' && (i === blocks.length - 1)
    ? { kind: 'text', title: null, paragraphs: [spans(b.text)] } : b));
}

/** An issue's blocks back as text, to change a written issue (composeIssue reads it back the same way). */
export function issueText(blocks: NewsBlock[]): string {
  return blocks.map((b) => {
    if (b.kind === 'heading') return b.text;
    if (b.kind === 'image') return b.src;
    return [b.title, ...b.paragraphs.map((p) => p.map((s) => s.text).join(''))].filter(Boolean).join('\n');
  }).join('\n\n');
}
