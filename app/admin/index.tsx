/**
 * Admin portal: a dashboard. On top, On-Site Attendance for today (checkin.manage): who is at school now (staff,
 * faculty, visitors and students, one bar with each group's count) and where the students are, opening the On-Site
 * screen (/onsite). Then what needs attention (accounts waiting for approval, family requests, questions to
 * route, new feedback, absence reports to mark seen: a tile each with its count, opening where it's dealt with),
 * the portal's sections as tiles
 * (People, Students, Classes, Admins & roles, Activity log: each its own screen, app/admin/[section].tsx), the
 * latest activity, and the admin's tools in other apps. Only what this admin's permissions open, and the whole
 * portal sits behind authenticator-app verification (MfaGate); the database enforces the same rules.
 */
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  adminListPeople, adminListSections, listAudit, me, onSiteToday, staffToday,
  type Access, type AdminSection, type OnSiteToday, type PeopleFilter, type StaffToday,
} from '../../src/api/connect';
import { ELSEWHERE, SECTIONS, actionLabel, personName } from '../../src/admin/sections';
import { MfaGate } from '../../src/comms/MfaGate';
import { OnSiteCard } from '../../src/onsite/OnSiteCard';
import { onSiteTitle } from '../../src/onsite/labels';
import { C, Card, Loading, P, s, useContentWidth } from '../../src/ui';

type Icon = ComponentProps<typeof Ionicons>['name'];
const AMBER = '#B45309';
const GOOD = '#15803D';

/** People counts for the section tiles' notes. */
const COUNTED: PeopleFilter[] = ['all', 'pending', 'staff', 'parents', 'family', 'students', 'admins'];

/** What needs attention, by the staff_today key that counts it and the permission that shows it. */
const NEEDS: { key: keyof StaffToday; perm: string; label: string; href: Href }[] = [
  { key: 'accountsWaiting', perm: 'people.approve', label: 'Accounts waiting for approval', href: { pathname: '/admin/[section]', params: { section: 'people', filter: 'pending' } } },
  { key: 'familyRequests', perm: 'people.family', label: 'Family requests', href: '/admin/students' },
  { key: 'questionsToRoute', perm: 'questions.manage', label: 'Questions to route', href: '/questions' },
  { key: 'feedbackNew', perm: 'feedback.triage', label: 'New feedback', href: '/feedback' },
  { key: 'absencesToSee', perm: 'checkin.manage', label: 'Absence reports to mark seen', href: '/forms/excused-absence' },
];

type Dash = {
  today: StaffToday; onsite: OnSiteToday | null; people: Partial<Record<PeopleFilter, number>> | null; classes: AdminSection[] | null; activity: any[] | null;
};

/** "Just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
function ago(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / (24 * 60))} d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function Heading({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={[s.row, { marginTop: 10 }]}>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted }}>{children.toUpperCase()}</Text>
      {right}
    </View>
  );
}

/**
 * Tiles in rows: two across on phones, up to four on iPads. Tiles keep the same height by giving their text a fixed
 * two lines, not by stretching: on iPhone a growing tile inside a scrolling page grows to the screen's height.
 */
function Grid({ children, min = 160 }: { children: ReactNode[]; min?: number }) {
  const cols = Math.max(2, Math.min(4, Math.floor(useContentWidth() / min)));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', marginHorizontal: -5 }}>
      {children.map((c, i) => <View key={i} style={{ width: `${100 / cols}%`, padding: 5 }}>{c}</View>)}
    </View>
  );
}

/** A count that needs someone: the number, what it is, and (icon and words, not color alone) whether it's waiting. */
function NeedTile({ value, label, href }: { value: number; label: string; href: Href }) {
  const waiting = value > 0;
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [s.card, { gap: 4, borderColor: waiting ? `${AMBER}55` : C.line }, pressed && { opacity: 0.8 }]}>
      <Text style={{ fontSize: 32, fontWeight: '700', color: C.ink }}>{value.toLocaleString()}</Text>
      <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, minHeight: 38, fontWeight: '600', color: C.ink }}>{label}</Text>
      <View style={[s.row, { gap: 4 }]}>
        <Ionicons name={waiting ? 'alert-circle' : 'checkmark-circle'} size={15} color={waiting ? AMBER : GOOD} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: waiting ? AMBER : GOOD }}>{waiting ? 'Needs you' : 'All caught up'}</Text>
      </View>
    </Pressable>
  );
}

/** One of the portal's sections: its icon, name, what it's for, and a count where there is one. */
function SectionTile({ icon, title, sub, note, href }: { icon: Icon; title: string; sub: string; note?: string; href: Href }) {
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [s.card, { gap: 6 }, pressed && { opacity: 0.8 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${C.primary}14`, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={C.primary} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{title}</Text>
      <Text numberOfLines={2} style={{ color: C.muted, lineHeight: 20, minHeight: 40 }}>{sub}</Text>
      <Text numberOfLines={1} style={{ color: C.primary, fontWeight: '700' }}>{note ?? ' '}</Text>
    </Pressable>
  );
}

function Dashboard({ access }: { access: Access }) {
  const can = (x: string) => access.permissions.includes(x);
  const [d, setD] = useState<Dash | null>(null);
  const [showTools, setShowTools] = useState(false);
  const load = useCallback(async () => {
    const has = (x: string) => access.permissions.includes(x);
    const [today, onsite, people, classes, activity] = await Promise.all([
      staffToday().catch(() => ({} as StaffToday)),
      has('checkin.manage') ? onSiteToday().catch(() => null) : null,
      has('people.view')
        ? Promise.all(COUNTED.map(async (f) => [f, (await adminListPeople({ filter: f, limit: 1 })).total] as const))
          .then((list) => Object.fromEntries(list)).catch(() => null)
        : null,
      has('people.family') ? adminListSections().catch(() => null) : null,
      has('audit.view') ? listAudit(5).catch(() => null) : null,
    ]);
    setD({ today, onsite, people, classes, activity });
  }, [access]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const needs = NEEDS.filter((x) => can(x.perm) && d?.today[x.key] !== undefined);
  const sections = SECTIONS.filter((x) => can(x.perm));
  const tools = ELSEWHERE.filter((t) => can(t.perm));
  const note = (key: (typeof SECTIONS)[number]['key']) => {
    const p = d?.people;
    if (key === 'people' && p?.all != null) return count(Math.max(0, p.all - (p.pending ?? 0)), 'account');
    if (key === 'students' && p?.students != null) return count(p.students, 'student');
    if (key === 'classes' && d?.classes) return count(d.classes.length, 'class', 'classes');
    if (key === 'admins' && p?.admins != null) return `${p.admins.toLocaleString()} with admin access`;
    return undefined;
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <P muted>{[access.isDirector ? 'Director' : access.roleName ?? 'Custom permissions', me()?.email].filter(Boolean).join(' · ')}</P>
      {!d ? <Loading /> : (<>
        {d.onsite && (<>
          <Heading right={<Text onPress={() => router.push('/onsite')} accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }}>See who ›</Text>}>
            {onSiteTitle(d.onsite.day)}
          </Heading>
          <OnSiteCard t={d.onsite} onOpen={(group) => router.push({ pathname: '/onsite', params: { group } })} />
        </>)}

        {needs.length > 0 && (<>
          <Heading>Needs attention</Heading>
          <Grid>{needs.map((x) => <NeedTile key={x.key} value={d.today[x.key] ?? 0} label={x.label} href={x.href} />)}</Grid>
        </>)}

        {sections.length > 0 && (<>
          <Heading>Manage</Heading>
          <Grid>{sections.map((x) => (
            <SectionTile key={x.key} icon={x.icon} title={x.title} sub={x.sub} note={note(x.key)} href={`/admin/${x.key}` as Href} />
          ))}</Grid>
        </>)}

        {d.activity && (<>
          <Heading right={<Text onPress={() => router.push('/admin/activity')} accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }}>See all ›</Text>}>
            Recent activity
          </Heading>
          <Card style={{ gap: 0, paddingVertical: 4 }}>
            {d.activity.length === 0 && <P muted>No activity yet.</P>}
            {d.activity.map((a, i) => (
              <View key={a.id} style={[s.row, { gap: 10, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }]}>
                <Ionicons name="ellipse" size={8} color={C.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: C.ink }}>{actionLabel(a.action)}</Text>
                  <Text style={{ color: C.muted }}>
                    {personName(a.actor_id)}{a.target_id ? ` → ${personName(a.target_id)}` : ''}{a.groups?.name ? ` · ${a.groups.name}` : ''}
                  </Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 13 }}>{ago(a.at)}</Text>
              </View>
            ))}
          </Card>
        </>)}

        {tools.length > 0 && (<>
          <Heading right={
            <Text onPress={() => setShowTools(!showTools)} accessibilityRole="button" accessibilityState={{ expanded: showTools }}
              style={{ color: C.primary, fontWeight: '700' }}>{showTools ? 'Hide' : `Show ${tools.length}`}</Text>
          }>Your tools in other apps</Heading>
          {(showTools || (!needs.length && !sections.length)) && (
            <Grid>{tools.map((t) => (
              <Pressable key={t.label} onPress={() => router.push(t.href)} accessibilityRole="button" accessibilityLabel={`${t.label}, in ${t.where}`}
                style={({ pressed }) => [s.card, { gap: 4, paddingVertical: 12 }, pressed && { opacity: 0.8 }]}>
                <Ionicons name={t.icon} size={20} color={C.primary} />
                <Text numberOfLines={2} style={{ fontWeight: '700', color: C.ink, lineHeight: 20, minHeight: 40 }}>{t.label}</Text>
                <Text numberOfLines={1} style={{ color: C.muted, fontSize: 13 }}>{t.where}</Text>
              </Pressable>
            ))}</Grid>
          )}
        </>)}

        {!needs.length && !sections.length && !tools.length && <P muted>Your admin tools are in the apps they belong to.</P>}
      </>)}
    </ScrollView>
  );
}

export default function Admin() {
  return (
    <>
      <Stack.Screen options={{ title: 'Admin portal' }} />
      <MfaGate>{(access) => <Dashboard access={access} />}</MfaGate>
    </>
  );
}
