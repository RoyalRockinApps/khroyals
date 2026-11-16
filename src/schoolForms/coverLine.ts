/**
 * What the Folder's closed cover says is inside: forms to sign and new notes and bulletins (a student's forms are for
 * their parents to sign). No app imports, so tests run it.
 */
export function coverLine(forms: number, unread: number, student = false): string {
  const toSign = forms ? (student ? `${forms} for your parents to sign` : `${forms} to sign`) : '';
  const parts = [toSign, unread ? `${unread} new ${unread === 1 ? 'note' : 'notes'}` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nothing new';
}
