/** My calendar is now Calendar → Mine; old links (and the Planner's) land there. */
import { Redirect } from 'expo-router';

export default function MyCalendarRedirect() {
  return <Redirect href={{ pathname: '/calendar', params: { view: 'mine' } }} />;
}
