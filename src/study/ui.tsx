/** Pieces the Study app's screens share: who may use it, subject tags and picker, a deck's progress bar. */
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, live, onAuthChange, session } from '../api/connect';
import { Button, C, Card, H, Input, P, s } from '../ui';
import { subjectColor } from './subjects';

export const GREEN = '#15803D';
export const AMBER = '#D97706';

/** Something went wrong saving: say so (the browser's alert on the web, where Alert does nothing). */
export function oops(e: unknown) {
  const text = errorText(e);
  if (Platform.OS === 'web') globalThis.alert?.(text);
  else Alert.alert('Study', text);
}

export type StudyAccess = 'loading' | 'open' | 'signedOut' | 'notStudent';

/** Study is for students (demo builds without the server are open to everyone). */
export function useStudyAccess(): StudyAccess {
  const [access, setAccess] = useState<StudyAccess>(live ? 'loading' : 'open');
  useEffect(() => {
    if (!live) return;
    const check = () => session()
      .then((me) => setAccess(!me ? 'signedOut' : !me.pending && me.schoolRole === 'student' ? 'open' : 'notStudent'))
      .catch(() => setAccess('signedOut'));
    check();
    return onAuthChange(check);
  }, []);
  return access;
}

/** What someone who can't use Study sees instead. */
export function StudyClosed({ access }: { access: Exclude<StudyAccess, 'open' | 'loading'> }) {
  return (
    <View style={[s.screen, s.pad]}>
      {access === 'signedOut' ? (
        <Card>
          <H>Sign in to study</H>
          <P muted>Your notes and flash cards, saved to your account.</P>
          <Button label="Sign in" onPress={() => router.navigate('/connect')} />
        </Card>
      ) : (
        <Card>
          <H>Study is for students</H>
          <P muted>Students keep their class notes here and make flash cards to study with. Only the student sees them.</P>
        </Card>
      )}
    </View>
  );
}

/** A small colored tag with a class or subject's name. */
export function SubjectTag({ subject }: { subject: string }) {
  if (!subject) return null;
  const color = subjectColor(subject);
  return (
    <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 999, backgroundColor: `${color}18` }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color }}>{subject}</Text>
    </View>
  );
}

/** Pick a class or subject (or none), or type another. */
export function SubjectPicker({ value, onChange, subjects }: { value: string; onChange: (v: string) => void; subjects: string[] }) {
  const choices = value && !subjects.some((x) => x.toLowerCase() === value.toLowerCase()) ? [value, ...subjects] : subjects;
  const [typing, setTyping] = useState(false);
  const [other, setOther] = useState('');
  const chip = (label: string, on: boolean, onPress: () => void, color = subjectColor(label)) => (
    <Pressable key={`${label}:${on}`} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
        borderWidth: 1.5, borderColor: on ? color : C.line, backgroundColor: on ? `${color}18` : C.card }, pressed && { opacity: 0.7 }]}>
      {on && <Ionicons name="checkmark" size={14} color={color} />}
      <Text style={{ fontWeight: '700', fontSize: 13, color: on ? color : C.ink }}>{label}</Text>
    </Pressable>
  );
  const done = () => { const v = other.trim().slice(0, 60); if (v) onChange(v); setOther(''); setTyping(false); };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chip('None', !value, () => onChange(''), C.muted)}
        {choices.map((x) => chip(x, x.toLowerCase() === value.toLowerCase(), () => onChange(x)))}
        {!typing && chip('+ Another', false, () => setTyping(true), C.primary)}
      </View>
      {typing && (
        <View style={[s.row, { gap: 8 }]}>
          <Input autoFocus placeholder="Class or subject" value={other} onChangeText={setOther} maxLength={60} onSubmitEditing={done}
            returnKeyType="done" style={{ flex: 1 }} />
          <Button label="Use" onPress={done} disabled={!other.trim()} />
        </View>
      )}
    </View>
  );
}

/** How much of a deck is known (box 4–5), being learned, and new, as one bar. */
export function KnownBar({ cards, known, fresh, height = 8 }: { cards: number; known: number; fresh: number; height?: number }) {
  const learning = Math.max(0, cards - known - fresh);
  const part = (n: number, color: string) => n > 0 && <View style={{ flex: n, backgroundColor: color }} />;
  return (
    <View accessible accessibilityLabel={`${known} known, ${learning} learning, ${fresh} new`}
      style={{ flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden', backgroundColor: C.line, gap: cards ? 2 : 0 }}>
      {part(known, GREEN)}
      {part(learning, AMBER)}
      {part(fresh, '#CBD5E1')}
    </View>
  );
}

/** "today", "tomorrow", "Tuesday", else "Nov 20" (a YYYY-MM-DD day, counted from `today`). */
export function dayLabel(day: string, today: string) {
  const days = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  const d = new Date(`${day}T12:00:00Z`);
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Nov 12" (or the time, today) for a note's last change. */
export function changedLabel(iso: string, now = new Date()) {
  const t = new Date(iso);
  if (t.toDateString() === now.toDateString()) return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(t.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
