/**
 * The More tab's menu, from the website's: the footer's Quick Links as a drop-down at the top
 * (Westminster Hub, Employment, transcripts…), then the site's own menu (About, Academics,
 * Admissions, Athletics, Give, Apply). Shaped here, not in the imported content, so a fresh
 * import of wca-hsv.org keeps it. No app imports, so tests run it.
 */
import type { Link, NavItem } from '../../src/site/types';

export function moreMenu(navigation: NavItem[], footer: { actions: Link[]; quickLinks: Link[] }): NavItem[] {
  const menu: NavItem[] = navigation.map((n) => ({ ...n }));
  if (footer.quickLinks.length) menu.unshift({ label: 'Quick Links', items: footer.quickLinks });
  return menu;
}
