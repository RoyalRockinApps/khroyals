/**
 * experiments: internal API implementation for A/B tests. Screens import the connect facade.
 * The server picks each person's version (my_experiments, read once per signed-in person) and records what they saw,
 * opened and finished (experiment_log, once each; each call is made once per session here). On demo data nobody is in
 * a test, so everyone sees the usual version.
 */
import type { ExperimentEvent } from '../experiments/registry';
import { live, rpc } from './client';
import { current } from './session';

export type ExperimentSummary = { key: string; title: string; active: boolean; startedAt: string | null; stoppedAt: string | null; people: number };
export type ExperimentResults = {
  key: string; title: string; active: boolean; startedAt: string | null; stoppedAt: string | null; subjects: number;
  variants: { variant: string; people: number; seen: number; opened: number; finished: number }[];
};

let mine: { user: string; versions: Promise<Record<string, string>> } | null = null;
const logged = new Set<string>();

/** This person's version of a running test, or null (not running, not in it, signed out or on demo data). */
export async function myVariant(key: string): Promise<string | null> {
  if (!live || !current || current.pending) return null;
  if (mine?.user !== current.id) {
    logged.clear();
    mine = { user: current.id, versions: (rpc('my_experiments') as Promise<unknown>).then((r) => (r ?? {}) as Record<string, string>).catch(() => ({})) };
  }
  return (await mine.versions)[key] ?? null;
}

/** Record that this person saw, opened or finished something in a test they're in (once per session; never throws). */
export async function logExperiment(key: string, event: ExperimentEvent, subject = '') {
  const id = `${key}|${event}|${subject}`;
  if (logged.has(id) || !(await myVariant(key))) return;
  logged.add(id);
  await rpc('experiment_log', { p_key: key, p_event: event, p_subject: subject }).catch(() => { logged.delete(id); });
}

/** push.send: every test and how many people it has counted. */
export async function experimentsList(): Promise<ExperimentSummary[]> {
  if (!live) return [];
  return (await rpc('experiments_list')) as ExperimentSummary[];
}

/** push.send: a test's counts per version. */
export async function experimentResults(key: string): Promise<ExperimentResults | null> {
  if (!live) return null;
  return (await rpc('experiment_results', { p_key: key })) as ExperimentResults | null;
}

/** push.send: start or stop a test; `reset` starts it over, clearing its counts. */
export async function setExperiment(key: string, active: boolean, reset = false) {
  if (!live) throw new Error('A/B tests need the school server; this build is running on demo data.');
  await rpc('experiment_set', { p_key: key, p_active: active, p_reset: reset });
  mine = null;   // this person's own versions may have changed
}
