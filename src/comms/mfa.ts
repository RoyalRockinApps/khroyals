/**
 * Admin powers only count once the session is verified with the authenticator app (aal2), so before
 * that `Access.permissions` is empty and a role's permissions aren't known yet. These say whether to
 * offer a tool and ask for the code in place. No app imports, so tests run it.
 */
import type { Access } from '../api/types';

/**
 * Holds `perm` (or may, through their admin role) but hasn't verified with the authenticator app in
 * this session: show "Verify it's you" where the tool would be.
 */
export function needsCodeFor(a: Access | null | undefined, perm: string): boolean {
  return !!a && !a.permissions.includes(perm) && a.mfaRequired && !a.mfaVerified && (a.tier !== null || a.granted.includes(perm));
}

/** Has `perm` now, or would after verifying: whether to show the way in to that tool. */
export function mayHave(a: Access | null | undefined, perm: string): boolean {
  return !!a && (a.permissions.includes(perm) || needsCodeFor(a, perm));
}
