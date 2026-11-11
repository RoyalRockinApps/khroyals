/**
 * The Folder (the Forms app's top, app/forms/index.tsx): a two-pocket bi-fold folder in the school's colors. Closed, its
 * cover is the dark brand color with the school's shield, a red band and how many papers there are to sign. It opens
 * like a book: the cover lifts from its right edge and swings over to the left on its spine, inside up, leaving the edge
 * of the left panel showing, and the right panel's pocket holds the papers.
 *
 * The papers are a stack: the newsletter's latest issue (the one the Planner links to) always on top first, then the
 * forms to sign. The papers behind peek out above the top one, so it's clear there are more. Swipe sideways (or use the
 * arrows) to go through them; tap one to read it (and sign a form). Swipe a form up, or tap its Remove, to take it out
 * of the folder after confirming (`onRemove`); the newsletter stays. With Reduce Motion on, it's open straight away.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View, type PanResponderGestureState } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { issueDate, type MyForm, type NewsletterSummary } from '../api/connect';
import { SCHOOL } from '../school';
import { Shield } from '../Shield';
import { C, ask } from '../ui';
import { dueText } from './parts';

/** The folder's colors: the outside in the school's dark brand color, the inside in its main color, red trim. */
const OUTSIDE = SCHOOL.theme.dark;
const INSIDE = C.primary;
const TRIM = C.accent;
/** How much of the left panel shows once the folder is open. */
const FLAP = 22;
const HEIGHT = 400;
/** How far each paper behind the top one peeks out above it, and how many show. */
const PEEK = 7;
const BEHIND = 3;
const SIDEWAYS = 70;
const UP = 80;

type Paper = { kind: 'news'; issue: NewsletterSummary } | { kind: 'form'; form: MyForm };

export function Folder({ news, forms, onRemove, onDragging }: {
  /** The newsletter's latest issue, always first (null when there's none). */
  news: NewsletterSummary | null;
  forms: MyForm[];
  /** Take a form out of the folder (already confirmed). */
  onRemove: (form: MyForm) => void;
  /** A paper is being dragged: the screen around it shouldn't scroll. */
  onDragging?: (on: boolean) => void;
}) {
  const papers = useMemo<Paper[]>(() => [
    ...(news ? [{ kind: 'news', issue: news } as const] : []),
    ...forms.map((form) => ({ kind: 'form', form }) as const),
  ], [news, forms]);
  const [opening] = useState(() => new Animated.Value(0));
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const at = papers.length ? Math.min(index, papers.length - 1) : 0;
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!active) return;
      Animated.timing(opening, {
        toValue: 1, delay: reduce ? 0 : 300, duration: reduce ? 0 : 1200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
      }).start(({ finished }) => { if (active && finished) setReady(true); });
    });
    return () => { active = false; opening.stopAnimation(); };
  }, [opening]);

  const page = Math.max(0, width - FLAP);   // the right panel, where the papers are
  const toSign = forms.length;
  // The cover lifts from its right edge and swings over to the left on its spine: the outside, darkening as it turns
  // edge-on, then its inside, lightening as it settles on the left, where only the left panel's edge stays in view.
  // Its shadow lifts off the papers as it goes.
  const cover = {
    width,
    transformOrigin: 'left center',
    opacity: opening.interpolate({ inputRange: [0, 0.88, 1], outputRange: [1, 1, 0] }),
    transform: [
      { perspective: 1600 },
      { translateX: opening.interpolate({ inputRange: [0, 1], outputRange: [0, FLAP] }) },
      { rotateY: opening.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-180deg'] }) },
    ],
  } as const;
  const outsideUp = { opacity: opening.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] }) };
  const insideUp = { opacity: opening.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] }) };
  const shadeOutside = { opacity: opening.interpolate({ inputRange: [0, 0.5], outputRange: [0, 0.55], extrapolate: 'clamp' }) };
  const shadeInside = { opacity: opening.interpolate({ inputRange: [0.5, 1], outputRange: [0.55, 0], extrapolate: 'clamp' }) };
  const shadow = { opacity: opening.interpolate({ inputRange: [0, 0.15, 0.6], outputRange: [0, 0.35, 0], extrapolate: 'clamp' }) };

  const go = (by: number) => setIndex((i) => (papers.length ? (Math.min(i, papers.length - 1) + by + papers.length) % papers.length : 0));

  return (
    <View style={styles.container}>
      <View style={styles.folder} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {/* The left panel, folded open: only its edge, with a corner of its pocket. */}
        <View style={styles.flap}><Pocket side="right" /></View>

        {/* The right panel: the stack of papers, tucked into its pocket. */}
        <View style={[styles.panel, { left: FLAP }]} pointerEvents={ready ? 'box-none' : 'none'} accessibilityElementsHidden={!ready}
          importantForAccessibility={ready ? 'auto' : 'no-hide-descendants'}>
          {page > 0 && (papers.length === 0 ? (
            <View style={[styles.slot, styles.paper, { alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="checkmark-circle-outline" size={40} color={INSIDE} />
              <Text style={styles.title}>Your folder is clear</Text>
              <Text style={styles.details}>New forms from the school will appear here.</Text>
            </View>
          ) : (
            <Stack key={paperKey(papers[at])} papers={papers} at={at} page={page} onGo={go} onRemove={onRemove} onDragging={onDragging} />
          ))}
          <Pocket />
          {!ready && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dark, shadow]} />}
        </View>
        <View pointerEvents="none" style={[styles.crease, { left: FLAP - 1 }]} />

        {/* The cover: outside up until it's edge-on, then inside up (turned so it reads the right way round). */}
        {!ready && width > 0 && (
          <Animated.View pointerEvents="none" style={[styles.cover, cover]}>
            <Animated.View style={[styles.face, styles.outside, outsideUp]}>
              <View style={styles.spine} />
              <View style={styles.band} />
              <View style={{ alignItems: 'center', gap: 8 }}>
                <Shield size={88} />
                <Text style={styles.kicker}>MY FOLDER</Text>
                <Text style={styles.coverTitle}>School documents</Text>
                <Text style={styles.coverCount}>{toSign ? `${toSign} to sign` : 'Nothing to sign'}</Text>
              </View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.dark, shadeOutside]} />
            </Animated.View>
            <Animated.View style={[styles.face, styles.inside, insideUp, { transform: [{ rotateY: '180deg' }] }]}>
              <Pocket side="right" />
              <Animated.View style={[StyleSheet.absoluteFill, styles.dark, shadeInside]} />
            </Animated.View>
          </Animated.View>
        )}
      </View>

      {ready && papers.length > 1 && (
        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous paper" onPress={() => go(-1)} style={{ padding: 12 }}>
            <Ionicons name="chevron-back" size={24} color={INSIDE} />
          </Pressable>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={[styles.meta, styles.center]}>{at + 1} of {papers.length} papers</Text>
            <Text style={[styles.meta, styles.center, { fontSize: 12 }]}>Swipe sideways for the next · swipe a form up to remove it</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Next paper" onPress={() => go(1)} style={{ padding: 12 }}>
            <Ionicons name="chevron-forward" size={24} color={INSIDE} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const paperKey = (p: Paper) => (p.kind === 'news' ? `news:${p.issue.id}` : `form:${p.form.id}`);

/** The top paper, which moves with a swipe, and the papers behind it peeking out above. */
function Stack({ papers, at, page, onGo, onRemove, onDragging }: {
  papers: Paper[]; at: number; page: number; onGo: (by: number) => void; onRemove: (form: MyForm) => void; onDragging?: (on: boolean) => void;
}) {
  const top = papers[at];
  const [pan] = useState(() => new Animated.ValueXY());
  // The latest callbacks, for the gesture made once per top paper.
  const calls = useRef({ onGo, onRemove, onDragging });
  calls.current = { onGo, onRemove, onDragging };
  // A drag isn't a tap (on the web a paper still hears the tap that ends a swipe).
  const dragged = useRef(false);
  const tapped = (open: () => void) => () => { if (dragged.current) dragged.current = false; else open(); };
  const back = () => Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
  const remove = (form: MyForm) => {
    const unsigned = form.children.some((c) => !c.response);
    ask('Remove this form from your folder?',
      `${form.title}. ${unsigned ? 'It isn’t signed yet, and the school still sees it as not signed. ' : ''}You can put it back from Done & removed for 30 days.`,
      'Remove', () => Animated.timing(pan, { toValue: { x: 0, y: -HEIGHT }, duration: 220, useNativeDriver: false })
        .start(() => calls.current.onRemove(form)));
  };
  const release = (g: PanResponderGestureState) => {
    calls.current.onDragging?.(false);
    // Up: far enough, or a quick flick.
    if (-g.dy > Math.abs(g.dx) && (-g.dy > UP || (g.vy < -0.8 && -g.dy > 30))) {
      back();
      if (top.kind === 'form') remove(top.form);
    } else if (papers.length > 1 && (Math.abs(g.dx) > SIDEWAYS || Math.abs(g.vx) > 0.8)) {
      const by = g.dx < 0 ? 1 : -1;
      Animated.timing(pan, { toValue: { x: g.dx < 0 ? -page : page, y: 0 }, duration: 180, useNativeDriver: false })
        .start(() => calls.current.onGo(by));
    } else {
      back();
    }
  };
  const responder = useMemo(() => PanResponder.create({
    // Clearly sideways, or clearly up; leave taps to the paper and downward drags to the screen.
    onMoveShouldSetPanResponderCapture: (_, g) => (Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2)
      || (g.dy < -12 && -g.dy > Math.abs(g.dx) * 1.2),
    onPanResponderGrant: () => { dragged.current = true; calls.current.onDragging?.(true); },
    onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: Math.min(0, g.dy) }),
    onPanResponderRelease: (_, g) => release(g),
    onPanResponderTerminate: () => { calls.current.onDragging?.(false); back(); },
    onPanResponderTerminationRequest: () => false,
  }), [top, papers.length, page]);

  const behind = Array.from({ length: Math.min(BEHIND, papers.length - 1) }, (_, k) => k + 1);
  const tilt = pan.x.interpolate({ inputRange: [-page, 0, page], outputRange: ['-10deg', '0deg', '10deg'] });
  const lifted = pan.y.interpolate({ inputRange: [-UP * 1.5, 0], outputRange: [0.55, 1], extrapolate: 'clamp' });

  return (
    <>
      {/* Back to front: the papers behind, each a little higher, narrower and further right, so their edges show. */}
      {behind.reverse().map((k) => (
        <View key={k} pointerEvents="none" style={[styles.slot, styles.paper, styles.behind,
          { transform: [{ translateY: -PEEK * k }, { translateX: 3 * k }, { scaleX: 1 - 0.03 * k }] }]}>
          <View style={[styles.edge, { backgroundColor: papers[(at + k) % papers.length].kind === 'news' ? TRIM : INSIDE }]} />
        </View>
      ))}
      {papers.length - 1 > BEHIND && (
        <View pointerEvents="none" style={styles.more}><Text style={styles.moreText}>+{papers.length - 1 - BEHIND} more</Text></View>
      )}
      <Animated.View {...responder.panHandlers} style={[styles.slot, { opacity: lifted, transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate: tilt }] }]}>
        {top.kind === 'news'
          ? <NewsPaper issue={top.issue} place={`${at + 1} of ${papers.length}`} onOpen={tapped(() => router.push(`/royal-news/${top.issue.id}`))} />
          : <FormPaper form={top.form} place={`${at + 1} of ${papers.length}`} onOpen={tapped(() => router.push(`/forms/${top.form.id}`))}
              onRemove={tapped(() => remove(top.form))} />}
      </Animated.View>
    </>
  );
}

/** The newsletter's latest issue, always first. */
function NewsPaper({ issue, place, onOpen }: { issue: NewsletterSummary; place: string; onOpen: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Read ${SCHOOL.newsName}: ${issue.title}, paper ${place}`}
      onPress={onOpen} style={({ pressed }) => [styles.paper, pressed && { opacity: 0.85 }]}>
      <View style={[styles.edge, { backgroundColor: TRIM, position: 'absolute', top: 0, left: 0, right: 0 }]} />
      <View style={styles.paperTop}>
        <View style={[styles.row, { gap: 8 }]}>
          <Ionicons name="newspaper-outline" size={24} color={TRIM} />
          <Text style={[styles.kickerDark, { color: TRIM }]}>{SCHOOL.newsName.toUpperCase()}</Text>
        </View>
        <Text style={styles.counter}>{place}</Text>
      </View>
      <Text style={styles.title} numberOfLines={3}>{issue.title}</Text>
      <Text style={styles.meta}>{issueDate(issue.sentOn)} · the latest issue</Text>
      <View style={styles.rule} />
      <Text style={styles.details} numberOfLines={3}>The school newsletter, sent to families by email. This week’s issue is always first in your folder.</Text>
      <Text style={styles.open}>Tap to read it ↗</Text>
    </Pressable>
  );
}

/** A form to sign, with Remove at its top right (beside the part you tap, not in it). */
function FormPaper({ form, place, onOpen, onRemove }: { form: MyForm; place: string; onOpen: () => void; onRemove: () => void }) {
  return (
    <View style={styles.sheet}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${form.title}, paper ${place}`}
        onPress={onOpen} style={({ pressed }) => [styles.paper, pressed && { opacity: 0.85 }]}>
        <View style={[styles.row, { gap: 8 }]}>
          <Ionicons name="document-text-outline" size={26} color={INSIDE} />
          <Text style={styles.counter}>{place}</Text>
        </View>
        <Text style={styles.title} numberOfLines={3}>{form.title}</Text>
        <Text style={styles.meta}>{[form.sentTo, dueText(form)].filter(Boolean).join(' · ')}</Text>
        <View style={styles.rule} />
        <Text style={styles.details} numberOfLines={3}>{form.details}</Text>
        <Text style={styles.children} numberOfLines={2}>{form.children.map((child) => child.name).join(', ')}</Text>
        <Text style={styles.open}>Tap to open and sign ↗</Text>
      </Pressable>
      <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${form.title} from your folder`} hitSlop={10}
        style={({ pressed }) => [styles.row, styles.remove, pressed && { opacity: 0.6 }]}>
        <Ionicons name="trash-outline" size={17} color={C.danger} />
        <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>Remove</Text>
      </Pressable>
    </View>
  );
}

/**
 * A folder pocket along the bottom of a panel: the dark color with a curved top edge trimmed in red, curving down toward
 * the spine (`side`: the right panel's on its left, the left panel's on its right).
 */
function Pocket({ side = 'left' }: { side?: 'left' | 'right' }) {
  const curve = side === 'left' ? 'borderTopLeftRadius' : 'borderTopRightRadius';
  return (
    <View pointerEvents="none" style={[styles.pocketTrim, { [curve]: 56 }]}>
      <View style={[styles.pocket, { [curve]: 54 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, marginBottom: 16 },
  // Not clipped, so the cover can swing out toward you; each panel clips its own papers and pocket.
  folder: { height: HEIGHT },
  flap: { position: 'absolute', top: 0, bottom: 0, left: 0, width: FLAP, backgroundColor: INSIDE, overflow: 'hidden',
    borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  panel: { position: 'absolute', top: 0, bottom: 0, right: 0, backgroundColor: INSIDE, overflow: 'hidden',
    borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  dark: { backgroundColor: '#000' },
  crease: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(0, 0, 0, 0.28)' },
  pocketTrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 74, backgroundColor: TRIM },
  pocket: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 3, backgroundColor: OUTSIDE },
  cover: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  face: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  outside: { backgroundColor: OUTSIDE, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  inside: { backgroundColor: INSIDE, borderRadius: 4, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  spine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 12, backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRightWidth: 1, borderRightColor: 'rgba(255, 255, 255, 0.18)' },
  band: { position: 'absolute', left: 0, right: 0, bottom: 44, height: 10, backgroundColor: TRIM },
  kicker: { color: 'rgba(255, 255, 255, 0.75)', fontWeight: '800', letterSpacing: 3, fontSize: 12, marginTop: 6 },
  coverTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  coverCount: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 15, fontWeight: '600' },
  // Where the top paper sits in the panel: room above it for the papers behind to peek out.
  slot: { position: 'absolute', left: 14, right: 14, top: 14 + PEEK * BEHIND, bottom: 14 },
  paper: { flex: 1, backgroundColor: '#FFFEFA', borderRadius: 4, padding: 20, paddingBottom: 84, gap: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  /** A paper with a button of its own beside the part you tap. */
  sheet: { flex: 1 },
  remove: { position: 'absolute', top: 20, right: 18, gap: 3 },
  behind: { padding: 0, backgroundColor: '#F3F0E6', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.08)' },
  edge: { height: 4 },
  more: { position: 'absolute', right: 18, top: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: OUTSIDE },
  moreText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center' },
  paperTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kickerDark: { fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  counter: { color: C.muted, fontSize: 12 },
  title: { fontSize: 22, fontWeight: '800', color: C.ink },
  meta: { color: C.muted, fontSize: 13 },
  center: { textAlign: 'center' },
  rule: { height: 1, backgroundColor: '#DDD8CB' },
  details: { color: C.ink, lineHeight: 21 },
  children: { color: INSIDE, fontWeight: '600' },
  open: { color: INSIDE, fontWeight: '700', marginTop: 'auto' },
  navigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
