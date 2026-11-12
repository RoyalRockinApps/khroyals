/**
 * A/B tests: what each version looks like and what the counts mean, for the results screen. Each key is also a row in
 * public.experiments (tests/experiments.test.ts compares). No app imports, so tests run it.
 *
 * Never test safety, consent or legal wording: critical alerts, pickup and check-out, forms, sign-in.
 */
export type ExperimentEvent = 'seen' | 'opened' | 'finished';

export const EVENTS: { key: ExperimentEvent; label: string }[] = [
  { key: 'seen', label: 'Saw it' },
  { key: 'opened', label: 'Opened it' },
  { key: 'finished', label: 'Read to the end' },
];

export type ExperimentInfo = {
  title: string;
  /** Where people see it, and what counts as seeing and opening it. */
  where: string;
  variants: Record<string, { label: string; about: string }>;
};

export const EXPERIMENTS: Record<string, ExperimentInfo> = {
  royal_news_card: {
    title: 'Newsletter card on the Planner',
    where: 'The newsletter’s button (its masthead, above Coming Up) counts as seen once it scrolls into view on the Planner, opened when it’s tapped, and read when someone reaches the end of that week’s issue (from the button or the archive).',
    variants: {
      a: { label: 'A · The archive', about: 'The masthead alone; opens the list of issues.' },
      b: { label: 'B · This week’s issue', about: 'The masthead with the latest issue’s date under it, and New in its first week; opens that issue.' },
    },
  },
};

export const variantLabel = (key: string, variant: string) => EXPERIMENTS[key]?.variants[variant]?.label ?? variant.toUpperCase();
