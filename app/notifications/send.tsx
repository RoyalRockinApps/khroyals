/**
 * The old Send a notification screen (once on the bell page): sending is in the Announcements app now, so old links
 * open a new announcement there.
 */
import { Redirect } from 'expo-router';

export default function SendNotification() {
  return <Redirect href="/announcements/new" />;
}
