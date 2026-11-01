/** Kingdom Heights Preparatory School (the Royals), Huntsville, AL. */
import type { School } from '../../src/schoolTypes';

export const SCHOOL: School = {
  id: 'khroyals',
  appName: 'KH Royals',
  name: 'Kingdom Heights',
  fullName: 'Kingdom Heights Preparatory School',
  connectName: 'Royals Connect',
  newsName: 'Royal News',
  newsUrl: null,
  mascot: 'Royal',
  tagline: 'Boldly Christian',
  website: { label: 'khroyals.com', url: 'https://www.khroyals.com', hosts: ['www.khroyals.com', 'khroyals.com'], nestedPages: false },
  webApp: 'https://royalrockinapps.github.io/khroyals/',
  calendarPdf: 'https://www.khroyals.com/s/2026-2027-Calendar-2.pdf',
  infoLinkExample: 'https://www.khroyals.com/s/…pdf',
  theme: {
    dark: '#0A1F4D',
    heroOverlay: '#0B1928A6',
    newsOverlay: 'rgba(0, 18, 77, 0.6)',
    fonts: null,
    uppercaseHeadings: false,
  },
};
