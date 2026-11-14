/**
 * Shows the splash page someone should see (`my_splash`) when they open the app, and again each time they come back
 * to it, until they close it (✕, Continue or its button, remembered on every device). Only for approved accounts
 * (`open`), one at a time, never on the car line's big screen, and never while a critical alert is up (the alert's
 * takeover is mounted after this one, and a splash page waits until the alert is over).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal } from 'react-native';
import { router, type Href } from 'expo-router';
import { isSchoolStaff, listAlerts, markSplash, me, mySplash, subscribeAlerts, type Announcement } from '../api/connect';
import { SplashView } from './Splash';

export function SplashGate({ open, skip }: { open: boolean; skip?: boolean }) {
  const [splash, setSplash] = useState<Announcement | null>(null);
  const alerting = useRef(false);
  const showing = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (!open || skip || showing.current) return;
    const staff = isSchoolStaff(me());
    if (staff) alerting.current = (await listAlerts(5).catch(() => [])).some((x) => !x.endedAt);
    if (alerting.current) return;
    const s = await mySplash().catch(() => null);
    if (!s || showing.current) return;
    showing.current = s.id;
    setSplash(s);
    markSplash(s.id, 'seen').catch(() => {});
  }, [open, skip]);

  useEffect(() => { check(); }, [check]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => sub.remove();
  }, [check]);
  // A critical alert puts a splash page away (it comes back next time, as it wasn't closed).
  useEffect(() => {
    if (!open || !isSchoolStaff(me())) return;
    return subscribeAlerts(() => {
      listAlerts(5).then((list) => {
        alerting.current = list.some((x) => !x.endedAt);
        if (alerting.current) { showing.current = null; setSplash(null); }
      }).catch(() => {});
    });
  }, [open]);

  const done = (action: 'closed' | 'tapped') => {
    const s = splash;
    if (!s) return;
    markSplash(s.id, action).catch(() => {});
    setSplash(null);
    showing.current = null;
    if (action === 'tapped' && s.link) router.push(s.link as Href);
  };

  return (
    <Modal visible={!!splash} animationType="fade" onRequestClose={() => done('closed')} statusBarTranslucent>
      {splash && <SplashView a={splash} onClose={() => done('closed')} onTap={() => done('tapped')} />}
    </Modal>
  );
}
