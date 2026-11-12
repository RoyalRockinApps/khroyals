/**
 * A yes/no setting remembered on this phone (AsyncStorage), shared live by every screen that uses the same key: a
 * section's collapsed or open state (the Planner's What to Wear, the same card on every day). Like the staff view
 * switch (src/staffView.ts), but for any key.
 */
import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const values = new Map<string, boolean>();
const listeners = new Map<string, Set<() => void>>();
const loading = new Set<string>();

function set(key: string, value: boolean, save: boolean) {
  values.set(key, value);
  listeners.get(key)?.forEach((l) => l());
  if (save) AsyncStorage.setItem(key, value ? '1' : '0').catch(() => { /* storage unavailable: it just won't be remembered */ });
}

/** The setting under `key` (`initial` until it's read from the phone, or if it never was set) and a way to change it. */
export function useRemembered(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const subscribe = useCallback((changed: () => void) => {
    const mine = listeners.get(key) ?? new Set();
    listeners.set(key, mine);
    mine.add(changed);
    if (!values.has(key) && !loading.has(key)) {
      loading.add(key);
      AsyncStorage.getItem(key).then((v) => { if (v !== null && !values.has(key)) set(key, v === '1', false); }).catch(() => {});
    }
    return () => { mine.delete(changed); };
  }, [key]);
  const read = () => values.get(key) ?? initial;
  const value = useSyncExternalStore(subscribe, read, read);
  return [value, (v) => set(key, v, true)];
}
