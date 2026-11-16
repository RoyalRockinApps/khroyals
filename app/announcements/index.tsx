/**
 * Announcements (staff view, for people with Send notifications; an admin power, so behind the authenticator code). A
 * navy band (src/hub.tsx) counts what's scheduled, the splash pages showing now and what went out this month, with + New
 * announcement; "Start from" quick starts open the composer filled in (src/announcements/kinds.ts). Below, what's
 * scheduled, the splash pages showing now and what went out, each with a picture of it (the splash page, or a bell),
 * who it was for and what people did with it, as bars (counts only: opened, and for splash pages seen and button taps;
 * never names). Scheduled ones and showing splash pages can be stopped.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { cancelAnnouncement, errorText, listAnnouncements, live, type Announcement } from '../../src/api/connect';
import { QUICK_STARTS, dayWord, splashMediaOf } from '../../src/announcements/kinds';
import { SplashThumb } from '../../src/announcements/Preview';
import { schoolToday } from '../../src/calendar/past';
import { clock } from '../../src/carline/time';
import { MfaGate } from '../../src/comms/MfaGate';
import { Band, GoldButton, Heading, Stat, Stats } from '../../src/hub';
import { NAVY } from '../../src/sports/ui';
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

type Icon = React.ComponentProps<typeof Ionicons>['name'];
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** "today, 3:08 PM", "tomorrow, 7:30 AM" or "Fri, Nov 13, 5:08 PM" (after "Sent" or "Goes out"). */
const when = (iso: string, today: string) => {
  const day = dayWord(schoolToday(new Date(iso)), today);
  return `${day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day}, ${clock(iso)}`;
};

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
  const thisMonth = list.filter((a) => a.sentAt && schoolToday(new Date(a.sentAt)).slice(0, 7) === today.slice(0, 7)).length;
  const stop = (a: Announcement) => confirmThen(a.sentAt ? 'Stop this splash page?' : 'Cancel this announcement?',
    a.sentAt ? 'Nobody else sees it. Notifications already sent stay.' : 'It won\'t go out.', a.sentAt ? 'Stop it' : 'Cancel it',
    () => cancelAnnouncement(a.id).then(load).catch(oops));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Band>
        <Stats>
          <Stat n={scheduled.length} label="Scheduled" />
          <Stat n={showing.length} label="Splash showing" />
          <Stat n={thisMonth} label="Sent this month" />
        </Stats>
        <GoldButton icon="add" label="New announcement" onPress={() => router.push('/announcements/new')} />
      </Band>

      <View style={{ gap: 6 }}>
        <Heading text="START FROM" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {QUICK_STARTS.map((q) => (
            <Pressable key={q.key} onPress={() => router.push({ pathname: '/announcements/new', params: { start: q.key } })} accessibilityRole="button"
              accessibilityLabel={`Start from ${q.label}`}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999,
                backgroundColor: C.card, borderWidth: 1, borderColor: C.line }, pressed && { opacity: 0.7 }]}>
              <Ionicons name={q.icon as Icon} size={16} color={NAVY} />
              <Text style={{ fontWeight: '700', color: C.ink }}>{q.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {scheduled.length > 0 && <Heading text="SCHEDULED" />}
      {scheduled.map((a) => <Row key={a.id} a={a} today={today} onStop={() => stop(a)} />)}
      {showing.length > 0 && <Heading text="SPLASH PAGES SHOWING NOW" />}
      {showing.map((a) => <Row key={a.id} a={a} today={today} onStop={() => stop(a)} />)}
      {sent.length > 0 && <Heading text="SENT" />}
      {sent.map((a) => <Row key={a.id} a={a} today={today} />)}
      {list.length === 0 && (
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
          <Ionicons name="megaphone-outline" size={30} color={NAVY} />
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>Send your first announcement</Text>
          <P muted>A notification, a splash page people see when they open the app, or both. Start from one above, or write your own.</P>
        </Card>
      )}
    </ScrollView>
  );
}

/** A thin bar with its label: "Opened 57%". */
function Meter({ label, n, of, color }: { label: string; n: number; of: number; color: string }) {
  const pct = of ? Math.round((100 * n) / of) : 0;
  return (
    <View style={{ flex: 1, gap: 3 }} accessibilityLabel={`${label}: ${n} of ${of}, ${pct} percent`}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.muted }}>{label} {pct}%</Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

function Row({ a, today, onStop }: { a: Announcement; today: string; onStop?: () => void }) {
  const cancelled = !!a.cancelledAt && !a.sentAt;
  const status = cancelled ? 'Cancelled'
    : !a.sentAt ? `Goes out ${when(a.sendAt, today)}`
    : `Sent ${when(a.sentAt, today)}${a.sender ? ` by ${a.sender}` : ''}`;
  const reach = a.reach ?? 0;
  return (
    <Card style={{ flexDirection: 'row', gap: 12, opacity: cancelled ? 0.6 : 1 }}>
      {a.splash ? (
        <SplashThumb width={46} s={{ template: a.splashTemplate, headline: a.splashHeadline || a.title, imageUrl: a.splashImageUrl || undefined,
          media: splashMediaOf(a.splashImage || a.splashImageUrl),
          photoUrl: a.splashPhotoUrl || undefined }} />
      ) : (
        <View style={{ width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: a.urgent ? `${C.danger}18` : `${NAVY}12` }}>
          <Ionicons name={a.urgent ? 'alert-circle' : 'notifications'} size={22} color={a.urgent ? C.danger : NAVY} />
        </View>
      )}
      <View style={{ flex: 1, gap: 5 }}>
        <View style={[s.row, { gap: 6 }]}>
          {a.urgent && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: C.danger }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#fff' }}>URGENT</Text>
            </View>
          )}
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '800', color: C.ink }}>{a.title}</Text>
        </View>
        <Text style={{ color: C.muted, fontSize: 13 }}>
          {[a.audienceLabel, a.sentAt ? `${reach} reached` : null].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ color: a.sentAt ? C.muted : NAVY, fontSize: 13, fontWeight: a.sentAt ? '400' : '700' }}>{status}</Text>
        {!!a.body && <Text numberOfLines={1} style={{ color: C.ink }}>{a.body}</Text>}
        {!!a.sentAt && (a.push || a.splash) && (
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
            {a.push && <Meter label="Opened" n={a.opened ?? 0} of={reach} color={NAVY} />}
            {a.splash && <Meter label="Seen" n={a.seen ?? 0} of={reach} color="#CA8A04" />}
          </View>
        )}
        {a.splash && (
          <Text style={{ color: C.muted, fontSize: 12 }}>
            {`Splash ${shortDay(a.splashStartsOn ?? today)}–${shortDay(a.splashEndsOn ?? today)}`}{a.cancelledAt && a.sentAt ? ' (stopped)' : ''}
            {a.sentAt && a.splashButton ? ` · ${a.tapped ?? 0} button ${a.tapped === 1 ? 'tap' : 'taps'}` : ''}
          </Text>
        )}
        {onStop && (
          <Text onPress={onStop} accessibilityRole="button" style={{ color: C.danger, fontWeight: '700', alignSelf: 'flex-end' }}>
            {a.sentAt ? 'Stop showing it' : 'Cancel'}
          </Text>
        )}
      </View>
    </Card>
  );
}
