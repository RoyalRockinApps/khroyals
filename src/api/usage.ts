/**
 * usage: internal API implementation for app usage. Screens import the connect facade.
 * The root layout reports each app someone moves into (usage_log: once per person, app and day, counting opens);
 * audit.view holders read the totals (usage_summary). Nothing is sent on demo data or before an account is approved.
 */
import { live, rpc } from './client';
import { current } from './session';

export type UsageSummary = {
  days: number; from: string; to: string;
  /** Approved accounts by role, and how many were active today, in the last 7 and 30 days, and in the period. */
  accounts: Record<string, number>;
  active: { today: number; week: number; month: number; period: number };
  byRole: Record<string, number>;
  daily: { day: string; people: number }[];
  /** `days`: person-days (so days ÷ people is how many days each person used it). */
  apps: { app: string; people: number; opens: number; days: number; roles: Record<string, number> }[];
};

/** Someone opened (or came back to) an app. Never throws. */
export async function logUsage(app: string) {
  if (!live || !current || current.pending) return;
  await rpc('usage_log', { p_app: app }).catch(() => {});
}

/** audit.view: app usage over the last `days` days (1–400). */
export async function usageSummary(days: number): Promise<UsageSummary | null> {
  if (!live) return null;
  return (await rpc('usage_summary', { p_days: days })) as UsageSummary;
}
