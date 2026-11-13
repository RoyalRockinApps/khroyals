/**
 * An opportunity's card in a list (the Volunteer app, an event's page): its banner, when
 * and where, how full it is, and where you stand. Outside its event it names the event.
 * For its leader, where its invites stand (who it's waiting on, a no to follow up, who said yes).
 * With time slots (`slots`, src/volunteer/slots.ts) it stands for all of them: how many slots, and
 * the sign-ups and spots added up; `signups` then has every slot's.
 */
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Opportunity, Person, Signup, VolunteerInvite } from '../api/connect';
import { PAST_STYLE } from '../calendar/PastToggle';
import { C, Chip, P, s } from '../ui';
import { pledgedTotal, spotsLeft, stillNeeded } from './details';
import { countLabel, isPast, nameOf, whenLabel } from './format';
import { inviteSummary } from './invites';
import { GREEN, OpportunityBanner, SpotsBar } from './parts';
import { slotsProgress } from './slots';

/** How many said yes (or how much is pledged), out of how many, and whether it's full. */
export function progress(o: Opportunity, signups: Signup[]) {
  const items = o.kind === 'items';
  const n = items ? pledgedTotal(signups) : signups.length;
  const goal = items ? o.quantity : o.spots;
  return { n, goal, full: !!goal && n >= goal, left: items ? stillNeeded(n, o.quantity ?? 0) : spotsLeft(n, o.spots) };
}

export function OpportunityCard({ o, signups, me, event, invites = [], slots }: {
  o: Opportunity; signups: Signup[]; me: Person; event?: string; invites?: VolunteerInvite[]; slots?: Opportunity[];
}) {
  const items = o.kind === 'items';
  const times = slots && slots.length > 1 ? slots : null;
  const across = times ? slotsProgress(times.filter((x) => x.status === 'open'), signups) : null;
  const { n, goal, full, left } = across
    ? { ...across, left: across.full ? null : across.goal ? spotsLeft(across.n, across.goal) : null }
    : progress(o, signups);
  const mine = signups.find((x) => x.userId === me.id);
  // Its leader follows the invites; everyone else only sees their own.
  const asked = o.status === 'open' && !isPast(o) && o.leadId === me.id ? inviteSummary(invites, signups, nameOf) : null;
  const tone = asked?.tone === 'yes' ? GREEN : asked?.tone === 'no' ? C.danger : '#B45309';
  return (
    <Pressable onPress={() => router.push(`/volunteer/${o.id}`)} accessibilityRole="button"
      accessibilityLabel={`${o.title}, ${whenLabel(o)}${times ? `, ${times.length} time slots` : ''}${o.location ? `, ${o.location}` : ''}${event ? `, part of ${event}` : ''}`}
      style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
        isPast(o) && PAST_STYLE, pressed && { opacity: 0.85 }]}>
      <OpportunityBanner o={o} />
      <View style={{ padding: 14, gap: 6 }}>
        {!!event && (
          <View style={[s.row, { gap: 5 }]}>
            <Ionicons name="calendar" size={14} color={C.accent} />
            <Text style={{ flex: 1, color: C.accent, fontWeight: '800', fontSize: 13 }} numberOfLines={1}>{event}</Text>
          </View>
        )}
        <Text style={{ fontSize: 18, fontWeight: '800', color: C.ink }}>{o.title}</Text>
        <P muted>{whenLabel(o)}{o.location ? ` · ${o.location}` : ''}</P>
        {!!times && (
          <View style={[s.row, { gap: 5 }]}>
            <Ionicons name="time" size={15} color={C.accent} />
            <Text style={{ color: C.accent, fontWeight: '800' }}>
              {times.length} time slots{across && across.open < times.length && across.open > 0 ? ` · ${across.open} with spots left` : ''}
            </Text>
          </View>
        )}
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          <View style={[s.row, { gap: 4 }]}>
            <Ionicons name={items ? 'gift' : 'people'} size={16} color={C.primary} />
            <Text style={{ color: C.primary, fontWeight: '700' }}>{items ? `${n} of ${o.quantity} ${o.item}` : countLabel(n, goal)}</Text>
          </View>
          {!!left && !full && !isPast(o) && o.status === 'open' && <Text style={{ color: GREEN, fontWeight: '700' }}>{left}</Text>}
          {o.status === 'deleted' ? <Chip label="Cancelled" color={C.danger} />
            : isPast(o) ? <Chip label="Past" color={C.muted} />
            : mine?.quantity ? <Chip label={`You're bringing ${mine.quantity}`} color={GREEN} />
            : mine ? <Chip label="You said yes" color={GREEN} />
            : full ? <Chip label={items ? 'All pledged' : 'Full'} color={C.muted} /> : null}
          {o.leadId === me.id && <Chip label="You lead" color={C.accent} />}
          {o.inviteOnly && <Chip label="Invite only" color={C.primary} />}
        </View>
        {!!asked && (
          <View style={[s.row, { gap: 5 }]}>
            <Ionicons name={asked.tone === 'yes' ? 'checkmark-circle' : asked.tone === 'no' ? 'alert-circle' : 'mail-outline'} size={16} color={tone} />
            <Text style={{ flex: 1, color: tone, fontWeight: '700' }}>{asked.text}</Text>
          </View>
        )}
        <SpotsBar n={n} spots={goal} />
      </View>
    </Pressable>
  );
}
