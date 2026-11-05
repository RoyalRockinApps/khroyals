import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ComponentProps } from 'react';
import { AppState, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect, useNavigation, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  canVolunteer, carlineConfig, checkAssignment, childAssignments, isFamily, isSchoolStaff, isSubstitute, listAssignments, listSports, listVolunteer,
  listAlbums, listDressDays, live, me, myCalendar, myChildren, myForms, myPickupChildren, mySportSchedule, onAuthChange, session, sportRegistrations, staffToday, subscribeAssignments,
  type Assignment, type DressDay, type GalleryAlbum, type Person,
} from '../../src/api/connect';
import { getCalendar, getNews } from '../../src/api/mockApi';
import { schoolToday } from '../../src/calendar/past';
import { AlbumCard } from '../../src/gallery/AlbumCard';
import { DayPager } from '../../src/info/DayPager';
import { needsYou, type NeedRow } from '../../src/info/needsYou';
import { CheckInCard } from '../../src/onsite/CheckInCard';
import { NO_DATA, planDay, type InfoData } from '../../src/info/plan';
import { useStaffView } from '../../src/staffView';
import { addDays, greeting, headerDate, nextTwoWeeks, schoolHour, twoWeeks } from '../../src/info/today';
import { TodaySection } from '../../src/info/TodaySection';
import { ArticleCard } from '../../src/site/Blocks';
import { SCHOOL } from '../../src/school';
import { C, Card, FONT_STYLE, H, Loading, P, s, useLoad } from '../../src/ui';
import { dateRange } from '../../src/site/calendar';

/**
 * Planner: today's date in the header, a greeting, the next two weeks one day at a time
 * (swipe, or tap a day in the strip; it opens on today): the uniform, assignments, a
 * card for each of a parent's children, and the day's events, activities, volunteer
 * sign-ups and car line hours. Teachers and staff (on the Staff view) and substitutes first get Checking in at school
 * (src/onsite/CheckInCard.tsx), then Needs you today: what's
 * waiting on them across the apps (staff_today), each opening its screen. Then the school calendar's next two weeks, the school's newsletter
 * (Royal News) and the latest news. (The school website's home page's other sections aren't shown here; its F.A.Q.s are
 * in Ask the School.)
 */
export default function Home() {
  const now = useMinute();
  const today = schoolToday(now);
  const navigation = useNavigation();
  useLayoutEffect(() => { navigation.setOptions({ headerTitle: headerDate(today) }); }, [navigation, today]);

  const person = usePerson();
  const { data } = useLoad(async () => ({ news: await getNews(), cal: await getCalendar() }));
  const { info, toggle } = useInfoData(person, today);
  const dress = useDressDays(today);
  const photos = useLatestPhotos(person);
  const needs = useNeedsYou(person);
  const staffView = useStaffView(person);
  const events = data?.cal.events;
  const plans = useMemo(() => events
    ? twoWeeks(today).map((d) => planDay(d, today, events, info, person?.schoolRole === 'student' ? [person.grade] : [], dress))
    : [], [events, today, info, person, dress]);

  // Opens on today: again at midnight (a day picked yesterday doesn't count) and whenever
  // the app comes back to the front.
  const [pick, setPick] = useState({ on: today, index: 0 });
  const index = pick.on === today ? pick.index : 0;
  const setIndex = (i: number) => setPick({ on: today, index: i });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') setPick((p) => ({ ...p, index: 0 })); });
    return () => sub.remove();
  }, []);

  if (!data || !events || !plans.length) return <Loading />;
  const next = nextTwoWeeks(events, today);

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 22 }]}>
      <Text style={{ fontSize: 28, ...FONT_STYLE.heading, color: C.primary }} accessibilityRole="header">{greeting(schoolHour(now), person)}</Text>

      {(staffView || isSubstitute(person)) && <CheckInCard />}
      {needs.length > 0 && <NeedsYou rows={needs} />}

      <DayPager plans={plans} index={index} onIndex={setIndex} render={(p) => <TodaySection plan={p} onToggle={toggle} />} />

      <View style={{ gap: 8 }}>
        <H>Coming Up</H>
        {next.length === 0 && (
          <Card style={{ gap: 4 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>Stay tuned!</Text>
            <P muted>Nothing on the school calendar in the next two weeks.</P>
          </Card>
        )}
        {next.map((e) => (
          <Card key={e.id} onPress={() => router.navigate('/calendar')} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text style={{ fontWeight: '800', color: C.primary, width: 86 }}>{dateRange(e)}</Text>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: C.ink }}>{e.title}</Text><P muted>{e.category}</P></View>
          </Card>
        ))}
        <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.navigate('/calendar')}>Full calendar ›</Text>
      </View>

      <Card onPress={() => (SCHOOL.newsUrl ? Linking.openURL(SCHOOL.newsUrl) : router.navigate('/royal-news'))}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${C.primary}1A`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="mail-open-outline" size={22} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{SCHOOL.newsName}</Text>
          <P muted>The school newsletter, sent to families by email. Read this week's and past issues.</P>
        </View>
        <Ionicons name={SCHOOL.newsUrl ? 'open-outline' : 'chevron-forward'} size={18} color={C.muted} />
      </Card>

      {photos.length > 0 && (
        <View style={{ gap: 8 }}>
          <H>Latest Photos</H>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {photos.map((a) => <AlbumCard key={a.id} a={a} width={220} />)}
          </ScrollView>
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.navigate('/photos')}>All photos ›</Text>
        </View>
      )}

      {data.news.articles.length > 0 && (
        <View style={{ gap: 8 }}>
          <H>Latest News</H>
          {data.news.articles.slice(0, 3).map((a) => <ArticleCard key={a.id} a={a} compact />)}
          <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.navigate('/news')}>All news ›</Text>
        </View>
      )}
    </ScrollView>
  );
}

/** Teachers and staff on the Staff view: what's waiting on them today, reloaded whenever the Planner comes back. */
function useNeedsYou(person: Person | null) {
  const staff = useStaffView(person);
  const [rows, setRows] = useState<NeedRow[]>([]);
  useFocusEffect(useCallback(() => {
    if (!staff) { setRows([]); return; }
    let on = true;
    staffToday().then((t) => on && setRows(needsYou(t))).catch(() => {});
    return () => { on = false; };
  }, [staff]));
  return rows;
}

/**
 * Needs you today: each thing waiting, opening the screen that deals with it. Its heading folds it away (to a line
 * of how many) and back; it opens unfolded each time the Planner starts.
 */
function NeedsYou({ rows }: { rows: NeedRow[] }) {
  const AMBER = '#B45309';
  const [open, setOpen] = useState(true);
  const todo = rows.filter((r) => r.tone === 'todo').length;
  const info = rows.length - todo;
  const summary = [todo && `${todo} to do`, info && `${info} ${info === 1 ? 'heads-up' : 'heads-ups'}`].filter(Boolean).join(' · ');
  return (
    <Card style={{ gap: 2, paddingVertical: 10 }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`Needs you today: ${summary}`} hitSlop={6}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }, pressed && { opacity: 0.6 }]}>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted }}>NEEDS YOU TODAY</Text>
        {!open && <Text style={{ color: todo ? AMBER : C.primary, fontWeight: '700' }}>{summary}</Text>}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {open && rows.map((r) => {
        const color = r.tone === 'todo' ? AMBER : C.primary;
        return (
          <Pressable key={r.key} onPress={() => router.push(r.href as Href)} accessibilityRole="button" accessibilityLabel={r.title}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }, pressed && { opacity: 0.6 }]}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${color}1A`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={r.icon as ComponentProps<typeof Ionicons>['name']} size={19} color={color} />
            </View>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: r.tone === 'todo' ? '700' : '500', color: C.ink }}>{r.title}</Text>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </Pressable>
        );
      })}
    </Card>
  );
}

/** The time, updated every minute (for the greeting, and the date at midnight). */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The signed-in person, kept current as they sign in and out. */
function usePerson() {
  const [person, setPerson] = useState<Person | null>(() => me());
  useEffect(() => {
    const check = () => session().then(setPerson).catch(() => {});
    check();
    return onAuthChange(check);
  }, []);
  useFocusEffect(useCallback(() => { setPerson(me()); }, []));
  return person;
}

/**
 * What the two weeks hold for the signed-in person, loaded once: a student's assignments
 * (or a teacher's for their classes); a parent's children with their class assignments,
 * activity sign-ups and forms to sign; activities; volunteer sign-ups; and car line hours for whoever
 * picks children up; and a teacher's or staff member's own calendar. Each part loads on its own and is left out if it fails. Reloads
 * when the screen comes back into view and when assignments change.
 */
/** The newest photo albums with photos in them, for signed-in, approved people; again whenever the Planner comes into view. */
function useLatestPhotos(person: Person | null) {
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const ok = !!person && !person.pending;
  useFocusEffect(useCallback(() => {
    // A new grade or event album is empty until staff add photos.
    if (ok) listAlbums({ limit: 30 }).then((list) => setAlbums(list.filter((a) => a.count > 0).slice(0, 6))).catch(() => {}); else setAlbums([]);
  }, [ok]));
  return albums;
}

/** Dress-up days (Spirit Week) in the two weeks the Planner shows; again whenever it comes into view. */
function useDressDays(today: string) {
  const [days, setDays] = useState<DressDay[]>([]);
  useFocusEffect(useCallback(() => {
    listDressDays(today, addDays(today, 13)).then(setDays).catch(() => {});
  }, [today]));
  return days;
}

function useInfoData(person: Person | null, today: string) {
  const [info, setInfo] = useState<InfoData>(NO_DATA);
  const id = person && !person.pending ? person.id : null;
  const student = person?.schoolRole === 'student';
  const staff = isSchoolStaff(person);
  const load = useCallback(async () => {
    if (!live || !person || !id) { setInfo(NO_DATA); return; }
    const quiet = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    const [assignments, schedule, sports, volunteer, kids, pickup] = await Promise.all([
      student || staff ? quiet(listAssignments(), []) : [],
      quiet(mySportSchedule(15), []),
      quiet(listSports(), { sports: [], seasons: [] }),
      canVolunteer(person) ? quiet(listVolunteer(), { opportunities: [], signups: [], events: [], attendance: [], invites: [] }) : { opportunities: [], signups: [], events: [], attendance: [], invites: [] },
      // Parents (staff too, when they're parents); Family accounts aren't.
      !student && !isFamily(person) ? quiet(myChildren(), [] as Person[]) : [],
      student ? [] : quiet(myPickupChildren(), [] as Person[]),
    ]);
    const seasons = [...new Set(schedule.map((e) => e.seasonId))];
    const [kidAssignments, forms, registrations, config, mine] = await Promise.all([
      kids.length ? quiet(childAssignments(today, addDays(today, 13)), []) : [],
      kids.length ? quiet(myForms(), []) : [],
      kids.length && seasons.length ? quiet(sportRegistrations(seasons), []) : [],
      pickup.length ? quiet(carlineConfig(), null) : null,
      staff ? quiet(myCalendar(today, addDays(today, 13)), []) : [],
    ]);
    setInfo({
      assigns: student ? 'student' : staff ? 'teacher' : null,
      // Teachers see what they've assigned to their classes, like in the Assignments app.
      assignments: student ? assignments : assignments.filter((a) => a.ownerId === id && a.rosterId),
      kids: kids.map((k) => ({ id: k.id, firstName: k.firstName, grade: k.grade })),
      kidAssignments, schedule, sports: sports.sports, seasons: sports.seasons, registrations,
      forms: forms.filter((f) => f.status === 'open').map((f) => ({
        id: f.id, title: f.title, dueOn: f.dueOn, waiting: f.children.filter((c) => !c.response).map((c) => c.studentId),
      })),
      opportunities: volunteer.opportunities, signups: volunteer.signups.filter((x) => x.userId === id),
      carline: config ? { start: config.start, end: config.end, openNow: config.line.state === 'open' } : null,
      myCalendar: mine,
    });
  }, [person, id, student, staff, today]);
  const tracks = !!id && (student || staff);
  useFocusEffect(useCallback(() => { load(); return tracks ? subscribeAssignments(load) : undefined; }, [load, tracks]));

  /** A student checks one off (or back on): show it at once, then save. */
  const toggle = useCallback((a: Assignment) => {
    setInfo((d) => ({ ...d, assignments: d.assignments.map((x) => (x.id === a.id ? { ...x, done: !a.done } : x)) }));
    checkAssignment(a.id, !a.done).catch(() => {}).finally(load);
  }, [load]);
  return { info, toggle };
}
