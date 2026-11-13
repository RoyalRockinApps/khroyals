/**
 * What the Share tab can share: the app (its web address until it's in the app stores), the school's website, the
 * school calendar and the latest newsletter issue, each only when there's a public link for it. Never anything behind
 * a sign-in or with people in it. No app imports, so tests run it.
 */
export type ShareKey = 'app' | 'website' | 'calendar' | 'news';
export type ShareTarget = {
  key: ShareKey; label: string; url: string;
  /** The line on the pass, under the code ("Scan to get the app"). */
  headline: string;
  /** What goes with the link when it's sent. */
  message: string;
};

export function shareTargets(s: {
  appName: string; schoolName: string; fullName: string; newsName: string;
  webApp: string; website: { label: string; url: string }; calendarPdf: string | null;
  /** The newest issue, when it has a public link (Smore); issues written in the app don't. */
  news: { title: string; url: string } | null;
}): ShareTarget[] {
  const list: (ShareTarget | null)[] = [
    { key: 'app', label: 'Get the app', url: s.webApp, headline: `Scan to get ${s.appName}`,
      message: `Get ${s.appName}, the ${s.schoolName} app for families and staff` },
    { key: 'website', label: 'Website', url: s.website.url, headline: `Scan to visit ${s.website.label}`, message: s.fullName },
    s.calendarPdf ? { key: 'calendar', label: 'School calendar', url: s.calendarPdf, headline: 'Scan for the school calendar',
      message: `The ${s.schoolName} school calendar` } : null,
    s.news && /^https:\/\//.test(s.news.url) ? { key: 'news', label: s.newsName, url: s.news.url, headline: `Scan to read ${s.newsName}`,
      message: `${s.newsName}: ${s.news.title}` } : null,
  ];
  return list.filter((t): t is ShareTarget => !!t);
}

/** The address without https:// and www, as people would type it. */
export const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
