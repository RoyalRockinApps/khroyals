/**
 * Pieces of the Student app: the student picker (oldest first), letter badges, subject icons and the line chart of a
 * class's running average.
 */
import { useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import type { RecordStudent } from '../api/connect';
import { Avatar, C, s } from '../ui';
import type { Scale } from './grades';

type Icon = React.ComponentProps<typeof Ionicons>['name'];
export const AMBER = '#B45309';
export const GOOD = '#15803D';

/** A letter's color: green for A and B, amber for C, red for D and F (the letter is always written too). */
export function letterColor(letter: string | null): string {
  const l = (letter ?? '').trim().toUpperCase()[0];
  return l === 'A' || l === 'B' ? GOOD : l === 'C' ? AMBER : l === 'D' || l === 'F' ? C.danger : C.muted;
}

export function LetterBadge({ letter, size = 'small' }: { letter: string | null; size?: 'small' | 'large' }) {
  const color = letterColor(letter);
  const big = size === 'large';
  return (
    <View style={{ minWidth: big ? 56 : 34, paddingHorizontal: big ? 10 : 6, paddingVertical: big ? 6 : 3, borderRadius: big ? 14 : 8,
      backgroundColor: color + '1A', borderWidth: 1, borderColor: color + '55', alignItems: 'center' }}>
      <Text style={{ color, fontWeight: '900', fontSize: big ? 26 : 14 }}>{letter ?? '—'}</Text>
    </View>
  );
}

const SUBJECTS: [RegExp, Icon][] = [
  [/math|algebra|geometry|calculus|arithmetic/, 'calculator'],
  [/bible|theolog|chapel|faith/, 'bookmarks'],
  [/science|biology|chemistry|physics|earth sci/, 'flask'],
  [/history|social|civics|government|geography|economics/, 'earth'],
  [/spanish|french|latin|german|chinese|language/, 'chatbubbles'],
  [/english|reading|writing|spelling|literature|grammar|phonics/, 'book'],
  [/art|drawing|paint/, 'color-palette'],
  [/music|choir|band|orchestra/, 'musical-notes'],
  [/\bpe\b|physical|health|gym|fitness/, 'basketball'],
  [/computer|technology|coding|programming|stem/, 'laptop'],
];

/** An icon for a class, from its subject or its name. */
export function subjectIcon(subject: string | null, name: string): Icon {
  const text = `${subject ?? ''} ${name}`.toLowerCase();
  return SUBJECTS.find(([re]) => re.test(text))?.[1] ?? 'school';
}

export function SubjectIcon({ subject, name, size = 40 }: { subject: string | null; name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.primary + '14', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={subjectIcon(subject, name)} size={size * 0.5} color={C.primary} />
    </View>
  );
}

/** The student whose record is showing; with more than one, tap to pick another (oldest first). */
export function StudentPicker({ students, value, onChange }: { students: RecordStudent[]; value: string | null; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const pick = students.find((x) => x.id === value) ?? students[0];
  if (!pick) return null;
  const many = students.length > 1;
  const face = (x: RecordStudent) => <Avatar person={{ firstName: x.firstName, lastName: x.lastName, avatar: x.photo }} size={40} />;
  return (
    <>
      <Pressable disabled={!many} onPress={() => setOpen(true)} accessibilityRole={many ? 'button' : undefined}
        accessibilityLabel={many ? `Showing ${pick.firstName}. Choose a student` : undefined}
        style={({ pressed }) => [s.card, s.row, { paddingVertical: 10, borderRadius: 999, paddingRight: 18 }, pressed && { opacity: 0.8 }]}>
        {face(pick)}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }} numberOfLines={1}>{pick.firstName} {pick.lastName}</Text>
          {!!pick.gradeLabel && <Text style={{ color: C.muted, fontWeight: '600' }}>{pick.gradeLabel}</Text>}
        </View>
        {many && <Ionicons name="chevron-down" size={20} color={C.primary} />}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <Pressable style={[s.sheet, { backgroundColor: C.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 36, gap: 4 }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: C.muted, marginBottom: 6 }}>STUDENTS</Text>
            {students.map((x) => (
              <Pressable key={x.id} onPress={() => { setOpen(false); if (x.id !== pick.id) onChange(x.id); }} accessibilityRole="button"
                accessibilityState={{ selected: x.id === pick.id }}
                style={({ pressed }) => [s.row, { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
                  x.id === pick.id && { backgroundColor: C.primary + '10' }, pressed && { opacity: 0.7 }]}>
                {face(x)}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{x.firstName} {x.lastName}</Text>
                  {!!x.gradeLabel && <Text style={{ color: C.muted }}>{x.gradeLabel}</Text>}
                </View>
                {x.id === pick.id && <Ionicons name="checkmark-circle" size={22} color={C.primary} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const monthDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const short = (pct: number) => `${(Math.round(pct * 10) / 10).toFixed(1)}%`;
// SVG text on the web would be in the browser's serif; the phones use their own sans already.
const FONT = Platform.OS === 'web' ? { fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' } : {};

/**
 * A class's running average over time: one line, a dot for each day something was graded, the school's letter
 * cutoffs as the gridlines, the latest value at the end, and tap anywhere for the nearest day's average.
 */
export function ProgressChart({ points, scale, height = 220 }: { points: { day: string; average: number }[]; scale: Scale; height?: number }) {
  const [width, setWidth] = useState(0);
  const [hit, setHit] = useState<number | null>(null);
  const box = useRef<View>(null);
  const pad = { left: 40, right: 50, top: 14, bottom: 26 };
  const geo = useMemo(() => {
    if (!points.length || width <= 0) return null;
    const lo = Math.min(...points.map((p) => p.average));
    const hi = Math.max(...points.map((p) => p.average));
    const yMin = Math.max(0, Math.min(Math.floor((lo - 4) / 10) * 10, 90));
    const yMax = Math.max(100, Math.ceil(hi));
    const t0 = ms(points[0].day);
    const t1 = Math.max(ms(points[points.length - 1].day), t0 + 7 * DAY);
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const x = (iso: string) => pad.left + (points.length === 1 ? plotW / 2 : ((ms(iso) - t0) / (t1 - t0)) * plotW);
    const y = (pct: number) => pad.top + (1 - (pct - yMin) / (yMax - yMin)) * plotH;
    // The letter cutoffs in view, and the bottom line (named by its letter when it's a cutoff).
    const cut = [...scale].filter((c) => c.min > yMin && c.min < yMax).sort((a, b) => b.min - a.min);
    cut.push({ letter: scale.find((c) => c.min === yMin)?.letter ?? '', min: yMin });
    const months: string[] = [];
    for (let d = new Date(t0); d.getTime() <= t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getTime();
      if (first >= t0) months.push(new Date(first).toISOString().slice(0, 10));
    }
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.average).toFixed(1)}`).join(' ');
    return { x, y, yMin, yMax, cut, months, line, plotW, plotH };
  }, [points, scale, width, height]);

  // The nearest day to the tap (from the page position: on the web, locationX is relative to whichever shape was hit).
  const tap = (e: GestureResponderEvent) => {
    const page = e.nativeEvent.pageX;
    box.current?.measure((_x, _y, _w, _h, left) => {
      if (!geo) return;
      const at = page - left;
      let best = 0;
      points.forEach((p, i) => { if (Math.abs(geo.x(p.day) - at) < Math.abs(geo.x(points[best].day) - at)) best = i; });
      setHit(best === hit ? null : best);
    });
  };
  // A dot on each graded day while they're few; with many, only the latest and the tapped one, so the line stays a line.
  const dots = points.length <= 16 ? points.map((_, i) => i) : [points.length - 1];
  const last = points[points.length - 1];
  const first = points[0];
  const summary = last ? `Average ${short(first.average)} on ${monthDay(first.day)}, ${short(last.average)} on ${monthDay(last.day)}.` : 'Nothing graded yet.';
  const shown = hit !== null ? points[hit] : null;

  return (
    <View ref={box} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }} accessible accessibilityLabel={summary}>
      {geo && (
        <Pressable onPress={tap} style={{ flex: 1 }}>
          <Svg width={width} height={height}>
            {/* Letter cutoffs and 100%: solid hairlines, labeled on the left. */}
            {[{ letter: '', min: geo.yMax }, ...geo.cut].map((c) => (
              <G key={`${c.letter}${c.min}`}>
                <Line x1={pad.left} x2={width - pad.right} y1={geo.y(c.min)} y2={geo.y(c.min)} stroke={C.line} strokeWidth={1} />
                <SvgText x={pad.left - 6} y={geo.y(c.min) + 4} fontSize={11} fill={C.muted} textAnchor="end" {...FONT}>{c.letter ? `${c.letter} ${c.min}` : `${c.min}`}</SvgText>
              </G>
            ))}
            <Line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke={C.line} strokeWidth={1} />
            {geo.months.map((m) => (
              <SvgText key={m} x={geo.x(m)} y={height - 8} fontSize={11} fill={C.muted} textAnchor="middle" {...FONT}>
                {new Date(`${m}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
              </SvgText>
            ))}
            {shown && <Line x1={geo.x(shown.day)} x2={geo.x(shown.day)} y1={pad.top} y2={height - pad.bottom} stroke={C.muted} strokeWidth={1} />}
            <Path d={geo.line} stroke={C.primary} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {[...new Set([...dots, ...(hit !== null ? [hit] : [])])].map((i) => (
              <Circle key={points[i].day} cx={geo.x(points[i].day)} cy={geo.y(points[i].average)} r={i === hit ? 6 : 4} fill={C.primary} stroke={C.card} strokeWidth={2} />
            ))}
            {/* The latest average at the end of the line. */}
            <SvgText x={geo.x(last.day) + 8} y={geo.y(last.average) + 4} fontSize={12} fontWeight="bold" fill={C.ink} {...FONT}>{short(last.average)}</SvgText>
            {shown && (() => {
              const label = `${monthDay(shown.day)}: ${short(shown.average)}`;
              const w = label.length * 6.6 + 16;
              const bx = Math.min(Math.max(geo.x(shown.day) - w / 2, 0), width - w);
              const by = Math.max(geo.y(shown.average) - 38, 0);
              return (
                <G>
                  <Rect x={bx} y={by} width={w} height={24} rx={8} fill={C.ink} />
                  <SvgText x={bx + w / 2} y={by + 16} fontSize={12} fontWeight="bold" fill="#fff" textAnchor="middle" {...FONT}>{label}</SvgText>
                </G>
              );
            })()}
          </Svg>
        </Pressable>
      )}
    </View>
  );
}
