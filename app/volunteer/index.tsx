/**
 * Volunteer: upcoming opportunities (people's time, and item requests with how much is
 * pledged), the ones you said yes to or pledged for, and (for leaders) the ones you lead. Volunteer Leaders and
 * coaches (an activity's coaches and directors) post opportunities and start events.
 * Opportunities that are part of an event (Harvest Fest) sit inside its card, which opens
 * the event; the rest follow under "Other opportunities". On a day you're volunteering, its
 * check-in (scan the leader's QR code) is at the top. Volunteer Leaders and directors open the volunteer analytics from here,
 * and everyone sees their own hours from My sign-ups. Invites waiting for your answer come first, each with Say Yes! and
 * Deny; opportunities only for invited people stay out of Opportunities (their leader finds them under Leading).
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isVolunteerLead, listVolunteer, myAccess, subscribeVolunteer, volunteerInviteAnswer,
  type Opportunity, type Person, type Signup, type VolunteerAttendance, type VolunteerEvent, type VolunteerInvite,
} from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { runsOn } from '../../src/volunteer/attendance';
import { MyCheckIn } from '../../src/volunteer/CheckIn';
import { useCanPost } from '../../src/volunteer/canPost';
import { Cheer } from '../../src/volunteer/Cheer';
import { daysLabel, isPast, nameOf, whenLabel } from '../../src/volunteer/format';
import { OpportunityCard, progress } from '../../src/volunteer/OpportunityCard';
import { EventBanner, GREEN, SectionTitle } from '../../src/volunteer/parts';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { ManageButton } from '../../src/ManageButton';
import { Button, C, Card, Chip, Loading, P, ask, s } from '../../src/ui';

type Tab = 'open' | 'mine' | 'leading';
type Kind = 'all' | Opportunity['kind'];
type Data = { opportunities: Opportunity[]; signups: Signup[]; events: VolunteerEvent[]; attendance: VolunteerAttendance[]; invites: VolunteerInvite[] };

export default function Volunteer() {
  return <VolunteerGate title="Volunteer">{(me) => <Opportunities me={me} />}</VolunteerGate>;
}

function Opportunities({ me }: { me: Person }) {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [kind, setKind] = useState<Kind>('all');
  const showPast = usePastToggle();
  const [director, setDirector] = useState(false);   // sees the analytics too (after verifying with their authenticator app)
  const [busy, setBusy] = useState<string | null>(null);   // the invite being answered
  const [cheer, setCheer] = useState<string | null>(null);   // celebrated after Say Yes!
  const lead = isVolunteerLead(me);   // analytics too
  const posts = !!useCanPost(me);      // Volunteer Leaders and coaches post opportunities and events

  const load = useCallback(() => listVolunteer().then(setData)
    .catch(() => setData({ opportunities: [], signups: [], events: [], attendance: [], invites: [] })), []);
  useFocusEffect(useCallback(() => { load(); return subscribeVolunteer(load); }, [load]));
  useEffect(() => { myAccess().then((a) => setDirector(!!a?.isDirector)).catch(() => {}); }, []);
  if (!data) return <Loading />;

  const signupsOf = (o: Opportunity) => data.signups.filter((x) => x.opportunityId === o.id);
  const said = (o: Opportunity) => signupsOf(o).some((x) => x.userId === me.id);
  // Where you're volunteering today, to check in and out.
  const today = schoolToday();
  const todays = data.opportunities.filter((o) => o.status === 'open' && o.kind === 'help' && runsOn(o, today) && said(o));
  const mineToday = (o: Opportunity) => data.attendance.find((a) => a.opportunityId === o.id && a.userId === me.id && a.day === today);
  const eventOf = (o: Opportunity) => data.events.find((e) => e.id === o.eventId);
  const invitesOf = (o: Opportunity) => data.invites.filter((i) => i.opportunityId === o.id);
  // Invites waiting for your answer (shown above the lists, not again in them).
  const asked = data.invites.filter((i) => i.userId === me.id && i.status === 'pending')
    .map((i) => ({ i, o: data.opportunities.find((o) => o.id === i.opportunityId) }))
    .filter((x): x is { i: VolunteerInvite; o: Opportunity } => !!x.o && x.o.status === 'open' && !isPast(x.o) && !said(x.o));
  const askedIds = new Set(asked.map((x) => x.o.id));
  const answer = (o: Opportunity, yes: boolean) => {
    const go = () => {
      setBusy(o.id);
      volunteerInviteAnswer(o.id, yes).then(() => { if (yes) setCheer(o.title); return load(); })
        .catch((e) => Alert.alert('Volunteer', e.message)).finally(() => setBusy(null));
    };
    if (yes) return go();
    const from = nameOf(data.invites.find((i) => i.opportunityId === o.id && i.userId === me.id)?.invitedBy ?? o.leadId);
    ask('Deny this invite?', `${from} will be told you can't help, so they can ask someone else.`, 'Deny', go);
  };
  // Like every calendar in the app: past opportunities stay out of view until asked for, then look greyed out.
  const all: Record<Tab, Opportunity[]> = {
    // Invite-only ones are private: yours to answer above, or under Leading.
    open: data.opportunities.filter((o) => o.status === 'open' && !o.inviteOnly && !askedIds.has(o.id)),
    mine: data.opportunities.filter(said),
    leading: data.opportunities.filter((o) => o.leadId === me.id),
  };
  const lists = Object.fromEntries(Object.entries(all).map(([t, list]) => [t, list.filter((o) => !isPast(o))])) as Record<Tab, Opportunity[]>;
  const past = tab === 'open' ? [] : all[tab].filter(isPast);
  // Volunteers or items, once there are both.
  const kinds = data.opportunities.some((o) => o.kind === 'items') && data.opportunities.some((o) => o.kind === 'help');
  const ofKind = (list: Opportunity[]) => (kinds && kind !== 'all' ? list.filter((o) => o.kind === kind) : list);
  // Opportunities: each event is one card holding its own (shown while it, or any of them, is still to come); the rest follow it.
  const inside = (e: VolunteerEvent) => ofKind(lists.open.filter((o) => o.eventId === e.id));
  const events = tab !== 'open' ? []
    : data.events.filter((e) => (kinds && kind !== 'all' ? inside(e).length > 0 : !isPast(e) || inside(e).length > 0));
  const shown = ofKind(showPast.shown ? [...lists[tab], ...past] : lists[tab]).filter((o) => tab !== 'open' || !eventOf(o));
  const tabs: Tab[] = posts || all.leading.length ? ['open', 'mine', 'leading'] : ['open', 'mine'];
  const empty: Record<Tab, string> = {
    open: 'No opportunities right now. Check back soon!',
    mine: 'When you Say Yes! to an opportunity, or pledge items, it shows up here.',
    leading: "You haven't posted an opportunity yet.",
  };

  return (
    <FlatList style={s.screen} contentContainerStyle={s.pad} data={shown} keyExtractor={(o) => o.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Stack.Screen options={{
            headerRight: lead || director ? () => (
              <ManageButton app="Volunteer" items={[
                { icon: 'stats-chart', label: 'Volunteer analytics', sub: "Hours, who came, and who's doing a lot", href: '/volunteer/stats' },
              ]} />
            ) : undefined,
          }} />
          {todays.map((o) => (
            <MyCheckIn key={o.id} o={o} mine={mineToday(o)} showTitle />
          ))}
          {asked.length > 0 && <SectionTitle icon="mail-outline" title={`Invitations (${asked.length})`} tint={GREEN} />}
          {asked.map(({ i, o }) => <InviteCard key={o.id} o={o} invite={i} busy={busy === o.id} onAnswer={(yes) => answer(o, yes)} />)}
          {posts && (
            <View style={s.row}>
              <View style={{ flex: 1 }}><Button label="+ Event" kind="ghost" onPress={() => router.push('/volunteer/event/new')} /></View>
              <View style={{ flex: 1 }}><Button label="+ Opportunity" onPress={() => router.push('/volunteer/new')} /></View>
            </View>
          )}
          <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
            {tabs.map((t) => (
              <Text key={t} onPress={() => { setTab(t); showPast.hide(); }}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                  backgroundColor: tab === t ? C.primary : '#fff', color: tab === t ? '#fff' : C.ink, fontWeight: '600' }}>
                {{ open: 'Opportunities', mine: 'My sign-ups', leading: 'Leading' }[t]} ({lists[t].length})
              </Text>
            ))}
          </View>
          {tab === 'mine' && (
            <LinkRow icon="time-outline" title="My volunteer hours" sub="Every shift you've done, and what's coming" onPress={() => router.push(`/volunteer/person/${me.id}`)} />
          )}
          {kinds && (
            <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
              {(['all', 'help', 'items'] as const).map((k) => (
                <Text key={k} onPress={() => setKind(k)} accessibilityRole="button" accessibilityState={{ selected: kind === k }}
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
                    borderColor: kind === k ? C.accent : C.line, color: kind === k ? C.accent : C.muted, fontWeight: '700', fontSize: 13 }}>
                  {{ all: 'All', help: 'Volunteers', items: 'Items needed' }[k]}
                </Text>
              ))}
            </View>
          )}
          {events.length > 0 && <SectionTitle icon="calendar-outline" title="Events" tint={C.accent} />}
          {events.map((e) => <EventCard key={e.id} e={e} opportunities={inside(e)} signups={data.signups} me={me} />)}
          {events.length > 0 && shown.length > 0 && <SectionTitle icon="hand-left-outline" title="Other opportunities" />}
        </View>}
      ListEmptyComponent={events.length ? null : <Card><P muted>{empty[tab]}</P></Card>}
      renderItem={({ item: o }) => <OpportunityCard o={o} signups={signupsOf(o)} me={me} event={eventOf(o)?.title} invites={invitesOf(o)} />}
      ListFooterComponentStyle={{ gap: 12 }}
      ListFooterComponent={<>
        <PastToggle count={past.length} shown={showPast.shown} onToggle={showPast.toggle} noun="opportunities" />
        <Cheer title={cheer} onDone={() => setCheer(null)} />
      </>} />
  );
}

/** An invite waiting for your answer: what and when, who asked (and their note), and Say Yes! or Deny. */
function InviteCard({ o, invite, busy, onAnswer }: { o: Opportunity; invite: VolunteerInvite; busy: boolean; onAnswer: (yes: boolean) => void }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 18, borderWidth: 2, borderColor: GREEN, overflow: 'hidden' }}>
      <Pressable onPress={() => router.push(`/volunteer/${o.id}`)} accessibilityRole="button"
        accessibilityLabel={`${o.title}, ${whenLabel(o)}, invited by ${nameOf(invite.invitedBy ?? o.leadId)}`}
        style={({ pressed }) => [{ padding: 14, gap: 4 }, pressed && { opacity: 0.85 }]}>
        <Text style={{ color: GREEN, fontWeight: '800', fontSize: 13 }}>✉️ {nameOf(invite.invitedBy ?? o.leadId)} invited you</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{o.title}</Text>
        <P muted>{whenLabel(o)}{o.location ? ` · ${o.location}` : ''}</P>
        {!!invite.note && <Text style={{ color: C.ink, fontStyle: 'italic' }}>“{invite.note}”</Text>}
      </Pressable>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line }}>
        <Pressable disabled={busy} onPress={() => onAnswer(true)} accessibilityRole="button" accessibilityLabel={`Say Yes! to ${o.title}`}
          style={({ pressed }) => [{ flex: 2, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, backgroundColor: GREEN },
            (pressed || busy) && { opacity: 0.8 }]}>
          <Ionicons name="hand-left" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Say Yes!</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => onAnswer(false)} accessibilityRole="button" accessibilityLabel={`Deny ${o.title}`}
          style={({ pressed }) => [{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 }, (pressed || busy) && { opacity: 0.6 }]}>
          <Text style={{ color: C.danger, fontWeight: '800', fontSize: 16 }}>Deny</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** An event's card: its banner, how many opportunities it has, how many still need help, and whether you're helping. */
function EventCard({ e, opportunities, signups, me }: { e: VolunteerEvent; opportunities: Opportunity[]; signups: Signup[]; me: Person }) {
  const ofThis = (o: Opportunity) => signups.filter((x) => x.opportunityId === o.id);
  const needHelp = opportunities.filter((o) => !progress(o, ofThis(o)).full).length;
  const helping = opportunities.some((o) => ofThis(o).some((x) => x.userId === me.id));
  const count = `${opportunities.length} ${opportunities.length === 1 ? 'opportunity' : 'opportunities'}`;
  return (
    <Pressable onPress={() => router.push(`/volunteer/event/${e.id}`)} accessibilityRole="button"
      accessibilityLabel={`${e.title}, event, ${daysLabel(e)}${e.location ? `, ${e.location}` : ''}, ${count}`}
      style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }, pressed && { opacity: 0.85 }]}>
      <EventBanner e={e} />
      <View style={[s.row, { padding: 14, gap: 8 }]}>
        <View style={{ flex: 1, gap: 6 }}>
          <P muted>{daysLabel(e)}</P>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            <View style={[s.row, { gap: 4 }]}>
              <Ionicons name="list" size={16} color={C.primary} />
              <Text style={{ color: C.primary, fontWeight: '700' }}>{opportunities.length ? count : 'Opportunities coming soon'}</Text>
            </View>
            {needHelp > 0 ? <Text style={{ color: GREEN, fontWeight: '700' }}>{needHelp === opportunities.length ? 'Help needed' : `${needHelp} still need help`}</Text>
              : opportunities.length > 0 && <Text style={{ color: C.muted, fontWeight: '700' }}>All filled. Thank you!</Text>}
            {helping && <Chip label="You're helping" color={GREEN} />}
            {e.leadId === me.id && <Chip label="You lead" color={C.accent} />}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color={C.muted} />
      </View>
    </Pressable>
  );
}

/** A card that opens another Volunteer screen. */
function LinkRow({ icon, title, sub, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={title}
      style={({ pressed }) => [s.card, s.row, { padding: 14, gap: 12 }, pressed && { opacity: 0.85 }]}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${GREEN}1A`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={GREEN} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{title}</Text>
        <Text style={{ color: C.muted }}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={C.muted} />
    </Pressable>
  );
}
