/** A bulletin board in the Boards tab's list: a little board in its own colors and trim, its title on paper, and what's new. */
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Board } from '../api/types';
import { NAVY } from '../sports/ui';
import { C, FONT_STYLE } from '../ui';
import { Pushpin, backgroundOf, borderOf } from './Corkboard';
import { PAPERS, PINS, boardHeading, idHash } from './decor';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function BoardCard({ board, big }: { board: Board; big?: boolean }) {
  const { title, byline } = boardHeading(board);
  const bg = backgroundOf(board.background);
  const trim = borderOf(board.border);
  const edge = trim.colors.length ? trim.colors : ['transparent'];
  const ink = bg.dark ? '#FFFFFF' : '#3B2A1A';
  const notes = [PAPERS.yellow, PAPERS.pink, PAPERS.blue];
  const what = [
    board.children.length ? board.children.join(' & ') : '',
    board.items ? `${board.items} pinned` : '',
    board.lastPostAt ? `📣 ${shortDate(board.lastPostAt)}` : '',
  ].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={() => router.push({ pathname: '/board/[id]', params: { id: board.id } })} accessibilityRole="button"
      accessibilityLabel={`${title}, ${byline}${board.children.length ? `, ${board.children.join(' and ')}` : ''}`}
      style={({ pressed }) => [{ borderRadius: 14, overflow: 'hidden', backgroundColor: bg.color, minHeight: big ? 132 : 104,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 }, pressed && { opacity: 0.88 }]}>
      {/* The trim, as a band of its colors along the top and bottom. */}
      {[0, 1].map((side) => (
        <View key={side} style={{ position: 'absolute', left: 0, right: 0, [side ? 'bottom' : 'top']: 0, height: 7, flexDirection: 'row' }}>
          {Array.from({ length: 24 }, (_, i) => <View key={i} style={{ flex: 1, backgroundColor: edge[i % edge.length], borderRadius: 4 }} />)}
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingVertical: big ? 22 : 16, gap: 12 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 6, transform: [{ rotate: '-1deg' }],
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 2, maxWidth: '100%' }}>
            <Pushpin color={PINS[idHash(board.id) % PINS.length]} style={{ position: 'absolute', top: -6, alignSelf: 'center' }} />
            <Text numberOfLines={2} style={{ ...FONT_STYLE.heading, fontSize: big ? 22 : 18, color: NAVY }}>{title}</Text>
            {!!byline && <Text numberOfLines={1} style={{ fontSize: 13, color: '#5B6577', fontStyle: 'italic' }}>{byline}</Text>}
          </View>
          {!!what && <Text numberOfLines={1} style={{ color: ink, fontWeight: '700', fontSize: 13 }}>{what}</Text>}
        </View>
        {/* A few little notes, like the real thing. */}
        <View style={{ width: 54, height: 54 }} accessible={false}>
          {notes.map((c, i) => (
            <View key={i} style={{ position: 'absolute', left: i * 12, top: i * 8, width: 28, height: 28, backgroundColor: c,
              transform: [{ rotate: `${(i - 1) * 8}deg` }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 }} />
          ))}
        </View>
        <Ionicons name="chevron-forward" size={20} color={ink} />
      </View>
      {board.leads && (
        <View style={{ position: 'absolute', right: 12, top: 12, backgroundColor: '#FFFFFFE6', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: C.primary, letterSpacing: 0.5 }}>YOURS</Text>
        </View>
      )}
    </Pressable>
  );
}
