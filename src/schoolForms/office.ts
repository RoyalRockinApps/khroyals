/**
 * Forms to Send to Office (the Forms app): forms a family sends the school, rather than ones the school sends them.
 * Each opens its own screen under app/forms. No app imports, so tests run it.
 */
export type OfficeForm = { key: string; title: string; parents: string; staff: string; icon: string; href: string };

export const OFFICE_FORMS: OfficeForm[] = [
  {
    key: 'excused-absence', title: 'Excused Absence', icon: 'bed-outline', href: '/forms/excused-absence',
    parents: 'Absent, arriving late or leaving early: the office and the teachers are told',
    staff: 'Absences, late arrivals and early pickups parents reported, day by day',
  },
];
