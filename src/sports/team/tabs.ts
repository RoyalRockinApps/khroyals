/** The tabs on an activity's page, by name (a link or notification can open one: `/activities/<id>?tab=board`). */
export const TAB_KEYS = ['home', 'schedule', 'board', 'roster', 'photos', 'chat'] as const;
export type TabKey = (typeof TAB_KEYS)[number];
export const isTab = (x: unknown): x is TabKey => TAB_KEYS.includes(x as TabKey);
