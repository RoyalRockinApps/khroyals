/** Small helpers shared by an activity's Board, Roster and Chat tabs. */
import { Alert, Platform } from 'react-native';
import { getUser } from '../../api/connect';

/** "4:30 PM" today, "Yesterday", else "Nov 12". */
export function stamp(iso: string, now = new Date()) {
  const t = new Date(iso);
  if (t.toDateString() === now.toDateString()) return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (t.toDateString() === y.toDateString()) return 'Yesterday';
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const nameOf = (id: string | null) => { const p = id ? getUser(id) : undefined; return p ? `${p.firstName} ${p.lastName}` : 'Someone'; };

/** Ask before something that can't be undone (the browser's confirm on the web). */
export function confirmThen(title: string, message: string, ok: string, go: () => void) {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${message}`)) go(); return; }
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: ok, style: 'destructive', onPress: go }]);
}

export const fail = (e: any) => Alert.alert('Activities', e?.message ?? String(e));
