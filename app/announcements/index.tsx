/**
 * Announcements (staff view, for people with Send notifications; an admin power, so behind the authenticator code):
 * what's scheduled, the splash pages showing now and what went out, each with who it was for and what people did with
 * it (counts only: reached, opened, and for splash pages seen, closed and button taps). Scheduled ones and showing
 * splash pages can be stopped. + New announcement writes one.
 */
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { cancelAnnouncement, errorText, listAnnouncements, live, type Announcement } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { MfaGate } from '../../src/comms/MfaGate';
import { GOLD, NAVY } from '../../src/sports/ui';
import { confirmThen } from '../../src/sports/team/parts';
import { oops } from '../../src/study/ui';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

export default function AnnouncementsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Announcements' }} />
      {/* Demo builds (no server, nothing really sent) open it so it can be tried. */}
      {live ? <MfaGate>{() => <History />}</MfaGate> : <History />}
    </>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function History() {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => listAnnouncements().then((l) => { setList(l); setError(null); }).catch((e) => setError(errorText(e))), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (error && !list) return <View style={[s.screen, s.pad]}><Card><P muted>{error}</P><Button label="Try again" kind="ghost" onPress={load} /></Card></View>;
  if (!list) return <Loading />;
  const today = schoolToday();
  const scheduled = list.filter((a) => !a.sentAt && !a.cancelledAt);
  const showing = list.filter((a) => a.sentAt && a.splash && !a.cancelledAt && (a.splashStartsOn ?? '') <= today && today <= (a.splashEndsOn ?? ''));
  const sent = list.filter((a) => !scheduled.includes(a) && !showing.includes(a));
  const stop = (a: Announcement) => confirmThen(a.sentAt ? 'Stop this splash page?' : 'Cancel this announcement?',
    a.sentAt ? 'Nobody else sees it. Notifications already sent stay.' : 'It won\'t go out.', a.sentAt ? 'Stop it' : 'Cancel it',
    () => cancelAnnouncement(a.id).then(load).catch(oops));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Button label="+ New announcement" onPress={() => router.push('/announcements/new')} />
      <P muted>A push and bell notification, a splash page people see when they open the app, or both. To everyone or just the people it's for.</P>
      {scheduled.length > 0 && <Heading text="SCHEDULED" />}
      {scheduled.map((a) => <Row key={a.id} a={a} today={today} onStop={() => stop(a)} />)}
      {showing.length > 0 && <Heading text="SPLASH PAGES SHOWING NOW" />}
      {showing.map((a) => <Row key={a.id} a={a} today={today} onStop={() => stop(a)} />)}
      {sent.length > 0 && <Heading text="SENT" />}
      {sent.map((a) => <Row key={a.id} a={a} today={today} />)}
      {list.length === 0 && <Card><P muted>Nothing sent yet.</P></Card>}
    </ScrollView>
  );
}

function Heading({ text }: { text: string }) {
  return <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.6, marginTop: 6 }}>{text}</Text>;
}

function Row({ a, today, onStop }: { a: Announcement; today: string; onStop?: () => void }) {
  const pct = (n?: number) => (a.reach ? ` (${Math.round((100 * (n ?? 0)) / a.reach)}%)` : '');
  const status = a.cancelledAt && !a.sentAt ? 'Cancelled'
    : !a.sentAt ? `Goes out ${when(a.sendAt)}`
    : `Sent ${when(a.sentAt)}${a.sender ? ` by ${a.sender}` : ''}`;
  return (
    <Card style={{ gap: 6, borderLeftWidth: 5, borderLeftColor: a.urgent ? C.danger : a.splash ? GOLD : NAVY, opacity: a.cancelledAt && !a.sentAt ? 0.6 : 1 }}>
      <View style={[s.row, { gap: 8 }]}>
        {a.push && <Ionicons name="notifications" size={16} color={NAVY} accessibilityLabel="Notification" />}
        {a.splash && <Ionicons name="phone-portrait" size={16} color={GOLD} accessibilityLabel="Splash page" />}
        {a.urgent && <Text style={{ fontSize: 11, fontWeight: '900', color: C.danger }}>URGENT</Text>}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>{a.title}</Text>
      </View>
      {!!a.body && <Text numberOfLines={2} style={{ color: C.ink }}>{a.body}</Text>}
      <Text style={{ color: C.muted, fontSize: 13 }}>{[a.audienceLabel, status].filter(Boolean).join(' · ')}</Text>
      {a.sentAt && (
        <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600' }}>
          {`Reached ${a.reach ?? 0}`}{a.push ? ` · Opened ${a.opened ?? 0}${pct(a.opened)}` : ''}
        </Text>
      )}
      {a.splash && (
        <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600' }}>
          {`Splash ${shortDay(a.splashStartsOn ?? today)}–${shortDay(a.splashEndsOn ?? today)}`}{a.cancelledAt && a.sentAt ? ' (stopped)' : ''}
          {a.sentAt ? ` · Seen ${a.seen ?? 0}${pct(a.seen)} · Button ${a.tapped ?? 0}` : ''}
        </Text>
      )}
      {onStop && <Text onPress={onStop} accessibilityRole="button" style={{ color: C.danger, fontWeight: '700', alignSelf: 'flex-end' }}>{a.sentAt ? 'Stop showing it' : 'Cancel'}</Text>}
    </Card>
  );
}
