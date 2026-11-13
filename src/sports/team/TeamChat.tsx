/**
 * An activity's parent chat (the Chat tab): the team's parents and its coaches or directors talk (rides, snacks, who's
 * bringing what). The leaders' messages stand out. People remove their own messages, and the leaders anyone's, with a
 * long press. Students aren't in it.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deleteSportChat, sendSportChat, type SportChatMessage } from '../../api/connect';
import { C, Card, Input, P, s } from '../../ui';
import { GOLD, NAVY } from '../ui';
import { confirmThen, fail, nameOf, stamp } from './parts';

/** `title` is what one leader is called ("Coach"), `leaders` all of them ("coaches"). */
export function TeamChat({ sportId, messages, meId, leaderIds, leader, title, leaders, onChange }: {
  sportId: string; messages: SportChatMessage[]; meId: string | null; leaderIds: string[]; leader: boolean; title: string; leaders: string; onChange: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    sendSportChat(sportId, body).then(() => { setDraft(''); onChange(); }).catch(fail).finally(() => setBusy(false));
  };
  const remove = (m: SportChatMessage) => confirmThen('Remove this message?', 'Everyone in the chat stops seeing it.', 'Remove',
    () => deleteSportChat(m.id).then(onChange).catch(fail));

  return (
    <View style={{ gap: 10 }}>
      <View style={[s.row, { gap: 8, alignItems: 'flex-start' }]}>
        <Ionicons name="lock-closed" size={14} color={C.muted} style={{ marginTop: 3 }} />
        <View style={{ flex: 1 }}><P muted>{`For the team's parents and its ${leaders}. Students don't see it.`}</P></View>
      </View>
      {messages.length === 0 && <Card><P muted>No messages yet. Say hello, or ask about rides to the next game.</P></Card>}
      {messages.map((m) => {
        const mine = m.authorId === meId;
        const lead = leaderIds.includes(m.authorId);
        const canRemove = mine || leader;
        return (
          <Pressable key={m.id} onLongPress={canRemove ? () => remove(m) : undefined} delayLongPress={400}
            accessibilityHint={canRemove ? 'Long press to remove' : undefined}
            accessibilityActions={canRemove ? [{ name: 'remove', label: 'Remove' }] : undefined}
            onAccessibilityAction={() => remove(m)}
            style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', borderRadius: 16, padding: 10, gap: 3,
              borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4,
              backgroundColor: lead ? NAVY : mine ? '#E6ECFA' : C.card, borderWidth: lead ? 0 : 1, borderColor: C.line }}>
            <View style={[s.row, { gap: 6 }]}>
              {lead && <Ionicons name="star" size={12} color={GOLD} />}
              <Text style={{ fontWeight: '800', fontSize: 13, color: lead ? '#fff' : C.ink }}>
                {mine ? 'You' : nameOf(m.authorId)}{lead ? ` · ${title}` : ''}
              </Text>
              <Text style={{ fontSize: 12, color: lead ? '#DCE3F7' : C.muted }}>{stamp(m.createdAt)}</Text>
            </View>
            <Text style={{ fontSize: 15, lineHeight: 21, color: lead ? '#fff' : C.ink }}>{m.body}</Text>
          </Pressable>
        );
      })}
      <View style={[s.row, { gap: 8, alignItems: 'flex-end', marginTop: 4 }]}>
        <Input placeholder="Message the team's parents" value={draft} onChangeText={setDraft} multiline maxLength={1000}
          style={{ flex: 1, maxHeight: 120 }} />
        <Pressable onPress={send} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityLabel="Send"
          style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
            opacity: busy || !draft.trim() ? 0.4 : pressed ? 0.8 : 1 })}>
          <Ionicons name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}
