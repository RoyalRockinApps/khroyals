/**
 * Apps: the school's tools as large tiles, opened from the shield button in the middle of
 * the tab bar. Teachers, staff and admins get a Standard / Staff switch at the top: Staff
 * shows the staff versions (marked in gold), Standard the apps as parents see them.
 */
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  isFamily, isSchoolStaff, isSubstitute, listAlerts, me, myAccess, onAuthChange, session, subscribeAlerts, type CriticalAlert, type Person,
} from '../../src/api/connect';
import { TILES } from '@school/tiles';
import { alertKind } from '../../src/alerts/kinds';
import { PAGES } from '../../src/handbook/handbook';
import { visibleTiles, type TileRules } from '../../src/appTiles';
import { NewsCarousel } from '../../src/site/NewsCarousel';
import { GOLD, NAVY } from '../../src/sports/ui';
import { SCHOOL } from '../../src/school';
import { useStaffViewSetting } from '../../src/staffView';
import { CONTENT_MAX, C, s, useContentWidth } from '../../src/ui';

/**
 * A tile shows the school's artwork for it (schools/<id>/tiles.ts) or else an Ionicons glyph;
 * who sees it is in src/appTiles.ts.
 */
type App = { label: string; color: string; href: Href; icon: ComponentProps<typeof Ionicons>['name']; image?: ImageSourcePropType } & TileRules;

const ALL_APPS: App[] = [
  { label: 'Sub Days', icon: 'briefcase', color: SCHOOL.theme.dark, href: '/sub', subOnly: true, sub: true },
  { label: 'Alerts', icon: 'warning', color: '#B42318', href: '/alerts', staffOnly: true },
  { label: 'Car Line', image: TILES.carline, icon: 'car', color: SCHOOL.theme.dark, href: '/carline', staffVersion: true, student: false },
  // Teachers' classes: roll, assignments, messages from students, subs and check-out lists.
  { label: 'Classes', icon: 'easel', color: SCHOOL.theme.dark, href: '/attendance', staffOnly: true },
  { label: 'Student', image: TILES.student, icon: 'school', color: SCHOOL.theme.dark, href: '/student', family: false, inStaffView: false },
  // In staff view it opens on My calendar (School / Mine at the top).
  { label: 'Calendar', image: TILES.calendar, icon: 'calendar', color: SCHOOL.theme.dark, href: '/calendar', sub: true, staffVersion: true },
  { label: 'Lunch Visits', icon: 'restaurant', color: SCHOOL.theme.dark, href: '/lunch', student: false },
  { label: 'News', image: TILES.news, icon: 'newspaper', color: SCHOOL.theme.dark, href: '/news', sub: true, inStaffView: false },
  { label: 'Photos', icon: 'images', color: SCHOOL.theme.dark, href: '/photos' },
  { label: 'Activities', image: TILES.activities, icon: 'basketball', color: SCHOOL.theme.dark, href: '/activities' },
  { label: 'Marketplace', image: TILES.market, icon: 'pricetags', color: SCHOOL.theme.dark, href: '/market', family: false, student: false, inStaffView: false },
  { label: 'Volunteer', image: TILES.volunteer, icon: 'hand-left', color: SCHOOL.theme.dark, href: '/volunteer', student: false, inStaffView: false },
  { label: 'Forms', icon: 'document-text', color: SCHOOL.theme.dark, href: '/forms', family: false, student: false, staffVersion: true },
  { label: 'Handbook', image: TILES.handbook, icon: 'book', color: SCHOOL.theme.dark, href: '/handbook', sub: true, inStaffView: false },
  { label: 'Ask the School', image: TILES.questions, icon: 'help-circle', color: SCHOOL.theme.dark, href: '/questions', family: false, student: false, staffVersion: true },
  { label: 'Ask the Teacher', image: TILES.teachers, icon: 'chatbubbles', color: SCHOOL.theme.dark, href: '/teachers', family: false, studentApp: true },
  { label: 'Assignments', image: TILES.assignments, icon: 'checkbox', color: SCHOOL.theme.dark, href: '/assignments', family: false, studentApp: true },
  { label: 'Feedback', icon: 'chatbubble-ellipses', color: SCHOOL.theme.dark, href: '/feedback', sub: true },
  { label: 'Admin', icon: 'shield-checkmark', color: NAVY, href: '/admin', adminOnly: true },
];
/** The Handbook only for a school whose handbook is in the app. */
const APPS = ALL_APPS.filter((a) => a.href !== '/handbook' || PAGES.length > 0);

/** The signed-in person (which apps they see depends on their role). */
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

/** Teachers and staff: any critical alert still active. */
function useActiveAlerts(staff: boolean) {
  const [active, setActive] = useState<CriticalAlert[]>([]);
  useEffect(() => {
    if (!staff) { setActive([]); return; }
    const load = () => listAlerts(5).then((a) => setActive(a.filter((x) => !x.endedAt))).catch(() => {});
    load();
    return subscribeAlerts(load);
  }, [staff]);
  return active;
}

/** Staff with admin powers (a tier or single permissions) get the admin portal's tile in staff view. */
function useHasAdmin(staff: boolean) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!staff) { setAdmin(false); return; }
    myAccess().then((a) => setAdmin(!!a && (!!a.tier || a.granted.length > 0))).catch(() => setAdmin(false));
  }, [staff]);
  return admin;
}

export default function Apps() {
  const person = usePerson();
  const staff = isSchoolStaff(person);
  // Active alerts show in both views: staff on Standard still need to see them.
  const active = useActiveAlerts(staff);
  const admin = useHasAdmin(staff);
  const [staffSetting, setStaffSetting] = useStaffViewSetting();
  const staffView = staff && staffSetting;
  const student = !!person && !person.pending && person.schoolRole === 'student';
  const apps = visibleTiles(APPS, { staffView, family: isFamily(person), admin, student, substitute: isSubstitute(person) });
  // Three tiles across on phones, up to five on iPads and tablets.
  const columns = Math.max(3, Math.min(5, Math.floor(useContentWidth() / 140)));
  return (
    <View style={s.screen}>
      {/* Headlines stay put under the banner; the apps scroll below them. */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }}><NewsCarousel /></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.pad, { paddingTop: 12 }]}>
      {staff && <ViewSwitch staffView={staffSetting} onChange={setStaffSetting} />}
      {active.map((a) => (
        <Pressable key={a.id} onPress={() => router.push('/alerts')} accessibilityRole="button" accessibilityLabel={`Critical alert: ${a.title}. Open`}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14,
            backgroundColor: alertKind(a.kind).color }, pressed && { opacity: 0.85 }]}>
          <Ionicons name="warning" size={26} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 }}>CRITICAL ALERT · ACTIVE</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{a.title}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </Pressable>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {apps.map((a) => (
          <Pressable key={a.label} onPress={() => router.push(a.href)} accessibilityRole="button"
            accessibilityLabel={a.elevated ? `${a.label}, staff version` : a.label}
            style={({ pressed }) => [{ width: `${100 / columns}%`, alignItems: 'center', gap: 8, paddingVertical: 14 }, pressed && { opacity: 0.6 }]}>
            <View>
              <View style={{ width: 84, height: 84, borderRadius: 24, overflow: 'hidden', backgroundColor: a.color, alignItems: 'center', justifyContent: 'center',
                borderWidth: a.elevated ? 3 : 0, borderColor: GOLD }}>
                {a.image ? <Image source={a.image} style={{ width: a.elevated ? 78 : 84, height: a.elevated ? 78 : 84 }} accessible={false} />
                  : <Ionicons name={a.icon} size={42} color="#fff" />}
              </View>
              {a.elevated && (
                <View style={{ position: 'absolute', bottom: -8, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
                  backgroundColor: GOLD, borderWidth: 2, borderColor: C.bg }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#fff' }}>STAFF</Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
      </ScrollView>
    </View>
  );
}

/** Standard / Staff: which versions of the apps a teacher, staff member or admin sees. */
function ViewSwitch({ staffView, onChange }: { staffView: boolean; onChange: (staffView: boolean) => void }) {
  const option = (value: boolean, icon: ComponentProps<typeof Ionicons>['name'], label: string) => {
    const on = staffView === value;
    return (
      <Pressable onPress={() => onChange(value)} accessibilityRole="button" accessibilityState={{ selected: on }}
        accessibilityLabel={value ? 'Staff versions of the apps' : 'Standard apps, as parents see them'}
        style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999,
          backgroundColor: on ? (value ? NAVY : C.primary) : 'transparent' }}>
        <Ionicons name={icon} size={16} color={on ? (value ? GOLD : '#fff') : C.muted} />
        <Text style={{ fontWeight: '800', color: on ? '#fff' : C.muted }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }}>
      {option(false, 'person-outline', 'Standard')}
      {option(true, 'shield-checkmark', 'Staff')}
    </View>
  );
}
