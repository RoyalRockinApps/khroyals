/**
 * One activity (a sport, show, ensemble, club…): a navy banner with its team photo, who leads it and Follow (★), then
 * tabs (src/sports/team/TabBar.tsx) so each part has its own place:
 *   Home: what needs you (sign-ups waiting for its leaders, new messages in the parent chat), what's next, the latest
 *     from the board, and its current and next seasons with sign-up for your children.
 *   Schedule: games, practices and rehearsals (past ones behind a toggle), with Are you going? and tickets.
 *   Board, Roster and Chat: the team's own space (src/sports/team): news from its leaders, who's on the team, and its
 *     parents' chat. Only the team sees them (its students and parents, and its leaders); students don't see the chat.
 *   Photos: this school year's album, for every approved account.
 * Its leaders change the team photo from the header's gear; activity managers also edit the activity and who leads
 * it there. Demo builds (no server) show every tab with Volleyball's sample team.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  canBuyTickets, canManageSport, followSport, getUser, isFamily, isSubstitute, listSports, live, myAccess, myChildren, mySports,
  registerForSport, removeSportPhoto, session, sportRegistrations, sportSchedule, subscribeSports, teamAccess, uploadSportPhoto,
  withdrawSportRegistration, type Access, type Person, type Sport, type SportEvent, type SportRegistration, type SportSeason,
} from '../../src/api/connect';
import { ManageButton, type ManageItem } from '../../src/ManageButton';
import { pickSquarePhoto } from '../../src/photos';
import { AttendanceLine, RsvpButton, SportAvatar } from '../../src/sports/cards';
import { useEventPeople } from '../../src/sports/hooks';
import { noteActivityViewed } from '../../src/sports/recent';
import { isPastTime, splitPast } from '../../src/calendar/past';
import { PastToggle, usePastToggle } from '../../src/calendar/PastToggle';
import { categoryInfo, leaders } from '../../src/sports/categories';
import { activeSeasons, dateRange, eligible, gradesLabel, schoolToday, seasonState, shortDay, signupState } from '../../src/sports/seasons';
import { Board } from '../../src/sports/team/Board';
import { Roster } from '../../src/sports/team/Roster';
import { TabBar, isTab, type TabKey } from '../../src/sports/team/TabBar';
import { TeamChat } from '../../src/sports/team/TeamChat';
import { TeamPhotos } from '../../src/sports/team/TeamPhotos';
import { useTeamFeed } from '../../src/sports/team/useTeamFeed';
import { EventRow, GOLD, GOLD_LIGHT, NAVY, StarButton, Tag } from '../../src/sports/ui';
import { TicketButtons, useTicketsOnSale } from '../../src/tickets/parts';
import { Button, C, Card, H, Loading, P, s } from '../../src/ui';

const name = (id: string | null) => { const p = id ? getUser(id) : undefined; return p ? `${p.firstName} ${p.lastName}` : 'Someone'; };
const confirm = (title: string, ok: string, go: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(title)) go(); return; }
  Alert.alert(title, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: ok, style: 'destructive', onPress: go }]);
};
const fail = (e: any) => Alert.alert('Activities', e?.message ?? String(e));
const Label = ({ title }: { title: string }) => (
  <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5, marginTop: 4 }}>{title.toUpperCase()}</Text>
);

export default function SportPage() {
  const { id, tab: asked } = useLocalSearchParams<{ id: string; tab?: string }>();
  const [sport, setSport] = useState<Sport | null | undefined>(undefined);
  const [seasons, setSeasons] = useState<SportSeason[]>([]);
  const [events, setEvents] = useState<SportEvent[]>([]);
  const [regs, setRegs] = useState<SportRegistration[]>([]);
  const [kids, setKids] = useState<Person[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [following, setFollowing] = useState(false);
  // The tab picked here, for the link that opened the page (a notification can open it on the Board).
  const [picked, setPicked] = useState<{ for: string | undefined; tab: TabKey } | null>(null);
  const past = usePastToggle();
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const today = schoolToday();
  const load = useCallback(async () => {
    try {
      const p = await session();
      const d = await listSports();  // after session(), so the team photo is signed for approved accounts
      noteActivityViewed(id);
      const sp = d.sports.find((x) => x.id === id) ?? null;
      const active = sp ? activeSeasons(d.seasons, sp.id, schoolToday()) : [];
      const ids = active.map((x) => x.id);
      const approved = !!p && !p.pending;
      const [ev, rg, ks, mine, a] = await Promise.all([
        // Family accounts follow activities but don't sign children up.
        sportSchedule(ids, { past: true }), approved ? sportRegistrations(ids) : [], approved && !isFamily(p) ? myChildren() : [],
        approved ? mySports() : [], approved ? myAccess().catch(() => null) : null,
      ]);
      setSport(sp); setSeasons(active); setEvents(ev); setRegs(rg); setKids(ks); setMe(p); setAccess(a);
      setFollowing(mine.some((m) => m.sportId === id && m.following));
    } catch (e) {
      fail(e);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const upcomingEvents = events.filter((e) => !isPastTime(e.startsAt, e.endsAt));
  const rsvp = useEventPeople(me, upcomingEvents);
  const onSale = useTicketsOnSale();
  useEffect(() => subscribeSports(() => { load(); rsvp.reload(); }), [load, rsvp.reload]);

  // Who's on the team decides the Board, Roster and Chat (demo builds, without the server, show them all).
  const team = live ? teamAccess(sport, access, me, regs, kids) : { leader: !!sport && canManageSport(sport, access, me), onTeam: true, inChat: true };
  const feed = useTeamFeed(id, team.onTeam, team.inChat, me?.id ?? null);
  const approved = !!me && !me.pending;
  const tabs: TabKey[] = ['home', 'schedule', ...(team.onTeam ? ['board', 'roster'] as const : []),
    // The photo gallery is for approved accounts, never substitutes.
    ...(approved && !isSubstitute(me) ? ['photos'] as const : []), ...(team.inChat ? ['chat'] as const : [])];
  const want = picked && picked.for === asked ? picked.tab : isTab(asked) ? asked : 'home';
  const tab: TabKey = tabs.includes(want) ? want : 'home';
  const chatOpen = tab === 'chat';
  useEffect(() => { if (chatOpen) feed.markSeen(); }, [chatOpen, feed.markSeen]);
  // The chat opens at its newest messages, beside the box to write one.
  useEffect(() => {
    if (!chatOpen) return;
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(t);
  }, [chatOpen, feed.chat.length]);
  const teamPhoto = useTeamPhoto(sport, load);
  const refresh = async () => { setRefreshing(true); await Promise.all([load(), rsvp.reload(), feed.reload()]); setRefreshing(false); };

  if (sport === undefined) return <><Stack.Screen options={{ title: 'Activities' }} /><Loading /></>;
  if (!sport) return <View style={[s.screen, s.pad]}><Stack.Screen options={{ title: 'Activities' }} /><Card><H>That activity is gone</H></Card></View>;

  const manage = team.leader;
  const isManager = !!access?.permissions.includes('sports.manage');
  const category = categoryInfo(sport.category);
  const leaderWord = leaders(sport.category, 2).toLowerCase();
  // Like every calendar in the app: past items stay out of view until asked for, then look greyed out.
  const schedule = splitPast(events, (e) => isPastTime(e.startsAt, e.endsAt));
  const toggleFollow = () => {
    if (!approved) { Alert.alert('Follow', 'Sign in on the Connect tab to follow activities.'); return; }
    setFollowing(!following);
    followSport(sport.id, !following).catch((e) => { setFollowing(following); fail(e); });
  };
  const go = (t: TabKey) => { setPicked({ for: asked, tab: t }); scroll.current?.scrollTo({ y: 0, animated: false }); };
  const gear: ManageItem[] = [
    ...(manage && approved ? [{ icon: 'camera-outline' as const, label: sport.photoPath ? 'Change the team photo' : 'Add a team photo',
      sub: 'Families and staff see it on the activity and its events', onPress: teamPhoto.ask }] : []),
    ...(isManager ? [{ icon: 'create-outline' as const, label: 'Edit activity', sub: `Its name, category, description and ${leaderWord}`,
      href: { pathname: '/activities/edit' as const, params: { id: sport.id } } }] : []),
  ];
  const eventRow = (e: SportEvent, isPast = false) => {
    const people = rsvp.peopleFor(e);
    const att = rsvp.attendanceFor(e);
    return (
      <EventRow key={e.id} e={e} past={isPast}
        onPress={manage ? () => router.push({ pathname: '/activities/event', params: { sport: sport.id, id: e.id } }) : undefined}
        footer={people.length || att.length || onSale.has(e.id) || manage ? (
          <>
            <AttendanceLine rows={att} />
            <RsvpButton e={e} people={people} answers={rsvp.answers} onChange={rsvp.reload} />
            <TicketButtons eventId={e.id} onSale={onSale.get(e.id)} buyer={canBuyTickets(me)} leader={manage} />
          </>
        ) : undefined} />
    );
  };
  const pending = manage ? regs.filter((r) => r.status === 'pending').length : 0;
  const latest = feed.bulletins[0];

  return (
    <>
      <Stack.Screen options={{ title: sport.name, headerRight: () => <ManageButton app={sport.name} items={gear} /> }} />
      <ScrollView ref={scroll} style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[1]}
        automaticallyAdjustKeyboardInsets refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.primary} />}>
        <View style={{ backgroundColor: NAVY, borderRadius: 18, padding: 16, gap: 10, borderBottomWidth: 4, borderBottomColor: GOLD }}>
          <View style={[s.row, { gap: 14 }]}>
            <SportAvatar sport={sport} size={72} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }} numberOfLines={2}>{sport.name}</Text>
              <Text style={{ color: GOLD_LIGHT, fontSize: 13, fontWeight: '700' }}>{category.emoji} {category.label}</Text>
              {sport.coachIds.length > 0 && (
                <Text style={{ color: '#fff', opacity: 0.85, fontSize: 13 }} numberOfLines={2}>
                  {leaders(sport.category, sport.coachIds.length)}: {sport.coachIds.map(name).join(', ')}
                </Text>
              )}
            </View>
            <StarButton following={following} onPress={toggleFollow} onDark />
          </View>
          {!!sport.description && <Text style={{ color: '#fff', opacity: 0.85, fontSize: 14, lineHeight: 19 }}>{sport.description}</Text>}
          {teamPhoto.busy && <Text style={{ color: GOLD_LIGHT, fontWeight: '700' }}>Uploading the team photo…</Text>}
        </View>

        <TabBar tabs={tabs} value={tab} onChange={go} dot={feed.unread > 0 && !chatOpen ? 'chat' : null} />

        <View style={{ gap: 12 }}>
          {tab === 'home' && (
            <>
              {pending > 0 && (
                <Nudge icon="person-add" color="#B45309" text={`${pending} sign-up${pending === 1 ? '' : 's'} waiting for you`} onPress={() => go('roster')} />
              )}
              {team.inChat && feed.unread > 0 && (
                <Nudge icon="chatbubbles" color={C.primary} text={`${feed.unread} new message${feed.unread === 1 ? '' : 's'} in the parent chat`} onPress={() => go('chat')} />
              )}

              <Label title="Next up" />
              {schedule.upcoming.length ? (
                <>
                  {eventRow(schedule.upcoming[0])}
                  <Text style={more} onPress={() => go('schedule')} accessibilityRole="button">
                    {schedule.upcoming.length > 1 ? `See the whole schedule (${schedule.upcoming.length} coming up) ›` : 'See the schedule ›'}
                  </Text>
                </>
              ) : <Card><P muted>Nothing coming up on the schedule.</P></Card>}

              {team.onTeam && latest && (
                <>
                  <Label title={`From the ${leaders(sport.category, sport.coachIds.length === 1 ? 1 : 2).toLowerCase()}`} />
                  <Card onPress={() => go('board')} style={{ gap: 4, borderLeftWidth: latest.pinned ? 4 : 1, borderLeftColor: latest.pinned ? GOLD : C.line }}>
                    {!!latest.title && <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{latest.title}</Text>}
                    <Text style={{ color: C.ink, lineHeight: 20 }} numberOfLines={3}>{latest.body}</Text>
                    <Text style={[more, { marginTop: 4 }]}>
                      {feed.bulletins.length > 1 ? `Open the board (${feed.bulletins.length} posts) ›` : 'Open the board ›'}
                    </Text>
                  </Card>
                </>
              )}

              <Label title={seasons.length > 1 ? 'Seasons and sign-ups' : 'Season and sign-ups'} />
              {seasons.length === 0 && <Card><P muted>No season is scheduled yet. Follow it to hear when sign-ups open.</P></Card>}
              {seasons.map((season) => (
                <SeasonCard key={season.id} season={season} today={today} kids={kids} regs={regs.filter((r) => r.seasonId === season.id)}
                  approved={approved} manage={manage} leader={category.leader.toLowerCase()} onChange={load} />
              ))}
              {approved && !following && (
                <P muted>Follow it with the ★ to see its schedule in Activities and hear about changes and sign-ups.</P>
              )}
            </>
          )}

          {tab === 'schedule' && (
            <>
              {manage && (
                <View style={s.row}>
                  <View style={{ flex: 2 }}>
                    <Button label="+ Add an event" onPress={() => router.push({ pathname: '/activities/event', params: { sport: sport.id } })} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="+ Season" kind="ghost" onPress={() => router.push({ pathname: '/activities/season', params: { sport: sport.id } })} />
                  </View>
                </View>
              )}
              <PastToggle count={schedule.past.length} shown={past.shown} onToggle={past.toggle} />
              {past.shown && schedule.past.map((e) => eventRow(e, true))}
              {schedule.upcoming.map((e) => eventRow(e))}
              {schedule.upcoming.length === 0 && <Card><P muted>Nothing coming up on the schedule.</P></Card>}
            </>
          )}

          {tab === 'board' && <Board sportId={sport.id} posts={feed.bulletins} leader={manage} leaders={leaderWord} onChange={feed.reload} />}
          {tab === 'roster' && <Roster sportId={sport.id} leader={manage} regs={regs} seasons={seasons} onChange={load} />}
          {tab === 'photos' && <TeamPhotos sportId={sport.id} name={sport.name} leader={manage} leaders={leaderWord} />}
          {tab === 'chat' && (
            <TeamChat sportId={sport.id} messages={feed.chat} meId={me?.id ?? null} leaderIds={sport.coachIds} leader={manage}
              title={category.leader} leaders={leaderWord} onChange={feed.reload} />
          )}
        </View>
      </ScrollView>
    </>
  );
}

const more = { color: C.primary, fontWeight: '700' } as const;

/** Something waiting on this person, as a tappable line on the Home tab. */
function Nudge({ icon, color, text, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14,
        backgroundColor: `${color}14`, borderWidth: 1, borderColor: `${color}55` }, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ flex: 1, fontWeight: '700', color }}>{text}</Text>
      <Ionicons name="chevron-forward" size={18} color={color} />
    </Pressable>
  );
}

/** Coaches/directors and activity managers: take, choose or remove the team photo (from the header's gear). */
function useTeamPhoto(sport: Sport | null | undefined, onChange: () => void) {
  const [busy, setBusy] = useState(false);
  const choose = async (camera: boolean) => {
    if (!sport) return;
    const photo = await pickSquarePhoto(camera);
    if (!photo) return;
    setBusy(true);
    try { await uploadSportPhoto(sport.id, photo, sport.photoPath); onChange(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const ask = () => {
    if (!sport) return;
    if (Platform.OS === 'web') { choose(false); return; }
    Alert.alert('Team photo', 'Families and staff see it on this activity and its events.', [
      { text: 'Take a photo', onPress: () => choose(true) },
      { text: 'Choose from library', onPress: () => choose(false) },
      ...(sport.photoPath ? [{ text: 'Remove photo', style: 'destructive' as const,
        onPress: () => { removeSportPhoto(sport.id, sport.photoPath).then(onChange).catch(fail); } }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };
  return { busy, ask };
}

/** A season: dates, grades, details, info link and, for parents, each child's sign-up. */
function SeasonCard({ season, today, kids, regs, approved, manage, leader, onChange }: {
  season: SportSeason; today: string; kids: Person[]; regs: SportRegistration[]; approved: boolean; manage: boolean; leader: string; onChange: () => void;
}) {
  const state = signupState(season, today);
  const grades = gradesLabel(season);
  return (
    <Card style={{ gap: 8 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink, flex: 1 }}>{season.name}</Text>
        <Tag label={seasonState(season, today) === 'in-season' ? 'Happening now' : 'Coming up'} color={seasonState(season, today) === 'in-season' ? '#15803D' : C.primary} />
      </View>
      <P muted>{[dateRange(season.startsOn, season.endsOn), grades].filter(Boolean).join(' · ')}</P>
      {!!season.details && <P>{season.details}</P>}
      {!!season.infoUrl && (
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => Linking.openURL(season.infoUrl!)}>Season information ↗</Text>
      )}
      {state !== 'none' && (
        <Text style={{ fontWeight: '700', color: state === 'open' ? '#15803D' : C.muted }}>
          {state === 'open' ? `Sign-ups open until ${shortDay(season.signupCloses!)}`
            : state === 'soon' ? `Sign-ups open ${shortDay(season.signupOpens!)}` : 'Sign-ups are closed'}
        </Text>
      )}
      {approved && kids.map((k) => (
        <ChildSignUp key={k.id} kid={k} season={season} reg={regs.find((r) => r.studentId === k.id)} open={state === 'open'} leader={leader} onChange={onChange} />
      ))}
      {state === 'open' && approved && kids.length === 0 && !manage && <P muted>Parents sign their children up here.</P>}
      {manage && (
        <Text style={{ color: C.primary, fontWeight: '700' }}
          onPress={() => router.push({ pathname: '/activities/season', params: { sport: season.sportId, id: season.id } })}>Edit season</Text>
      )}
    </Card>
  );
}

/** One child's sign-up for a season: status, and Sign up or Withdraw. */
function ChildSignUp({ kid, season, reg, open, leader, onChange }: {
  kid: Person; season: SportSeason; reg?: SportRegistration; open: boolean; leader: string; onChange: () => void;
}) {
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const active = reg && (reg.status === 'pending' || reg.status === 'registered');
  const can = eligible(season, kid.grade);
  const submit = () => {
    setBusy(true);
    registerForSport(season.id, kid.id, note.trim()).then(() => { setWriting(false); setNote(''); onChange(); }).catch(fail).finally(() => setBusy(false));
  };
  const status = reg?.status === 'registered' ? '✓ Registered'
    : reg?.status === 'pending' ? `Waiting for the ${leader} to approve`
      : reg?.status === 'declined' ? `Not accepted${reg.decisionNote ? `: ${reg.decisionNote}` : ''}` : !can ? `Not eligible (${gradesLabel(season)})` : '';
  return (
    <View style={{ gap: 6, borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{kid.firstName} {kid.lastName}</Text>
          {!!status && <Text style={{ color: reg?.status === 'registered' ? '#15803D' : C.muted }}>{status}</Text>}
        </View>
        {active ? (
          <Text style={{ color: C.danger, fontWeight: '700' }}
            onPress={() => confirm(`Withdraw ${kid.firstName} from ${season.name}?`, 'Withdraw', () => withdrawSportRegistration(reg!.id).then(onChange).catch(fail))}>
            Withdraw
          </Text>
        ) : open && can && !writing ? (
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => setWriting(true)}>Sign up</Text>
        ) : null}
      </View>
      {writing && (
        <>
          <TextInput style={[s.input, { minHeight: 60 }]} multiline placeholder={`Anything the ${leader} should know? (optional)`} value={note} onChangeText={setNote}
            accessibilityLabel={`Note for ${kid.firstName}'s sign-up`} />
          <View style={[s.row, { justifyContent: 'flex-end' }]}>
            <Button label="Cancel" kind="ghost" onPress={() => setWriting(false)} />
            <Button label={busy ? 'Sending…' : `Sign up ${kid.firstName}`} disabled={busy} onPress={submit} />
          </View>
        </>
      )}
    </View>
  );
}
