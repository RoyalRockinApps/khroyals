/**
 * A bulletin board as it hangs in a classroom: its background (cork, felt, paper or a chalkboard) inside its border
 * trim (scallops, a rainbow, a wooden frame), the title on a strip of paper, notes and student work pinned up at a
 * slight tilt, and a strip of class photos along the bottom.
 */
import React, { useMemo, useState, type ReactNode } from 'react';
import { Image, Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { BoardItem } from '../api/types';
import { FONT_STYLE } from '../ui';
import { NAVY } from '../sports/ui';
import { BACKGROUNDS, BORDERS, PAPERS, PINS, idHash, tilt, type Background, type Border, type Paper } from './decor';

const STRIP = 12;     // the trim's band
const SCALLOP = 9;    // its scallops' radius

export const backgroundOf = (b: string) => BACKGROUNDS[(b in BACKGROUNDS ? b : 'cork') as Background];
export const borderOf = (b: string) => BORDERS[(b in BORDERS ? b : 'none') as Border];
export const paperOf = (c: string) => PAPERS[(c in PAPERS ? c : 'yellow') as Paper];

/** How far in from the edge the board's things start. */
export function boardInset(border: string) {
  return border === 'none' ? 14 : border === 'wood' ? 24 : STRIP + SCALLOP + 10;
}

/** A small seeded random number source, so the cork's specks stay put. */
function seeded(seed: number) {
  let x = seed || 1;
  return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
}

/** The background's texture and the trim, drawn to the board's size. */
function Decoration({ width, height, background, border }: { width: number; height: number; background: string; border: string }) {
  const bg = backgroundOf(background);
  const trim = borderOf(border);
  const specks = useMemo(() => {
    const r = seeded(Math.round(width * 7 + height));
    const n = Math.min(260, Math.round((width * height) / (background === 'cork' ? 700 : 2600)));
    return Array.from({ length: n }, () => ({ x: r() * width, y: r() * height, r: 0.8 + r() * 1.6, light: r() > 0.6 }));
  }, [width, height, background]);

  const scallops: ReactNode[] = [];
  if (trim.colors.length && border !== 'wood') {
    const colors = trim.colors;
    let k = 0;
    const along = (len: number) => {
      const n = Math.max(1, Math.floor((len - 2 * STRIP) / (SCALLOP * 2)));
      const step = (len - 2 * STRIP) / n;
      return Array.from({ length: n }, (_, i) => ({ at: STRIP + step * (i + 0.5), step }));
    };
    const piece = (key: string, x: number, y: number, w: number, h: number, cx: number, cy: number) => {
      const color = colors[k++ % colors.length];
      scallops.push(<Rect key={`${key}r`} x={x} y={y} width={w} height={h} fill={color} />, <Circle key={`${key}c`} cx={cx} cy={cy} r={SCALLOP} fill={color} />);
    };
    along(width).forEach(({ at, step }, i) => {
      piece(`t${i}`, at - step / 2, 0, step + 0.5, STRIP, at, STRIP);
      piece(`b${i}`, at - step / 2, height - STRIP, step + 0.5, STRIP, at, height - STRIP);
    });
    along(height).forEach(({ at, step }, i) => {
      piece(`l${i}`, 0, at - step / 2, STRIP, step + 0.5, STRIP, at);
      piece(`r${i}`, width - STRIP, at - step / 2, STRIP, step + 0.5, width - STRIP, at);
    });
    for (const [x, y] of [[0, 0], [width - STRIP, 0], [0, height - STRIP], [width - STRIP, height - STRIP]]) {
      scallops.push(<Rect key={`c${x}-${y}`} x={x} y={y} width={STRIP} height={STRIP} fill={colors[0]} />);
    }
  }
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {background === 'chalk' && [0.2, 0.55, 0.8].map((f, i) => (
        <Ellipse key={i} cx={width * f} cy={height * (0.3 + 0.2 * i)} rx={width * 0.28} ry={height * 0.12} fill="#FFFFFF" opacity={0.035} />
      ))}
      {specks.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.light ? '#FFFFFF' : bg.speck} opacity={s.light ? 0.12 : 0.55} />)}
      {border === 'wood' && (
        <>
          <Rect x={0} y={0} width={width} height={height} fill="none" stroke="#8B5A2B" strokeWidth={28} />
          <Rect x={13} y={13} width={width - 26} height={height - 26} fill="none" stroke="#5E3A17" strokeWidth={2} />
          <Rect x={3} y={3} width={width - 6} height={height - 6} fill="none" stroke="#A9743E" strokeWidth={2} />
        </>
      )}
      {scallops}
    </Svg>
  );
}

/** The board itself: its background and trim behind whatever is pinned to it. */
export function BoardFrame({ background, border, children, minHeight = 260 }: { background: string; border: string; children: ReactNode; minHeight?: number }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 1 || Math.abs(size.height - height) > 1) setSize({ width, height });
  };
  const inset = boardInset(border);
  return (
    <View onLayout={onLayout} style={{ minHeight, borderRadius: border === 'none' ? 18 : 6, overflow: 'hidden', backgroundColor: backgroundOf(background).color,
      shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 }}>
      {size && <Decoration width={size.width} height={size.height} background={background} border={border} />}
      <View style={{ padding: inset, gap: 14 }}>{children}</View>
    </View>
  );
}

/** A pushpin's head. */
export function Pushpin({ color, style }: { color: string; style?: object }) {
  return (
    <View pointerEvents="none" style={[{ width: 16, height: 16, borderRadius: 8, backgroundColor: color, alignItems: 'flex-start', justifyContent: 'flex-start',
      shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 2, shadowOffset: { width: 1, height: 2 }, elevation: 3 }, style]}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#FFFFFFAA', marginLeft: 3, marginTop: 3 }} />
    </View>
  );
}

/** The title on a strip of white paper, pinned at both ends (on a chalkboard, written in chalk). */
export function BoardHeading({ title, byline, background }: { title: string; byline: string; background: string }) {
  if (background === 'chalk') {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Text style={{ ...FONT_STYLE.heading, fontSize: 28, color: '#F5F5F0', textAlign: 'center', textShadowColor: '#FFFFFF55', textShadowRadius: 3 }}>{title}</Text>
        {!!byline && <Text style={{ fontSize: 16, color: '#E9EFE9', fontStyle: 'italic', marginTop: 2 }}>{byline}</Text>}
      </View>
    );
  }
  return (
    <View style={{ alignSelf: 'center', minWidth: '62%', maxWidth: '100%', backgroundColor: '#FFFFFF', paddingHorizontal: 22, paddingVertical: 10,
      transform: [{ rotate: '-1deg' }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
      <Pushpin color={PINS[0]} style={{ position: 'absolute', left: 8, top: -6 }} />
      <Pushpin color={PINS[1]} style={{ position: 'absolute', right: 8, top: -6 }} />
      <Text style={{ ...FONT_STYLE.heading, fontSize: 26, color: NAVY, textAlign: 'center' }}>{title}</Text>
      {!!byline && <Text style={{ fontSize: 15, color: '#5B6577', textAlign: 'center', fontStyle: 'italic', marginTop: 1 }}>{byline}</Text>}
    </View>
  );
}

/**
 * The demo's "student work" (builds without the server have no photos): a crayon drawing, one of four, picked by
 * `seed`. Real boards show the photos teachers pin.
 */
export function KidArt({ seed, size }: { seed: string; size: number }) {
  const n = idHash(seed) % 4;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={{ backgroundColor: '#FFFDF7' }}>
      {n === 0 && (
        <>
          <Circle cx={78} cy={22} r={11} fill="#FFD23F" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <Line key={a} x1={78 + 14 * Math.cos((a * Math.PI) / 180)} y1={22 + 14 * Math.sin((a * Math.PI) / 180)}
              x2={78 + 20 * Math.cos((a * Math.PI) / 180)} y2={22 + 20 * Math.sin((a * Math.PI) / 180)} stroke="#FFB703" strokeWidth={3} strokeLinecap="round" />
          ))}
          <Path d="M0 78 Q30 60 55 74 T100 70 V100 H0 Z" fill="#7BC950" />
          <Rect x={24} y={50} width={7} height={26} fill="#8B5A2B" />
          <Circle cx={27} cy={44} r={14} fill="#3FA34D" />
        </>
      )}
      {n === 1 && (
        <>
          <Rect x={0} y={0} width={100} height={70} fill="#BDE0FE" />
          <Rect x={0} y={70} width={100} height={30} fill="#7BC950" />
          <Rect x={28} y={44} width={40} height={32} fill="#E63946" />
          <Path d="M22 46 L48 22 L74 46 Z" fill="#6D4C41" />
          <Rect x={43} y={58} width={10} height={18} fill="#FFD23F" />
          <Circle cx={84} cy={16} r={9} fill="#FFD23F" />
        </>
      )}
      {n === 2 && (
        <>
          {['#E63946', '#F4A261', '#E9C46A', '#2A9D8F', '#457B9D', '#8E44AD'].map((c, i) => (
            <Path key={c} d={`M${10 + i * 5} 80 A${40 - i * 5} ${40 - i * 5} 0 0 1 ${90 - i * 5} 80`} stroke={c} strokeWidth={5} fill="none" />
          ))}
          <Circle cx={18} cy={80} r={9} fill="#FFFFFF" stroke="#CBD5E1" strokeWidth={1.5} />
          <Circle cx={84} cy={80} r={9} fill="#FFFFFF" stroke="#CBD5E1" strokeWidth={1.5} />
        </>
      )}
      {n === 3 && (
        <>
          <Rect x={0} y={78} width={100} height={22} fill="#7BC950" />
          {[[30, '#FF6B9A'], [70, '#9B5DE5']].map(([x, c]) => (
            <React.Fragment key={String(x)}>
              <Line x1={Number(x)} y1={80} x2={Number(x)} y2={45} stroke="#3FA34D" strokeWidth={4} />
              {[0, 72, 144, 216, 288].map((a) => (
                <Circle key={a} cx={Number(x) + 9 * Math.cos((a * Math.PI) / 180)} cy={38 + 9 * Math.sin((a * Math.PI) / 180)} r={7} fill={String(c)} />
              ))}
              <Circle cx={Number(x)} cy={38} r={5} fill="#FFD23F" />
            </React.Fragment>
          ))}
        </>
      )}
    </Svg>
  );
}

/** A note or a photo of student work, pinned up at its own tilt. */
export function PinnedItem({ item, width, onPress, big }: { item: BoardItem; width: number; onPress?: () => void; big?: boolean }) {
  const pin = PINS[idHash(item.id) % PINS.length];
  const angle = big ? 0 : tilt(item.id);
  const body = item.kind === 'photo' ? (
    <View style={{ backgroundColor: '#FFFFFF', padding: big ? 12 : 7, paddingBottom: item.body ? 6 : big ? 12 : 7 }}>
      {item.photo.startsWith('demo:')
        ? <KidArt seed={item.photo} size={width - (big ? 24 : 14)} />
        : item.photo
        ? <Image source={{ uri: item.photo }} style={{ width: width - (big ? 24 : 14), aspectRatio: 1, backgroundColor: '#E5E7EB' }} accessibilityIgnoresInvertColors />
        : <View style={{ width: width - (big ? 24 : 14), aspectRatio: 1, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={28} color="#9CA3AF" />
          </View>}
      {!!item.body && (
        <Text numberOfLines={big ? undefined : 2} style={{ textAlign: 'center', fontSize: big ? 17 : 13, color: '#374151', marginTop: 6, fontWeight: '600' }}>
          {item.body}
        </Text>
      )}
    </View>
  ) : (
    <View style={{ backgroundColor: paperOf(item.color), padding: big ? 22 : 13, paddingTop: big ? 26 : 17, minHeight: big ? 180 : 86 }}>
      <Text style={{ fontSize: big ? 22 : 15, lineHeight: big ? 31 : 21, color: '#262626', fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Noteworthy' : undefined }}>{item.body}</Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={item.kind === 'photo' ? `Student work${item.body ? `: ${item.body}` : ''}` : `Note: ${item.body}`}
      style={({ pressed }) => [{ width, paddingTop: 8, transform: [{ rotate: `${angle}deg` }] }, pressed && { opacity: 0.85 }]}>
      <View style={{ shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 1, height: 3 }, elevation: 4 }}>{body}</View>
      <Pushpin color={pin} style={{ position: 'absolute', top: 0, alignSelf: 'center' }} />
    </Pressable>
  );
}

/** Items in columns, each in the shortest one so far (2 across on phones, 3 on wider screens). */
export function PinnedItems({ items, width, onPress }: { items: BoardItem[]; width: number; onPress: (item: BoardItem) => void }) {
  const columns = width > 560 ? 3 : 2;
  const gap = 14;
  const colWidth = Math.max(80, (width - gap * (columns - 1)) / columns);
  const cols: BoardItem[][] = Array.from({ length: columns }, () => []);
  const heights = Array(columns).fill(0);
  for (const it of items) {
    const h = it.kind === 'photo' ? colWidth + (it.body ? 40 : 14) : 50 + Math.ceil((it.body.length * 8.2) / (colWidth - 26)) * 21;
    const i = heights.indexOf(Math.min(...heights));
    cols[i].push(it);
    heights[i] += h + gap;
  }
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'flex-start' }}>
      {cols.map((col, i) => (
        <View key={i} style={{ width: colWidth, gap }}>
          {col.map((it) => <PinnedItem key={it.id} item={it} width={colWidth} onPress={() => onPress(it)} />)}
        </View>
      ))}
    </View>
  );
}

/** "← Class photos →": the newest photos of the board's album as little prints, scrolling sideways. */
export function PhotoStrip({ photos, onOpen, dark }: { photos: { id: string; thumb: string }[]; onOpen: () => void; dark: boolean }) {
  const ink = dark ? '#FFFFFF' : '#3B2A1A';
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="chevron-back" size={16} color={ink} />
        <Text style={{ color: ink, fontWeight: '900', letterSpacing: 1, fontSize: 12 }}>CLASS PHOTOS</Text>
        <Ionicons name="chevron-forward" size={16} color={ink} />
        <View style={{ flex: 1 }} />
        <Text onPress={onOpen} accessibilityRole="link" style={{ color: ink, fontWeight: '800', textDecorationLine: 'underline' }}>See the album</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 6, paddingHorizontal: 2 }}>
        {photos.map((p, i) => (
          <Pressable key={p.id} onPress={onOpen} accessibilityRole="imagebutton" accessibilityLabel="Class photo"
            style={{ backgroundColor: '#FFFFFF', padding: 5, paddingBottom: 14, transform: [{ rotate: `${i % 2 ? 2 : -2}deg` }],
              shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 1, height: 2 }, elevation: 3 }}>
            {p.thumb.startsWith('demo:') ? <KidArt seed={p.thumb} size={92} />
              : <Image source={{ uri: p.thumb }} style={{ width: 92, height: 92, backgroundColor: '#E5E7EB' }} />}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
