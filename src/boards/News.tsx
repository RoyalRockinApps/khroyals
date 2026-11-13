/** A board's announcements: each as a card (pinned ones marked), and the composer its editors post from. */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { saveBoardPost, type BoardPost } from '../api/connect';
import { GOLD, NAVY } from '../sports/ui';
import { stamp } from '../sports/team/parts';
import { oops } from '../study/ui';
import { Button, C, Card, Field, s } from '../ui';

export function PostCard({ post, full, actions }: { post: BoardPost; full?: boolean; actions?: React.ReactNode }) {
  return (
    <Card style={{ gap: 6, borderLeftWidth: 5, borderLeftColor: post.pinned ? GOLD : NAVY }}>
      <View style={[s.row, { gap: 6 }]}>
        {post.pinned && <Ionicons name="pin" size={14} color={GOLD} />}
        {post.pinned && <Text style={{ fontSize: 11, fontWeight: '900', color: '#B45309', letterSpacing: 0.6 }}>PINNED</Text>}
        <View style={{ flex: 1 }} />
        <Text style={{ color: C.muted, fontSize: 12 }}>{stamp(post.createdAt)}</Text>
      </View>
      {!!post.title && <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{post.title}</Text>}
      <Text numberOfLines={full ? undefined : 5} style={{ fontSize: 15, lineHeight: 22, color: C.ink }}>{post.body}</Text>
      {actions}
    </Card>
  );
}

/** Write an announcement (or change one): an optional title, the words, and whether it stays at the top. */
export function PostComposer({ boardId, post, onDone }: { boardId: string; post?: BoardPost | null; onDone: () => void }) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [pinned, setPinned] = useState(post?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true);
    saveBoardPost({ id: post?.id ?? null, boardId, title, body, pinned }).then(onDone).catch(oops).finally(() => setBusy(false));
  };
  return (
    <Card style={{ gap: 10, borderColor: C.primary, borderWidth: 2 }}>
      <Field label="Title (optional)" value={title} onChangeText={setTitle} maxLength={80} placeholder="Field trip Friday" />
      <Field label="Announcement" value={body} onChangeText={setBody} maxLength={4000} multiline placeholder="What families should know"
        style={{ minHeight: 120, textAlignVertical: 'top' }} />
      <Pressable onPress={() => setPinned(!pinned)} accessibilityRole="checkbox" accessibilityState={{ checked: pinned }} style={[s.row, { gap: 8 }]}>
        <Ionicons name={pinned ? 'checkbox' : 'square-outline'} size={22} color={pinned ? C.primary : C.muted} />
        <Text style={{ color: C.ink, fontWeight: '600' }}>Keep it at the top</Text>
      </Pressable>
      <Button label={busy ? 'Posting…' : post ? 'Save' : 'Post the announcement'} disabled={busy || !body.trim()} onPress={save} />
      {!post && <Text style={{ color: C.muted, fontSize: 13 }}>The class's families get a notification.</Text>}
    </Card>
  );
}
