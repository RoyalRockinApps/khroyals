/** A board's announcements, all of them; its editors write new ones (`?write=1` opens the composer), pin, change or take them down. */
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { boardPosts, boardView, deleteBoardPost, saveBoardPost, type Board, type BoardPost } from '../../../src/api/connect';
import { boardHeading } from '../../../src/boards/decor';
import { PostCard, PostComposer } from '../../../src/boards/News';
import { confirmThen } from '../../../src/sports/team/parts';
import { oops } from '../../../src/study/ui';
import { Button, C, Card, Loading, P, s } from '../../../src/ui';

export default function BoardNews() {
  const { id, write } = useLocalSearchParams<{ id: string; write?: string }>();
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [writing, setWriting] = useState(write === '1');
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(() => Promise.all([boardView(id), boardPosts(id)]).then(([b, p]) => { setBoard(b); setPosts(p); }).catch(oops), [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = <Stack.Screen options={{ title: 'Announcements' }} />;
  if (board === undefined) return <>{header}<Loading /></>;
  if (!board) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>This board is for its class's families and the school's staff.</P></Card></View>;
  const done = () => { setWriting(false); setEditing(null); load(); };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {header}
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>{boardHeading(board).title.toUpperCase()}</Text>
        {board.editor && (writing ? <PostComposer boardId={board.id} onDone={done} />
          : <Button label="+ New announcement" onPress={() => setWriting(true)} />)}
        {posts.length === 0 && <Card><P muted>No announcements yet.</P></Card>}
        {posts.map((p) => editing === p.id ? <PostComposer key={p.id} boardId={board.id} post={p} onDone={done} /> : (
          <PostCard key={p.id} post={p} full actions={board.editor ? (
            <View style={[s.row, { gap: 16, justifyContent: 'flex-end', marginTop: 4 }]}>
              <Text accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }}
                onPress={() => saveBoardPost({ id: p.id, boardId: board.id, title: p.title, body: p.body, pinned: !p.pinned }).then(load).catch(oops)}>
                {p.pinned ? 'Unpin' : 'Pin'}
              </Text>
              <Text accessibilityRole="button" style={{ color: C.primary, fontWeight: '700' }} onPress={() => setEditing(p.id)}>Change</Text>
              <Text accessibilityRole="button" style={{ color: C.danger, fontWeight: '700' }}
                onPress={() => confirmThen('Take this announcement down?', p.title || p.body.slice(0, 80), 'Take down', () => deleteBoardPost(p.id).then(load).catch(oops))}>
                Take down
              </Text>
            </View>
          ) : undefined} />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
