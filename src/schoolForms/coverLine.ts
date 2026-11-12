/** What the Folder's closed cover says is inside: forms to sign and new notes and bulletins. No app imports, so tests run it. */
export function coverLine(forms: number, unread: number): string {
  const parts = [forms ? `${forms} to sign` : '', unread ? `${unread} new ${unread === 1 ? 'note' : 'notes'}` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nothing new';
}
