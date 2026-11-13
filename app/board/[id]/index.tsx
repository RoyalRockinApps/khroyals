/**
 * A bulletin board, top to bottom as on the sketch: the board itself (its title on paper, the notes and student work
 * pinned to it, and a strip of class photos), then the teacher's announcements, then (teacher boards, for the class's
 * parents and the teacher) the parent chat. Its teacher or editors pin and take things down (tap one), announce, and
 * decorate it (the gear). `?show=news` opens at the announcements (from a notification).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  boardChat, boardItemToFront, boardItems, boardPhotos, boardPosts, boardView, errorText, getUser, subscribeBoard, unpinBoardItem,
  type Board, type BoardChatMessage, type BoardItem, type BoardPost,
} from '../../../src/api/connect';
import { BoardFrame, BoardHeading, PhotoStrip, PinnedItem, PinnedItems, backgroundOf, boardInset } from '../../../src/boards/Corkboard';
import { boardHeading } from '../../../src/boards/decor';
import { PostCard } from '../../../src/boards/News';
import { ManageButton } from '../../../src/ManageButton';
import { GOLD, NAVY } from '../../../src/sports/ui';
import { confirmThen, stamp } from '../../../src/sports/team/parts';
import { oops } from '../../../src/study/ui';
import { Button, C, Card, CONTENT_MAX, Loading, P, s } from '../../../src/ui';

type Loaded = { board: Board; items: BoardItem[]; posts: BoardPost[]; chat: BoardChatMessage[]; photos: { id: string; thumb: string }[] | null };

export default function BoardScreen() {
  const { id, show } = useLocalSearchParams<{ id: string; show?: string }>();
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<BoardItem | null>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const newsY = useRef(0);
  const shown = useRef(false);
  const { width } = useWindowDimensions();

  const load = useCallback(async () => {
    try {
      const board = await boardView(id);
      if (!board) { setData(null); return; }
      const [items, posts, chat, photos] = await Promise.all([
        boardItems(id), boardPosts(id), board.chat ? boardChat(id) : Promise.resolve([]),
        board.albumId ? boardPhotos(board.albumId).catch(() => null) : Promise.resolve(null),
      ]);
      setData({ board, items, posts, chat, photos });
      setError(null);
    } catch (e) { setError(errorText(e)); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); return subscribeBoard(id, load); }, [id, load]));
  // From an announcement's notification: down to the announcements once they're in.
  useEffect(() => {
    if (show !== 'news' || !data || shown.current) return;
    shown.current = true;
    setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, newsY.current - 12), animated: true }), 300);
  }, [show, data]);

  if (error && !data) return <View style={[s.screen, s.pad]}><Stack.Screen options={{ title: 'Bulletin board' }} /><Card><P muted>{error}</P><Button label="Try again" kind="ghost" onPress={load} /></Card></View>;
  if (data === undefined) return <><Stack.Screen options={{ title: 'Bulletin board' }} /><Loading /></>;
  if (!data) {
    return (
      <View style={[s.screen, s.pad]}>
        <Stack.Screen options={{ title: 'Bulletin board' }} />
        <Card><P muted>This board is for its class's families and the school's staff.</P></Card>
      </View>
    );
  }

  const { board, items, posts, chat, photos } = data;
  const { title, byline } = boardHeading(board);
  const bg = backgroundOf(board.background);
  const inner = Math.max(0, (boardWidth || Math.min(width, CONTENT_MAX) - 32) - 2 * boardInset(board.border));
  const teacherLabel = board.kind === 'teacher' ? (board.byline || board.teacherName || 'the teacher') : null;
  const gear = board.editor ? [{ icon: 'color-palette-outline' as const, label: 'Decorate the board', sub: 'Title, background, border and photo album',
    href: { pathname: '/board/[id]/decorate' as const, params: { id: board.id } } }] : [];
  const pin = (kind: 'note' | 'photo') => router.push({ pathname: '/board/[id]/pin', params: { id: board.id, kind } });

  return (
    <ScrollView ref={scroll} style={s.screen} contentContainerStyle={[s.pad, { gap: 18 }]}>
      <Stack.Screen options={{ title, headerRight: () => <ManageButton app="board" items={gear} /> }} />

      <View onLayout={(e) => setBoardWidth(e.nativeEvent.layout.width)}>
        <BoardFrame background={board.background} border={board.border}>
          <BoardHeading title={title} byline={byline} background={board.background} />
          {items.length > 0 ? <PinnedItems items={items} width={inner} onPress={setOpen} /> : (
            <View style={{ alignItems: 'center', paddingVertical: 26, gap: 6 }}>
              <Ionicons name="pin" size={28} color={bg.dark ? '#FFFFFFAA' : '#00000055'} />
              <Text style={{ color: bg.dark ? '#FFFFFFCC' : '#3B2A1A', fontWeight: '700', textAlign: 'center' }}>
                {board.editor ? 'Pin notes and student work here.' : 'Nothing pinned up yet.'}
              </Text>
            </View>
          )}
          {photos && photos.length > 0 && board.albumId && (
            <PhotoStrip photos={photos} dark={bg.dark} onOpen={() => router.push({ pathname: '/photos/[id]', params: { id: board.albumId! } })} />
          )}
        </BoardFrame>
      </View>

      {board.editor && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <PinButton icon="document-text" label="Pin a note" onPress={() => pin('note')} />
          <PinButton icon="color-palette" label="Pin student work" onPress={() => pin('photo')} />
        </View>
      )}
      {board.editor && !board.albumId && (
        <Text onPress={() => router.push({ pathname: '/board/[id]/decorate', params: { id: board.id } })} accessibilityRole="link"
          style={{ color: C.primary, fontWeight: '700', marginTop: -6 }}>
          + Show a photo album on the board
        </Text>
      )}

      {/* The teacher's announcements (the megaphone on the sketch). */}
      <View onLayout={(e) => { newsY.current = e.nativeEvent.layout.y; }} style={{ gap: 10 }}>
        <SectionHead icon="megaphone" title={teacherLabel ? `From ${teacherLabel}` : 'Announcements'}
          action={board.editor ? { label: '+ Announce', onPress: () => router.push({ pathname: '/board/[id]/news', params: { id: board.id, write: '1' } }) } : undefined} />
        {posts.length === 0 ? <Card><P muted>{board.editor ? 'Announcements you post here go to the class\'s families too.' : 'No announcements yet.'}</P></Card>
          : posts.slice(0, 3).map((p) => <PostCard key={p.id} post={p} />)}
        {posts.length > 3 && (
          <Button label={`See all ${posts.length} announcements`} kind="ghost"
            onPress={() => router.push({ pathname: '/board/[id]/news', params: { id: board.id } })} />
        )}
      </View>

      {board.chat && (
        <View style={{ gap: 10 }}>
          <SectionHead icon="chatbubbles" title="Parent chat" />
          <Pressable onPress={() => router.push({ pathname: '/board/[id]/chat', params: { id: board.id } })} accessibilityRole="button"
            accessibilityLabel="Open the parent chat"
            style={({ pressed }) => [{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 }, pressed && { opacity: 0.85 }]}>
            {chat.length === 0 ? <P muted>No messages yet. Say hello to the class's other parents.</P> : chat.slice(-4).map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', gap: 8 }}>
                <Text numberOfLines={2} style={{ flex: 1, color: C.ink, lineHeight: 20 }}>
                  <Text style={{ fontWeight: '800', color: m.authorId === board.teacherId ? NAVY : C.ink }}>{nameOf(m.authorId)}: </Text>
                  {m.body}
                </Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{stamp(m.createdAt)}</Text>
              </View>
            ))}
            <View style={[s.row, { gap: 6, borderTopWidth: 1, borderColor: C.line, paddingTop: 10 }]}>
              <Ionicons name="lock-closed" size={13} color={C.muted} />
              <Text style={{ flex: 1, color: C.muted, fontSize: 13 }}>Just the class's parents and {teacherLabel ?? 'its teacher'}</Text>
              <Text style={{ color: C.primary, fontWeight: '800' }}>Open ›</Text>
            </View>
          </Pressable>
        </View>
      )}

      <ItemView item={open} board={board} onClose={() => setOpen(null)} onChange={load} />
    </ScrollView>
  );
}

const nameOf = (id: string) => { const p = getUser(id); return p ? `${p.firstName} ${p.lastName}`.trim() : 'A parent'; };

function SectionHead({ icon, title, action }: { icon: 'megaphone' | 'chatbubbles'; title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={[s.row, { gap: 10 }]}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={19} color={GOLD} />
      </View>
      <Text style={{ flex: 1, fontSize: 19, fontWeight: '900', color: NAVY }}>{title}</Text>
      {action && <Text onPress={action.onPress} accessibilityRole="button" style={{ color: C.primary, fontWeight: '800' }}>{action.label}</Text>}
    </View>
  );
}

function PinButton({ icon, label, onPress }: { icon: 'document-text' | 'color-palette'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12,
        borderRadius: 14, backgroundColor: NAVY }, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={18} color={GOLD} />
      <Text style={{ color: '#fff', fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

/** Something pinned, up close; its editors move it to the front or take it down. */
function ItemView({ item, board, onClose, onChange }: { item: BoardItem | null; board: Board; onClose: () => void; onChange: () => void }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 48, 520);
  const act = (go: () => Promise<void>) => { onClose(); go().then(onChange).catch(oops); };
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: '#000B', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {item && (
          <Pressable style={{ alignItems: 'center', gap: 18 }}>
            <PinnedItem item={item} width={size} big />
            {board.editor ? (
              <View style={{ flexDirection: 'row', gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 10 }}>
                <Button label="Move to the front" kind="ghost" onPress={() => act(() => boardItemToFront(item.id))} />
                <Button label="Take it down" onPress={() => confirmThen('Take this down?', item.kind === 'photo' ? 'The photo comes off the board.' : 'The note comes off the board.',
                  'Take down', () => act(() => unpinBoardItem(item.id)))} />
              </View>
            ) : <Text style={{ color: '#fff' }} onPress={onClose}>Tap anywhere to close</Text>}
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}
