/**
 * Send a notification (from the bell page; Send notifications, push.send): to everyone, by role or
 * to a group, urgent or not, with what was sent recently and how many opened each. Admin powers, so
 * it asks for the authenticator code first (MfaGate). It used to be the Admin portal's
 * Notifications tab.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import {
  errorText, listMyGroups, listNotifications, notificationOpenCounts, sendNotification, type Access, type Notice,
} from '../../src/api/connect';
import { MfaGate } from '../../src/comms/MfaGate';
import type { Group, SchoolRole } from '../../src/comms/types';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

const ROLES: SchoolRole[] = ['parent', 'family', 'student', 'teacher', 'staff'];

const pill = (label: string, on: boolean, onPress: () => void) => (
  <Text key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, overflow: 'hidden', borderWidth: 1,
      borderColor: C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink }}>{label}</Text>
);
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Send', onPress: onYes }]);
};

function Send({ access }: { access: Access }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'everyone' | 'roles' | 'group'>('everyone');
  const [roles, setRoles] = useState<SchoolRole[]>(['parent']);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string>();
  const [history, setHistory] = useState<Notice[] | null>(null);
  const [opens, setOpens] = useState<Record<string, number>>({});
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => listNotifications(30).then((h) => {
    setHistory(h);
    notificationOpenCounts(h.map((n) => n.id)).then(setOpens).catch(() => {});
  }).catch(() => setHistory([])), []);
  useEffect(() => { load(); listMyGroups().then(setGroups).catch(() => {}); }, [load]);

  if (!access.permissions.includes('push.send')) return (
    <View style={[s.screen, s.pad]}><Card><P muted>You don't have permission to send school-wide notifications.</P></Card></View>
  );

  const to = audience === 'everyone' ? 'everyone' : audience === 'roles' ? roles.join(', ') : groups.find((g) => g.id === groupId)?.name;
  const send = () => confirm('Send notification?', `"${title}" goes to ${to}.`, () => {
    setBusy(true);
    sendNotification(title, body, audience, { roles, groupId, urgent })
      .then(() => { setTitle(''); setBody(''); setUrgent(false); load(); })
      .catch((e) => Alert.alert('Not sent', errorText(e)))
      .finally(() => setBusy(false));
  });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {pill('Everyone', audience === 'everyone', () => setAudience('everyone'))}
          {pill('By role', audience === 'roles', () => setAudience('roles'))}
          {pill('A group', audience === 'group', () => setAudience('group'))}
        </View>
        {audience === 'roles' && (
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {ROLES.map((r) => pill(r, roles.includes(r), () => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])))}
          </View>
        )}
        {audience === 'group' && (
          <View style={[s.row, { flexWrap: 'wrap' }]}>{groups.map((g) => pill(`${g.icon} ${g.name}`, g.id === groupId, () => setGroupId(g.id)))}</View>
        )}
        <Field label="Title" placeholder="e.g. Weather closure" value={title} onChangeText={setTitle} maxLength={80} />
        <Field label="Message" multiline value={body} onChangeText={setBody} maxLength={400} style={{ minHeight: 80 }} />
        {audience !== 'group' && (
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: C.ink }}>Urgent</Text>
              <P muted>Reaches everyone, even people who turned off school notifications or are in quiet hours. Use for closures and safety.</P>
            </View>
            <Switch value={urgent} onValueChange={setUrgent} trackColor={{ true: C.danger }} accessibilityLabel="Urgent" />
          </View>
        )}
        <Button label={busy ? 'Sending…' : 'Send'} onPress={send}
          disabled={busy || !title.trim() || !body.trim() || (audience === 'group' && !groupId) || (audience === 'roles' && !roles.length)} />
        <P muted>Goes to everyone in the audience who has the app with notifications on, and appears on their bell page.</P>
      </Card>
      <H>Sent recently</H>
      {!history ? <Loading /> : history.length === 0 ? <P muted>Nothing sent yet.</P> : history.map((n) => (
        <Card key={n.id}>
          <Text style={{ fontWeight: '700', color: C.ink }}>{n.title}</Text>
          <P>{n.body}</P>
          <P muted>{new Date(n.createdAt).toLocaleString()} · {n.audience} · {n.status}{n.status === 'sent' ? ` to ${n.sentCount} device${n.sentCount === 1 ? '' : 's'}` : ''}</P>
          {opens[n.id] !== undefined && <P muted>👁 Opened by {opens[n.id]} {opens[n.id] === 1 ? 'person' : 'people'}</P>}
        </Card>
      ))}
    </ScrollView>
  );
}

export default function SendNotification() {
  return (
    <>
      <Stack.Screen options={{ title: 'Send a notification' }} />
      <MfaGate>{(access) => <Send access={access} />}</MfaGate>
    </>
  );
}
