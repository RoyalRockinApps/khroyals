/**
 * Absences moved into Forms (Forms to Send to Office → Excused Absence). Old links and notifications that open
 * /absences land there.
 */
import { Redirect } from 'expo-router';

export default function Absences() {
  return <Redirect href="/forms/excused-absence" />;
}
