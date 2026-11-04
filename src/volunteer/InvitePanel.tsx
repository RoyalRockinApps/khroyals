/**
 * Volunteer invites on screen: the leader's Invited section (each person and where they stand, calling off one
 * that's waiting, inviting more, and after a no with nobody signed up, inviting someone else or deleting the
 * draft), the people picker it opens, and the invited person's Say Yes! / Deny card.
 */
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ROLE_LABELS, volunteerInvitePeople,
  type InvitePerson, type Opportunity, type Signup, type VolunteerAttendance, type VolunteerInvite,
} from '../api/connect';
import type { SchoolRole } from '../comms/types';
import { Button, C, Card, Chip, Field, Loading, P, s } from '../ui';
import { nameOf } from './format';
import { inviteRoom, inviteState, type Tone } from './invites';
import { GREEN, Section } from './parts';

const AMBER = '#B45309';
export const toneColor = (t: Tone) => (t === 'yes' ? GREEN : t === 'no' ? C.danger : AMBER);

/** For the invited person: who asked (and their note), and Say Yes! or Deny. */
export function InviteAnswer({ o, invite, busy, onYes, onNo }: {
  o: Opportunity; invite: VolunteerInvite; busy: boolean; onYes: () => void; onNo: () => void;
}) {
  const from = nameOf(invite.invitedBy ?? o.leadId);
  return (
    <Card style={{ gap: 12, borderColor: GREEN, borderWidth: 2 }}>
      <View style={[s.row, { gap: 10 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${GREEN}1A`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="mail-open-outline" size={22} color={GREEN} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{from} invited you</Text>
          <P muted>{o.inviteOnly ? 'Only the people they invite can sign up for this.' : 'They’re hoping you can help.'}</P>
        </View>
      </View>
      {!!invite.note && <Text style={{ fontSize: 16, lineHeight: 22, color: C.ink, fontStyle: 'italic' }}>“{invite.note}”</Text>}
      <View style={[s.row, { gap: 10 }]}>
        <Pressable disabled={busy} onPress={onYes} accessibilityRole="button" accessibilityLabel="Say Yes!"
          style={({ pressed }) => [s.btn, { flex: 2, backgroundColor: GREEN, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', gap: 8 },
            (pressed || busy) && { opacity: 0.75 }]}>
          <Ionicons name="hand-left" size={20} color="#fff" />
          <Text style={[s.btnT, { fontSize: 18 }]}>Say Yes!</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={onNo} accessibilityRole="button" accessibilityLabel="Deny"
          style={({ pressed }) => [s.btn, { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.danger, paddingVertical: 16 },
            (pressed || busy) && { opacity: 0.75 }]}>
          <Text style={[s.btnT, { fontSize: 18, color: C.danger }]}>Deny</Text>
        </Pressable>
      </View>
    </Card>
  );
}

/**
 * Its leaders: everyone invited and where they stand (once they said yes, today's check-in too), calling off a
 * waiting invite, and inviting more people (up to the spots left).
 */
export function InvitedSection({ o, invites, signups, attendance, today, busy, picking, onPick, onCancelInvite, onDeleteDraft, onInvite }: {
  o: Opportunity; invites: VolunteerInvite[]; signups: Signup[]; attendance: VolunteerAttendance[]; today: string; busy: boolean;
  picking: boolean; onPick: (open: boolean) => void; onCancelInvite: (userId: string) => void; onDeleteDraft: () => void;
  onInvite: (userIds: string[], note: string) => Promise<boolean>;
}) {
  const shown = invites.filter((i) => i.status !== 'cancelled');
  const room = inviteRoom(o.spots, signups, invites);
  const waiting = shown.some((i) => i.status === 'pending');
  // A draft nobody has said yes to and nobody is still being asked about: invite someone else, or delete it.
  const stuck = o.inviteOnly && !signups.length && !waiting && shown.some((i) => i.status === 'declined');
  return (
    <Section icon="mail-outline" title={o.inviteOnly ? 'Invited · only they see this' : 'Invited'} tint={GREEN}>
      {!shown.length && !picking && (
        <P muted>{o.inviteOnly ? 'Invite the people you’d like to ask. They’re told right away and answer Say Yes! or Deny.'
          : 'Ask someone in particular to help. Their spot is held until they answer.'}</P>
      )}
      {shown.map((i) => {
        const st = inviteState(i, attendance.find((a) => a.userId === i.userId && a.day === today));
        return (
          <View key={i.userId} style={[s.row, { gap: 8 }]}>
            <Ionicons name={st.tone === 'yes' ? 'checkmark-circle' : st.tone === 'no' ? 'close-circle' : 'time-outline'} size={20} color={toneColor(st.tone)} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{nameOf(i.userId)}</Text>
              <Text style={{ color: toneColor(st.tone), fontWeight: '600' }}>{st.label}</Text>
            </View>
            {i.status === 'pending' && (
              <Text onPress={busy ? undefined : () => onCancelInvite(i.userId)} accessibilityRole="button"
                accessibilityLabel={`Call off ${nameOf(i.userId)}'s invite`} style={{ color: C.danger, fontWeight: '700' }}>Call off</Text>
            )}
          </View>
        );
      })}
      {stuck && !picking && (
        <View style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: `${C.danger}0D` }}>
          <Text style={{ color: C.ink, fontWeight: '700' }}>Nobody has said yes yet. Invite someone else, or delete the draft.</Text>
          <View style={s.row}>
            <View style={{ flex: 1 }}><Button label="Invite someone else" disabled={busy} onPress={() => onPick(true)} /></View>
            <View style={{ flex: 1 }}><Button kind="ghost" label="Delete draft" disabled={busy} onPress={onDeleteDraft} /></View>
          </View>
        </View>
      )}
      {picking ? (
        <InvitePeople o={o} room={room} busy={busy} onCancel={() => onPick(false)} onSend={onInvite} />
      ) : !stuck && (room === null || room > 0) ? (
        <Button kind="ghost" label={shown.length ? '+ Invite more people' : '+ Invite people'} disabled={busy} onPress={() => onPick(true)} />
      ) : !stuck && <P muted>Every spot is taken or waiting on an invite.</P>}
    </Section>
  );
}

/** Find people by name and choose who to invite, with an optional note. */
function InvitePeople({ o, room, busy, onCancel, onSend }: {
  o: Opportunity; room: number | null; busy: boolean; onCancel: () => void; onSend: (userIds: string[], note: string) => Promise<boolean>;
}) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<InvitePerson[] | null>(null);
  const [picked, setPicked] = useState<InvitePerson[]>([]);
  const [note, setNote] = useState('');
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => volunteerInvitePeople(o.id, q.trim()).then((p) => live && setPeople(p)).catch(() => live && setPeople([])), q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [o.id, q]);
  const full = room !== null && picked.length >= room;
  const toggle = (p: InvitePerson) => setPicked((list) => (list.some((x) => x.id === p.id) ? list.filter((x) => x.id !== p.id) : full ? list : [...list, p]));
  const send = () => onSend(picked.map((p) => p.id), note).then((ok) => { if (ok) { setPicked([]); setNote(''); } });

  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      <Field label="Find people" placeholder="Name" value={q} onChangeText={setQ} autoCorrect={false} />
      {room !== null && <P muted>{room === 1 ? '1 spot left to invite for.' : `${room} spots left to invite for.`}</P>}
      {picked.length > 0 && (
        <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
          {picked.map((p) => (
            <Pressable key={p.id} onPress={() => toggle(p)} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`}>
              <Chip label={`${p.name}  ✕`} color={GREEN} />
            </Pressable>
          ))}
        </View>
      )}
      {!people ? <Loading /> : people.length === 0 ? <P muted>Nobody by that name can volunteer.</P> : people.map((p) => {
        const on = picked.some((x) => x.id === p.id);
        const taken = p.signedUp ? 'Said yes' : p.invite === 'pending' ? 'Invited' : p.invite === 'accepted' ? 'Said yes' : null;
        return (
          <Pressable key={p.id} disabled={!!taken || (!on && full)} onPress={() => toggle(p)} accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: !!taken || (!on && full) }} accessibilityLabel={p.name}
            style={({ pressed }) => [s.row, { gap: 10, paddingVertical: 6 }, (!!taken || (!on && full)) && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? GREEN : C.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', color: C.ink }}>{p.name}</Text>
              <Text style={{ color: C.muted }}>{ROLE_LABELS[p.schoolRole as SchoolRole] ?? p.schoolRole}{p.invite === 'declined' ? ' · said no before' : ''}</Text>
            </View>
            {!!taken && <Chip label={taken} color={C.muted} />}
          </Pressable>
        );
      })}
      <Field label="Note (optional)" placeholder="e.g. You did a great job last year!" value={note} onChangeText={setNote} maxLength={300} multiline />
      <View style={s.row}>
        <View style={{ flex: 2 }}>
          <Button label={busy ? 'Sending…' : picked.length > 1 ? `Invite ${picked.length} people` : picked.length ? `Invite ${picked[0].name.split(' ')[0]}` : 'Invite'}
            disabled={busy || !picked.length} onPress={send} />
        </View>
        <View style={{ flex: 1 }}><Button kind="ghost" label="Cancel" onPress={onCancel} /></View>
      </View>
    </View>
  );
}
