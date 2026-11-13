/**
 * The Handbook app's table of contents for the Kingdom Heights Student / Parent Handbook (schools/khroyals/handbook.ts):
 * its parts and sections, following the PDF's own contents, plus a few sections the contents leave out (Inclement
 * Weather, Withdrawals, Reporting Student Progress, Joint Custody). Each section begins where its `starts` line (or its
 * title) appears in the handbook's text, in this order; `includes` names the PDF's contents entries kept inside it.
 * After importing a new edition, `npm run handbook:check` says what to change here (DEVELOPING.md → Update the handbook).
 */
import type { HandbookOutline } from '../../src/handbook/handbook';

export const HANDBOOK_OUTLINE: HandbookOutline = [
  { part: 'Introduction', sections: [{ title: 'Introduction', starts: 'INTRODUCTION' }] },
  {
    part: 'School Life & Decorum',
    sections: [
      { title: 'School Hours' },
      { title: 'Student Drop Off & Pick Up' },
      { title: 'Attendance' },
      { title: 'Tardiness / Early Release' },
      { title: 'Early Drop Off & Late Pick Up', starts: 'Early Drop Off and Late Pick Up' },
      { title: 'Uniform and Personal Appearance' },
      { title: 'Discipline' },
      { title: 'Public Displays of Affection' },
      { title: 'Electronic Devices' },
      { title: 'Lockers' },
      { title: 'Lunch and Snacks' },
      { title: 'Medication and Medical Care' },
      { title: 'Student Fees and Supplies' },
      { title: 'Extracurricular Activities' },
      { title: 'Volunteers' },
      { title: 'Visitors' },
      { title: 'Inclement Weather' },
      { title: 'Withdrawals' },
    ],
  },
  {
    part: 'Academic Policies',
    sections: [
      { title: 'Curriculum Introduction' },
      { title: 'Homework' },
      { title: 'Grading' },
      { title: 'Standards-Based Grading' },
      { title: 'Reporting Student Progress' },
      { title: 'Teacher Conferences' },
      { title: 'Student Placement' },
      { title: 'Promotion and Retention' },
      { title: 'Graduation Requirements', starts: 'Beginning with the Class of 2029 High School Graduation Requirements' },
      { title: 'Academic Honesty', includes: ['Academic Integrity'] },
      { title: 'Student Support Services' },
      { title: 'Controversial Subjects' },
      { title: 'Videos in the Classroom' },
    ],
  },
  {
    part: 'Additional Policies and Procedures',
    sections: [
      { title: 'Admissions and Enrollment' },
      { title: 'Field Trips' },
      { title: 'School Communication', starts: 'School Communication Procedures' },
      { title: 'KHPS Social Media Policy' },
      { title: 'Privacy and Conduct' },
      { title: 'Engagement and Moderation' },
      { title: 'Communicating with Parents with Joint Custody' },
      { title: 'Student Network Use', includes: ['Security Checks'] },
      { title: 'Student Drivers and Parking' },
      { title: 'Facility Use' },
      { title: 'Parent to School Collaboration' },
      { title: 'Behavior Policy' },
      { title: 'Tuition Refund & Withdrawal' },
      { title: 'Drugs, Alcohol, Nicotine, and Prohibited Substances' },
      { title: 'Bullying' },
      { title: 'Taylor’s Law' },
    ],
  },
  {
    part: 'Governance and Management',
    sections: [
      { title: 'Board of Directors' },
      { title: 'Board Responsibilities and Obligations' },
      { title: 'Communication to the Board' },
      { title: 'Role of the Head of School' },
      { title: 'Chain of Command' },
      { title: 'Grievance Policy' },
      { title: 'Privacy', starts: 'PRIVACY', includes: ['Student Information'] },
      { title: 'Change Log' },
    ],
  },
  {
    part: 'Commitment to School Standards',
    sections: [
      { title: 'Student AI Policy', starts: 'STUDENT ARTIFICIAL INTELLIGENCE (AI) USAGE POLICY' },
      { title: 'Student/Parent Agreement', starts: 'Student and Parent Agreements' },
      { title: 'Anti-Bullying Policy', starts: 'Anti-Bullying Policy Agreement' },
    ],
  },
];
