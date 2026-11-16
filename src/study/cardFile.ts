/**
 * Flash cards from a file (Add cards → A list or file → Choose a file; picked by src/study/pickCardFile.ts): a text file
 * with a "term - meaning" line per card (a Quizlet export is "term<tab>meaning"), or a spreadsheet saved as CSV (or
 * tab-separated), the term in its first column and the meaning in its second. A header row ("Term, Definition") is
 * skipped. It becomes the paste box's text, a "term<tab>meaning" line per row, so the student sees the cards found
 * (src/study/parse.ts) and can fix them before adding. No app imports, so tests run it.
 */

/** The most text read from a file: far more than 500 cards. */
export const CARD_FILE_MAX_KB = 1024;

/** Kinds of file it reads, by extension. */
export const CARD_FILE_EXTS = ['txt', 'csv', 'tsv'] as const;

export const extOf = (name: string) => (name.split(/[?#]/)[0].split('.').pop() ?? '').toLowerCase();

/** A CSV's rows: commas (or `sep`) between cells, quoted cells may hold commas, quotes ("") and line breaks. */
export function csvRows(text: string, sep = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
    } else if (c === '"' && cell.trim() === '') { quoted = true; cell = ''; }
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** The separator in a spreadsheet file: a tab, or else whichever of comma and semicolon its first line has more of. */
function separatorOf(text: string, ext: string): string {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  if (ext === 'tsv' || first.includes('\t')) return '\t';
  const count = (ch: string) => first.split(ch).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

const HEAD_FRONT = /^(term|word|front|question|vocab|vocabulary|prompt|card|english|spanish|french|latin)s?$/i;
const HEAD_BACK = /^(definition|meaning|back|answer|translation|description|english|spanish|french|latin)s?$/i;
/** One line of text: no line breaks or tabs inside a cell. */
const flat = (cell: string) => cell.replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The paste box's text for a file's contents (by its name's extension): a "term<tab>meaning" line per card row. */
export function cardListFromFile(name: string, content: string): string {
  const text = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const ext = extOf(name);
  if (ext !== 'csv' && ext !== 'tsv') return text.trim();
  const rows = csvRows(text, separatorOf(text, ext))
    .map((r) => r.map(flat).filter(Boolean))
    .filter((r) => r.length >= 2);
  if (rows.length && HEAD_FRONT.test(rows[0][0]) && HEAD_BACK.test(rows[0][1])) rows.shift();
  return rows.map((r) => `${r[0]}\t${r[1]}`).join('\n');
}
