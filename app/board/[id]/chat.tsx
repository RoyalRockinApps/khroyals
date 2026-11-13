/**
 * A class's parent chat (teacher boards): the class's parents and the board's teacher or editors talk (snacks, rides,
 * the party). The teacher's messages stand out. People remove their own messages, and the teacher anyone's, with a
 * long press. Students and other staff aren't in it.
 */
import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  boardChat, boardView, deleteBoardChat, getUser, me, sendBoardChat, subscribeBoard, type Board, type BoardChatMessage,
} from '../../../src/api/connect';
import { boardHeading } from '../../../src/boards/decor';
import { GOLD, NAVY } from '../../../src/sports/ui';
import { confirmThen, stamp } from '../../../src/sports/team/parts';
import { oops } from '../../../src/study/ui';
import { C, Card, Input, Loading, P, s, useBottomInset } from '../../../src/ui';

const nameOf = (id: string) => { const p = getUser(id); return p ? `${p.firstName} ${p.lastName}`.trim() : 'A parent'; };

export default function BoardChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [messages, setMessages] = useState<BoardChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const bottom = useBottomInset();
  const load = useCallback(() => Promise.all([boardView(id), boardChat(id)]).then(([b, m]) => { setBoard(b); setMessages(m); }).catch(oops), [id]);
  useFocusEffect(useCallback(() => { load(); return subscribeBoard(id, load); }, [id, load]));

  const header = <Stack.Screen options={{ title: 'Parent chat' }} />;
  if (board === undefined) return <>{header}<Loading /></>;
  if (!board?.chat) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>The chat is for the class's parents and its teacher.</P></Card></View>;

  const meId = me()?.id ?? null;
  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    sendBoardChat(board.id, body).then(() => { setDraft(''); return load(); }).catch(oops).finally(() => setBusy(false));
  };
  const remove = (m: BoardChatMessage) => confirmThen('Remove this message?', 'Everyone in the chat stops seeing it.', 'Remove',
    () => deleteBoardChat(m.id).then(load).catch(oops));
  const lead = board.byline || board.teacherName || 'Teacher';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {header}
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={[s.pad, { gap: 10 }]}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <View style={[s.row, { gap: 8, alignItems: 'flex-start' }]}>
          <Ionicons name="lock-closed" size={14} color={C.muted} style={{ marginTop: 3 }} />
          <View style={{ flex: 1 }}><P muted>{`${boardHeading(board).title}: just the class's parents and ${lead}. Students don't see it.`}</P></View>
        </View>
        {messages.length === 0 && <Card><P muted>No messages yet. Say hello, or ask about the next class party.</P></Card>}
        {messages.map((m) => {
          const mine = m.authorId === meId;
          const teacher = m.authorId === board.teacherId;
          const canRemove = mine || board.editor;
          return (
            <Pressable key={m.id} onLongPress={canRemove ? () => remove(m) : undefined} delayLongPress={400}
              accessibilityHint={canRemove ? 'Long press to remove' : undefined}
              style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', borderRadius: 16, padding: 10, gap: 3,
                borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4,
                backgroundColor: teacher ? NAVY : mine ? '#E6ECFA' : C.card, borderWidth: teacher ? 0 : 1, borderColor: C.line }}>
              <View style={[s.row, { gap: 6 }]}>
                {teacher && <Ionicons name="star" size={12} color={GOLD} />}
                <Text style={{ fontWeight: '800', fontSize: 13, color: teacher ? '#fff' : C.ink }}>{mine ? 'You' : teacher ? lead : nameOf(m.authorId)}</Text>
                <Text style={{ fontSize: 12, color: teacher ? '#DCE3F7' : C.muted }}>{stamp(m.createdAt)}</Text>
              </View>
              <Text style={{ fontSize: 15, lineHeight: 21, color: teacher ? '#fff' : C.ink }}>{m.body}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[s.row, { gap: 8, alignItems: 'flex-end', padding: 12, paddingBottom: 12 + bottom, borderTopWidth: 1, borderColor: C.line, backgroundColor: C.card }]}>
        <Input placeholder="Message the class's parents" value={draft} onChangeText={setDraft} multiline maxLength={1000} style={{ flex: 1, maxHeight: 120 }} />
        <Pressable onPress={send} disabled={busy || !draft.trim()} accessibilityRole="button" accessibilityLabel="Send"
          style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
            opacity: busy || !draft.trim() ? 0.4 : pressed ? 0.8 : 1 })}>
          <Ionicons name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
