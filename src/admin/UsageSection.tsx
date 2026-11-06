/**
 * App usage (Admin portal → App usage, for audit.view holders): which apps people open and how often, over the last 7,
 * 30 or 90 days. People active today, this week and this month; active people each day; people by role out of the
 * accounts in that role; and each app's people, opens and days per person, with people by role, most used first, then
 * the apps nobody opened. Counts only (usage_summary): never who opened what.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { errorText, usageSummary, type UsageSummary } from '../api/connect';
import { SCHOOL } from '../school';
import { USAGE_APPS, usageLabel } from '../usage/apps';
import { C, Card, Loading, P, s } from '../ui';

const PERIODS = [7, 30, 90];
const ROLES: [string, string][] = [
  ['parent', 'Parents'], ['student', 'Students'], ['teacher', 'Teachers'], ['staff', 'Staff'], ['admin', 'Admins'],
  ['family', 'Family'], ['substitute', 'Substitutes'],
];
const roleName = (r: string) => ROLES.find(([k]) => k === r)?.[1] ?? r;
const BAR = C.primary;

const Heading = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted, marginTop: 10 }}>{children.toUpperCase()}</Text>
);

export function UsageSection() {
  const [days, setDays] = useState(30);
  const [u, setU] = useState<UsageSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setU(undefined);
    usageSummary(days).then((x) => { setU(x); setError(null); }).catch((e) => { setU(null); setError(errorText(e)); });
  }, [days]);

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {PERIODS.map((d) => (
          <Pressable key={d} onPress={() => setDays(d)} accessibilityRole="tab" accessibilityState={{ selected: days === d }}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1,
              backgroundColor: days === d ? C.primary : '#fff', borderColor: days === d ? C.primary : C.line }}>
            <Text style={{ fontWeight: '800', color: days === d ? '#fff' : C.ink }}>Last {d} days</Text>
          </Pressable>
        ))}
      </View>
      {u === undefined ? <Loading /> : !u ? <P muted>{error ?? 'App usage needs the school server.'}</P> : <UsageReport u={u} />}
    </>
  );
}

/** The report itself, for a summary already loaded. */
export function UsageReport({ u }: { u: UsageSummary }) {
  const accounts = Object.values(u.accounts).reduce((n, x) => n + x, 0);
  const used = new Set(u.apps.map((a) => a.app));
  const unused = USAGE_APPS.filter((a) => !used.has(a.key));
  const most = Math.max(1, ...u.apps.map((a) => a.people));
  const roles = ROLES.filter(([r]) => u.accounts[r] || u.byRole[r]);

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([['Today', u.active.today], ['Last 7 days', u.active.week], ['Last 30 days', u.active.month]] as const).map(([label, n]) => (
          <Card key={label} style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: C.ink }}>{n.toLocaleString()}</Text>
            <Text style={{ color: C.muted, fontWeight: '600' }}>{label}</Text>
          </Card>
        ))}
      </View>
      <P muted>People who opened the app, of {accounts.toLocaleString()} approved accounts.</P>

      <Heading>Active people each day</Heading>
      <Daily daily={u.daily} />

      <Heading>By role</Heading>
      <Card style={{ gap: 10 }}>
        {roles.map(([r]) => {
          const active = u.byRole[r] ?? 0, total = u.accounts[r] ?? 0;
          const share = total ? Math.min(100, Math.round((100 * active) / total)) : 0;
          return (
            <View key={r} style={{ gap: 4 }} accessible accessibilityLabel={`${roleName(r)}: ${active} of ${total} used the app`}>
              <View style={s.row}>
                <Text style={{ flex: 1, color: C.ink, fontWeight: '600' }}>{roleName(r)}</Text>
                <Text style={{ color: C.ink, fontWeight: '800' }}>{active.toLocaleString()}
                  <Text style={{ color: C.muted, fontWeight: '500' }}> of {total.toLocaleString()} · {share}%</Text></Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
                <View style={{ width: `${share}%`, height: 6, borderRadius: 3, backgroundColor: BAR }} />
              </View>
            </View>
          );
        })}
      </Card>

      <Heading>Apps, most used first</Heading>
      {u.apps.length === 0 && <P muted>Nobody has opened the app in this period yet.</P>}
      {u.apps.length > 0 && (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {u.apps.map((a, i) => (
            <View key={a.app} style={{ paddingVertical: 10, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
              accessible accessibilityLabel={`${usageLabel(a.app, SCHOOL.newsName)}: ${a.people} people, ${a.opens} opens`}>
              <View style={s.row}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.ink }}>{usageLabel(a.app, SCHOOL.newsName)}</Text>
                <Text style={{ color: C.ink, fontWeight: '800' }}>{a.people.toLocaleString()}
                  <Text style={{ color: C.muted, fontWeight: '500' }}> {a.people === 1 ? 'person' : 'people'}</Text></Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' }}>
                <View style={{ width: `${Math.round((100 * a.people) / most)}%`, height: 6, borderRadius: 3, backgroundColor: BAR }} />
              </View>
              <Text style={{ color: C.muted, fontSize: 13 }}>
                {[`${a.opens.toLocaleString()} ${a.opens === 1 ? 'open' : 'opens'}`, `${(a.days / a.people).toFixed(1)} days each`,
                  ROLES.filter(([r]) => a.roles?.[r]).map(([r]) => `${roleName(r)} ${a.roles[r]}`).join(', ')].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))}
        </Card>
      )}
      {unused.length > 0 && (
        <P muted>Not opened in this period: {unused.map((a) => usageLabel(a.key, SCHOOL.newsName)).join(', ')}.</P>
      )}
      <P muted>Counts only: nobody’s own use is shown. Each person counts once per app per day; opens count each time they go into the app (or come back to it after 5 minutes away). Records are erased after 400 days.</P>
    </>
  );
}

/** Active people each day: one thin bar per day (rounded tops on the baseline), the busiest day's count above. */
function Daily({ daily }: { daily: UsageSummary['daily'] }) {
  const most = Math.max(1, ...daily.map((d) => d.people));
  const peak = daily.reduce((a, d) => (d.people > a.people ? d : a), daily[0] ?? { day: '', people: 0 });
  const label = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <Card style={{ gap: 8 }}>
      <Text style={{ color: C.muted }}>Busiest: {peak.people.toLocaleString()} on {peak.day ? label(peak.day) : '—'}</Text>
      <View accessible accessibilityLabel={`Active people each day, from ${label(daily[0].day)} to ${label(daily[daily.length - 1].day)}; busiest ${peak.people}`}
        style={{ height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: daily.length > 40 ? 1 : 2 }}>
        {daily.map((d) => (
          <View key={d.day} style={{ flex: 1, height: `${Math.max(2, (100 * d.people) / most)}%`, borderTopLeftRadius: 2, borderTopRightRadius: 2,
            backgroundColor: d.people ? BAR : C.line }} />
        ))}
      </View>
      <View style={s.row}>
        <Text style={{ flex: 1, color: C.muted, fontSize: 12 }}>{label(daily[0].day)}</Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>Today</Text>
      </View>
    </Card>
  );
}
