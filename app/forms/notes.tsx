/** Bulletins & notes moved into the Folder's senders' side (its Bulletins tab); old links land there. */
import { Redirect } from 'expo-router';

export default function Notes() {
  return <Redirect href={{ pathname: '/forms', params: { show: 'notes' } }} />;
}
