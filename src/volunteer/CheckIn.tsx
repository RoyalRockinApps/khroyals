/**
 * Volunteer check-in. MyCheckIn: on a day an opportunity you said yes to runs, scan the leader's QR code when you arrive
 * (from an hour before it starts until it ends) and again when you're done, then your time. RollCall: its leaders show
 * the QR code, see everyone who said yes for each day so far, and mark them here, done (and correct the time) or a no-show.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Opportunity, Signup, VolunteerAttendance } from '../api/connect';
import { schoolMinutes, schoolToday } from '../calendar/past';
import { C, P, s } from '../ui';
import { checkInWindow, clock, clockAt, dayLabel, daysUpTo, duration, shiftMinutes } from './attendance';
import { nameOf, timeLabel } from './format';
import { GREEN, Section } from './parts';

type Mark = VolunteerAttendance['status'];

/** Today on the school's clock, and the minute, kept current. */
export function useSchoolClock() {
  const read = () => ({ today: schoolToday(), minutes: schoolMinutes() });
  const [now, setNow] = useState(read);
  useEffect(() => { const t = setInterval(() => setNow(read()), 30_000); return () => clearInterval(t); }, []);
  return now;
}

/** Opens the scanner for the leader's check-in QR code. */
export const scanCheckIn = () => router.push('/volunteer/scan');

/** Your check-in for today (nothing on other days). With showTitle, it names the opportunity and opens it. */
export function MyCheckIn({ o, mine, showTitle }: { o: Opportunity; mine: VolunteerAttendance | undefined; showTitle?: boolean }) {
  const { today, minutes } = useSchoolClock();
  const w = checkInWindow(o, today, minutes);
  if (w.state === 'not_today' && !mine) return null;
  const leader = nameOf(o.leadId);

  const big = (label: string, icon: React.ComponentProps<typeof Ionicons>['name'], color: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [s.btn, { backgroundColor: color, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', gap: 10 },
        pressed && { opacity: 0.75 }]}>
      <Ionicons name={icon} size={22} color="#fff" />
      <Text style={[s.btnT, { fontSize: 18 }]}>{label}</Text>
    </Pressable>
  );
  const line = (icon: React.ComponentProps<typeof Ionicons>['name'], text: string, color: string) => (
    <View style={s.row}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color }}>{text}</Text>
    </View>
  );

  let body: React.ReactNode;
  let edge = C.line;
  if (mine?.status === 'here') {
    edge = GREEN;
    body = (
      <>
        {line('location', `Checked in at ${clockAt(mine.checkedInAt!)}`, GREEN)}
        <P muted>When you're done, scan the QR code again to check out, so your time counts.</P>
        {big("I'm done: scan to check out", 'qr-code-outline', C.primary, scanCheckIn)}
      </>
    );
  } else if (mine?.status === 'done') {
    edge = GREEN;
    body = (
      <>
        {line('checkmark-circle', "You're done for today. Thank you!", GREEN)}
        {mine.minutes !== null && <P muted>{`You gave ${duration(mine.minutes)}${mine.checkedOutAt && mine.markedBy ? `, checked out at ${clockAt(mine.checkedOutAt)}` : ''}.`}</P>}
      </>
    );
  } else if (w.state === 'open') {
    body = (
      <>
        {mine?.status === 'no_show' && <P muted>{`${leader} marked you as not here. Here after all? Check in.`}</P>}
        {big("I'm here: scan to check in", 'qr-code-outline', GREEN, scanCheckIn)}
        <P muted>{`Scan ${leader}'s check-in QR code when you arrive, and again when you're done, so your time counts.`}</P>
      </>
    );
  } else if (w.state === 'before') {
    body = line('time-outline', `Check-in opens at ${w.opensAt}`, C.muted);
  } else {
    body = (
      <>
        {line('lock-closed-outline', mine?.status === 'no_show' ? 'Marked as not here' : 'Check-in has closed', C.muted)}
        <P muted>{`If you were there, ask ${leader} to mark you.`}</P>
      </>
    );
  }

  return (
    <View style={[s.card, { padding: 16, gap: 10, borderColor: edge, borderWidth: edge === C.line ? 1 : 2 }]}>
      {showTitle && (
        <Pressable onPress={() => router.push(`/volunteer/${o.id}`)} accessibilityRole="link" style={[s.row, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: GREEN }}>TODAY</Text>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }} numberOfLines={1}>{o.title}</Text>
            {!!timeLabel(o) && <Text style={{ color: C.muted }}>{timeLabel(o)}{o.location ? ` · ${o.location}` : ''}</Text>}
          </View>
          <Ionicons name="chevron-forward" size={20} color={C.muted} />
        </Pressable>
      )}
      {body}
    </View>
  );
}

/** Its leaders: open the check-in QR code of an opportunity or a whole event, to show or print. */
export function CheckInCodeButton({ of, title, label = 'Show the check-in QR code' }: {
  of: { opportunityId: string } | { eventId: string }; title: string; label?: string;
}) {
  const target = 'opportunityId' in of ? `opportunity=${of.opportunityId}` : `event=${of.eventId}`;
  return (
    <Pressable onPress={() => router.push(`/volunteer/code?${target}&title=${encodeURIComponent(title)}`)} accessibilityRole="button"
      style={({ pressed }) => [s.row, { gap: 10, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: GREEN }, pressed && { opacity: 0.75 }]}>
      <Ionicons name="qr-code-outline" size={24} color={GREEN} />
      <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: GREEN }}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={GREEN} />
    </Pressable>
  );
}

/** Its leaders: the QR code to show, then who said yes, day by day, and whether they came. */
export function RollCall({ o, signups, attendance, busy, onMark }: {
  o: Opportunity; signups: Signup[]; attendance: VolunteerAttendance[]; busy: boolean;
  onMark: (userId: string, day: string, status: Mark | null, minutes?: number | null) => void;
}) {
  const { today } = useSchoolClock();
  const [picked, setPicked] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ userId: string; minutes: number } | null>(null);
  const days = daysUpTo(o, today);

  if (!days.length) {
    return (
      <Section icon="checkbox-outline" title="Check-in" tint={GREEN}>
        <P muted>{`Opens on ${dayLabel(o.startsOn)}${o.startTime ? `, an hour before it starts (${clock(o.startTime)})` : ''}. Volunteers scan your QR code when they arrive and when they're done; show it on your phone or print it. You can also mark anyone here, done or a no-show.`}</P>
        <CheckInCodeButton of={{ opportunityId: o.id }} title={o.title} />
      </Section>
    );
  }

  const day = picked && days.includes(picked) ? picked : days[days.length - 1];
  const onDay = attendance.filter((a) => a.day === day);
  const people = [...new Set([...signups.map((x) => x.userId), ...onDay.map((a) => a.userId)])]
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const markOf = (u: string) => onDay.find((a) => a.userId === u);
  const count = (m: Mark) => onDay.filter((a) => a.status === m).length;
  const open = people.filter((u) => !markOf(u)).length;
  const isToday = day === today;
  const summary = [
    count('here') && `${count('here')} here`, count('done') && `${count('done')} done`,
    count('no_show') && `${count('no_show')} no-show${count('no_show') === 1 ? '' : 's'}`,
    open && `${open} ${isToday ? 'not checked in' : 'not marked'}`,
  ].filter(Boolean).join(' · ');

  const act = (label: string, color: string, onPress: () => void) => (
    <Text key={label} onPress={busy ? undefined : onPress} accessibilityRole="button"
      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: color,
        color, fontWeight: '700', fontSize: 13, opacity: busy ? 0.5 : 1 }}>{label}</Text>
  );
  const statusText = (a: VolunteerAttendance | undefined) => {
    if (!a) return isToday ? 'Not checked in yet' : 'Not marked';
    if (a.status === 'here') return a.checkedInAt ? `Here since ${clockAt(a.checkedInAt)}` : 'Here';
    if (a.status === 'no_show') return 'No-show';
    const time = a.minutes !== null ? duration(a.minutes) : 'time not recorded';
    return `Done · ${time}${a.markedBy === null ? ' · checked out overnight' : ''}`;
  };
  const statusColor = (a: VolunteerAttendance | undefined) =>
    !a ? C.muted : a.status === 'no_show' ? C.danger : GREEN;

  return (
    <Section icon="checkbox-outline" title="Check-in" tint={GREEN}>
      <CheckInCodeButton of={{ opportunityId: o.id }} title={o.title} />
      {days.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {days.map((d) => (
            <Text key={d} onPress={() => { setPicked(d); setEditing(null); }} accessibilityRole="button" accessibilityState={{ selected: d === day }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
                backgroundColor: d === day ? C.primary : '#fff', color: d === day ? '#fff' : C.ink, fontWeight: '600' }}>
              {d === today ? 'Today' : dayLabel(d)}
            </Text>
          ))}
        </ScrollView>
      )}
      <Text style={{ fontWeight: '700', color: C.ink }}>{people.length ? summary : 'Nobody has said yes yet.'}</Text>
      {people.map((u) => {
        const a = markOf(u);
        const edit = editing?.userId === u ? editing : null;
        return (
          <View key={u} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <View style={s.row}>
              <Ionicons name={!a ? 'ellipse-outline' : a.status === 'no_show' ? 'close-circle' : 'checkmark-circle'} size={20} color={statusColor(a)} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: C.ink }}>{nameOf(u)}</Text>
                <Text style={{ color: statusColor(a), fontSize: 13 }}>{statusText(a)}</Text>
              </View>
            </View>
            {edit ? (
              <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
                {act('− 15 min', C.primary, () => setEditing({ userId: u, minutes: Math.max(0, edit.minutes - 15) }))}
                <Text style={{ fontWeight: '800', color: C.ink, minWidth: 70, textAlign: 'center' }}>{duration(edit.minutes)}</Text>
                {act('+ 15 min', C.primary, () => setEditing({ userId: u, minutes: Math.min(1440, edit.minutes + 15) }))}
                {act('Save', GREEN, () => { onMark(u, day, 'done', edit.minutes); setEditing(null); })}
                {act('Cancel', C.muted, () => setEditing(null))}
              </View>
            ) : (
              <View style={[s.row, { gap: 6, flexWrap: 'wrap' }]}>
                {!a && isToday && act('Check in', GREEN, () => onMark(u, day, 'here'))}
                {!a && act('Done', GREEN, () => onMark(u, day, 'done'))}
                {a?.status === 'here' && act('Check out', GREEN, () => onMark(u, day, 'done'))}
                {a?.status === 'done' && act('Change time', C.primary, () => setEditing({ userId: u, minutes: a.minutes ?? shiftMinutes(o) ?? 60 }))}
                {(!a || a.status === 'here') && act('No-show', C.danger, () => onMark(u, day, 'no_show'))}
                {!!a && act('Undo', C.muted, () => onMark(u, day, null))}
              </View>
            )}
          </View>
        );
      })}
    </Section>
  );
}
