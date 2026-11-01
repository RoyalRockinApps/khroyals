/**
 * What makes each school's app its own (schools/<id>/school.ts). Shared code reads the
 * school being built through src/school.ts, never a school's name or website directly.
 * No app imports, so tests run it.
 */
export type School = {
  id: string;
  /** The app's name on the phone and in Settings: "KH Royals". */
  appName: string;
  /** The school in a sentence: "Kingdom Heights". */
  name: string;
  /** The full name: "Kingdom Heights Preparatory School". */
  fullName: string;
  /** The school's community in the app: "Royals Connect". */
  connectName: string;
  /** The emailed newsletter's archive: "Royal News". */
  newsName: string;
  /** The newsletter's web address, once the school gives one; until then it opens the archive. */
  newsUrl: string | null;
  /** The greeting for anyone who isn't a student: "Good morning Royal!" */
  mascot: string;
  /** The title over the Apps page: "Boldly Christian". */
  tagline: string;
  /** The website the app's content comes from. `nestedPages`: pages live under folders (/about/our-story/). */
  website: { label: string; url: string; hosts: string[]; nestedPages: boolean };
  /** The web app, for emails and links: "https://royalrockinapps.github.io/khroyals/". */
  webApp: string;
  /** The school calendar PDF, or null. */
  calendarPdf: string | null;
  /** Example address for an activity's information link. */
  infoLinkExample: string;
  theme: {
    /** The dark brand color on tiles, cards and the Activities and Volunteer screens. */
    dark: string;
    /** Over photos: website heroes and the news banner. */
    heroOverlay: string;
    newsOverlay: string;
    /** Font families loaded in schools/<id>/fonts.ts, or null for the phone's own. */
    fonts: { heading: string; title: string } | null;
    /** Website headings in capitals (levels 1–2). */
    uppercaseHeadings: boolean;
  };
};
