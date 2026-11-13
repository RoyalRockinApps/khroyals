/**
 * QR codes drawn with plain views (no SVG or image module): each row of the
 * code becomes runs of dark and light squares. qrcode-generator does the
 * encoding.
 */
import qrcode from 'qrcode-generator';
import { SCHOOL } from '../school';

/** The school's website, which the Share tab's QR code opens. */
export const SCHOOL_WEBSITE = SCHOOL.website.url;

export type Run = { dark: boolean; length: number };
export type QrRows = { size: number; rows: Run[][] };

/**
 * Encode text as rows of runs: medium error correction, so a scratched or glared screen still scans, or high ('H')
 * when a logo covers the middle (up to about 30% of it can be lost and it still reads).
 */
export function qrRows(text: string, level: 'M' | 'H' = 'M'): QrRows {
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const rows: Run[][] = [];
  for (let r = 0; r < size; r++) {
    const runs: Run[] = [];
    for (let c = 0; c < size; c++) {
      const dark = qr.isDark(r, c);
      const last = runs[runs.length - 1];
      if (last && last.dark === dark) last.length++;
      else runs.push({ dark, length: 1 });
    }
    rows.push(runs);
  }
  return { size, rows };
}
