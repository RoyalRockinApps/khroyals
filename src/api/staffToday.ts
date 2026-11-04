/** staffToday: internal API implementation. Screens import the connect facade. */
import { live, rpc } from './client';
import { current } from './session';
import type { StaffToday } from './types';

/** What's waiting on a teacher or staff member today, counted across the apps ({} for everyone else). */
export async function staffToday(): Promise<StaffToday> {
  if (!live || !current) return {};
  const r = (await rpc('staff_today')) as Record<string, unknown> | null;
  return Object.fromEntries(Object.entries(r ?? {}).filter(([, v]) => typeof v === 'number')) as StaffToday;
}
