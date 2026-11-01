/** Westminster Christian Academy (the Wildcats): Lower Campus in Madison, Upper Campus in Huntsville, AL. */
import type { School } from '../../src/schoolTypes';

export const SCHOOL: School = {
  id: 'wca',
  appName: 'WCA',
  name: 'Westminster',
  fullName: 'Westminster Christian Academy',
  connectName: 'Wildcats Connect',
  newsName: 'WCA News',
  newsUrl: null,
  mascot: 'Wildcat',
  tagline: 'One Community',
  website: { label: 'wca-hsv.org', url: 'https://wca-hsv.org', hosts: ['wca-hsv.org', 'www.wca-hsv.org'], nestedPages: true },
  webApp: 'https://royalrockinapps.github.io/khroyals/wca/',
  calendarPdf: null,
  infoLinkExample: 'https://wca-hsv.org/…',
  theme: {
    dark: '#5E0F18',
    heroOverlay: '#222222A6',
    newsOverlay: 'rgba(34, 34, 34, 0.62)',
    fonts: { heading: 'Jost_700Bold', title: 'Jost_600SemiBold' },
    uppercaseHeadings: true,
  },
};
