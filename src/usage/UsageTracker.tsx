/**
 * Counts app usage (mounted once, in app/_layout.tsx): each time someone moves into a different app (src/usage/apps.ts),
 * and when they come back to the app after 5 minutes or more away. The server keeps one row per person, app and day.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSegments } from 'expo-router';
import { logUsage } from '../api/connect';
import { usageApp } from './apps';

const AWAY_MS = 5 * 60_000;

export function UsageTracker() {
  const segments = useSegments();
  const app = usageApp(segments);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (app && app !== last.current) logUsage(app);
    if (app) last.current = app;
  }, [app]);
  useEffect(() => {
    let away = 0;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') away = Date.now();
      else if (state === 'active' && away && Date.now() - away >= AWAY_MS && last.current) logUsage(last.current);
    });
    return () => sub.remove();
  }, []);
  return null;
}
