/**
 * An activity's bulletin board (the Board tab): its coaches or directors post news for the team (practice changes,
 * what to bring, results), pin what matters to the top, change and take down posts. The team's students and parents
 * read it and are told about each new post.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deleteBulletin, saveBulletin, type SportBulletin } from '../../api/connect';
import { Button, C, Card, Field, P, s } from '../../ui';
import { GOLD } from '../ui';
import { confirmThen, fail, nameOf, stamp } from './parts';

type Draft = { id: string | null; title: string; body: string; pinned: boolean };

export function Board({ sportId, posts, leader, leaders, onChange }: {
  sportId: string; posts: SportBulletin[]; leader: boolean; leaders: string; onChange: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const post = () => {
    if (!draft) return;
    setBusy(true);
    saveBulletin({ id: draft.id, sportId, title: draft.title, body: draft.body, pinned: draft.pinned })
      .then(() => { setDraft(null); onChange(); }).catch(fail).finally(() => setBusy(false));
  };
  const pin = (b: SportBulletin) =>
    saveBulletin({ id: b.id, sportId, title: b.title, body: b.body, pinned: !b.pinned }).then(onChange).catch(fail);
  const remove = (b: SportBulletin) => confirmThen('Take this post down?', 'The team won\'t see it anymore.', 'Take down',
    () => deleteBulletin(b.id).then(onChange).catch(fail));

  return (
    <View style={{ gap: 12 }}>
      {leader && !draft && (
        <Button label="+ New post" onPress={() => setDraft({ id: null, title: '', body: '', pinned: false })} />
      )}
      {leader && draft && (
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{draft.id ? 'Change the post' : 'New post for the team'}</Text>
          <Field label="Title (optional)" placeholder="Practice moved to 4:00" value={draft.title} maxLength={80}
            onChangeText={(title) => setDraft({ ...draft, title })} />
          <Field label="Post" placeholder="What the team and their families should know" value={draft.body} maxLength={2000} multiline
            style={{ minHeight: 110, textAlignVertical: 'top' }} onChangeText={(body) => setDraft({ ...draft, body })} />
          <Pressable onPress={() => setDraft({ ...draft, pinned: !draft.pinned })} accessibilityRole="checkbox" accessibilityState={{ checked: draft.pinned }}
            style={[s.row, { gap: 8 }]}>
            <Ionicons name={draft.pinned ? 'checkbox' : 'square-outline'} size={22} color={draft.pinned ? GOLD : C.muted} />
            <Text style={{ color: C.ink, fontWeight: '600' }}>Pin it to the top of the board</Text>
          </Pressable>
          {!draft.id && <P muted>The team's students and parents are told when you post.</P>}
          <View style={[s.row, { justifyContent: 'flex-end' }]}>
            <Button label="Cancel" kind="ghost" onPress={() => setDraft(null)} />
            <Button label={busy ? 'Posting…' : draft.id ? 'Save' : 'Post'} disabled={busy || !draft.body.trim()} onPress={post} />
          </View>
        </Card>
      )}

      {posts.length === 0 && (
        <Card>
          <P muted>{leader ? 'Nothing on the board yet. Post practice changes, what to bring and results; the team is told.'
            : `Nothing on the board yet. News from the ${leaders} shows up here.`}</P>
        </Card>
      )}
      {posts.map((b) => (
        <Card key={b.id} style={{ gap: 6, borderLeftWidth: b.pinned ? 4 : 1, borderLeftColor: b.pinned ? GOLD : C.line }}>
          {b.pinned && (
            <View style={[s.row, { gap: 4 }]}>
              <Ionicons name="pin" size={14} color={GOLD} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: GOLD, letterSpacing: 0.5 }}>PINNED</Text>
            </View>
          )}
          {!!b.title && <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{b.title}</Text>}
          <Text style={{ fontSize: 15, lineHeight: 21, color: C.ink }}>{b.body}</Text>
          <Text style={{ fontSize: 12, color: C.muted }}>
            {nameOf(b.authorId)} · {stamp(b.createdAt)}{new Date(b.updatedAt).getTime() - new Date(b.createdAt).getTime() > 60_000 ? ' · edited' : ''}
          </Text>
          {leader && (
            <View style={[s.row, { gap: 18, marginTop: 2 }]}>
              <Text style={link} onPress={() => pin(b)} accessibilityRole="button">{b.pinned ? 'Unpin' : 'Pin'}</Text>
              <Text style={link} onPress={() => setDraft({ id: b.id, title: b.title, body: b.body, pinned: b.pinned })} accessibilityRole="button">Change</Text>
              <Text style={[link, { color: C.danger }]} onPress={() => remove(b)} accessibilityRole="button">Take down</Text>
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}

const link = { color: C.primary, fontWeight: '700' } as const;
