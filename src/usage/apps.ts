/**
 * App usage: which app a screen belongs to, by the first part of its route (app/<folder or file>), named the way people
 * know them (the Main Page tiles and the tabs). Every top-level route is listed (tests/usage.test.ts checks), so a new
 * screen has to be put in an app. `null` paths (the sign-in link) aren't counted. No app imports, so tests run it.
 */
export type UsageApp = { key: string; label: string; paths: string[] };

export const USAGE_APPS: UsageApp[] = [
  { key: 'planner', label: 'Planner', paths: ['', 'index'] },
  { key: 'connect', label: 'Connect', paths: ['connect', 'group', 'post-stats'] },
  { key: 'main', label: 'Main Page', paths: ['apps'] },
  { key: 'share', label: 'Share', paths: ['share'] },
  // Once the More tab; the key stays so earlier counts carry on.
  { key: 'more', label: 'About the school (website pages)', paths: ['about', 'page', 'video'] },
  { key: 'carline', label: 'Car Line', paths: ['carline', 'carline-board', 'carline-settings', 'carline-transfer', 'vehicle'] },
  { key: 'classes', label: 'Classes', paths: ['attendance', 'checkout', 'checkin', 'onsite', 'extended-care', 'subs'] },
  { key: 'sub', label: 'Sub Days', paths: ['sub'] },
  { key: 'student', label: 'Student', paths: ['student'] },
  { key: 'alerts', label: 'Alerts', paths: ['alerts'] },
  { key: 'calendar', label: 'Calendar', paths: ['calendar', 'my-calendar', 'event', 'dress-days'] },
  { key: 'lunch', label: 'Lunch Visits', paths: ['lunch'] },
  { key: 'news', label: 'News', paths: ['news'] },
  { key: 'newsletter', label: 'Newsletter', paths: ['royal-news'] },
  { key: 'photos', label: 'Photos', paths: ['photos'] },
  { key: 'activities', label: 'Activities', paths: ['activities', 'tickets'] },
  { key: 'market', label: 'Marketplace', paths: ['market'] },
  { key: 'volunteer', label: 'Volunteer', paths: ['volunteer'] },
  { key: 'forms', label: 'Forms', paths: ['forms', 'absences'] },
  { key: 'handbook', label: 'Handbook', paths: ['handbook'] },
  { key: 'questions', label: 'Ask the School', paths: ['questions'] },
  { key: 'teachers', label: 'Ask the Teacher', paths: ['teachers'] },
  { key: 'assignments', label: 'Assignments', paths: ['assignments'] },
  { key: 'feedback', label: 'Feedback', paths: ['feedback'] },
  { key: 'admin', label: 'Admin portal', paths: ['admin', 'experiments'] },
  { key: 'profile', label: 'Profile', paths: ['profile'] },
  { key: 'children', label: 'My children', paths: ['children'] },
  { key: 'notifications', label: 'Notifications', paths: ['notifications'] },
];

/** Routes that aren't an app people use (finishing a sign-in link). */
export const NOT_COUNTED = ['auth'];

const BY_PATH = new Map(USAGE_APPS.flatMap((a) => a.paths.map((p) => [p, a.key] as const)));

/** The app a route is in, from expo-router's segments (route groups like "(tabs)" are skipped); null when it isn't counted. */
export function usageApp(segments: string[]): string | null {
  const first = segments.find((x) => !/^\(.*\)$/.test(x)) ?? '';
  if (NOT_COUNTED.includes(first)) return null;
  return BY_PATH.get(first) ?? null;
}

/** An app's name for the results ("Newsletter" reads as the school's own, `newsName`). */
export const usageLabel = (key: string, newsName = 'Newsletter') =>
  key === 'newsletter' ? newsName : USAGE_APPS.find((a) => a.key === key)?.label ?? key;
