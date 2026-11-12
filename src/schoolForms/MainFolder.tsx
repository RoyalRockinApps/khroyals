/**
 * The Folder at the top of the Main Page, for parents (and staff with children here, on the Standard view): closed, a
 * folder in the school's colors saying what's new inside. Tapping it blurs the page behind, brings the Folder
 * (src/schoolForms/Folder.tsx) up from where the card was, as tall as the screen allows, and swings its cover open;
 * tapping anywhere outside it (or the × on its bottom left corner) swings it shut and puts it back. The + on its bottom
 * right corner offers a note to a teacher (app/forms/to-teacher.tsx) or an Excused Absence. Under it, Done & removed
 * (the Folder screen, app/forms). Tapping a paper or one of those closes the folder and opens it. Android dims the page instead of blurring it (a pop-up window can't blur what's behind
 * it there).
 */
import { useCallback, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  errorText, isSchoolStaff, listNewsletters, live, myChildren, myFolderNotes, myForms, removeFolderNote, removeForm,
  type FolderNote, type MyForm, type NewsletterSummary, type Person,
} from '../api/connect';
import { schoolToday } from '../calendar/past';
import { SCHOOL } from '../school';
import { Shield } from '../Shield';
import { C } from '../ui';
import { coverLine } from './coverLine';
import { Folder } from './Folder';
import { pastForms, pastNotes } from './folderLists';
import { usesForms } from './FormsGate';

const OUTSIDE = SCHOOL.theme.dark;
const TRIM = C.accent;
const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

type Data = { news: NewsletterSummary | null; forms: MyForm[]; notes: FolderNote[] };

/** Whether this person gets the Folder on the Main Page: parents, and staff with children here (Standard view). */
function useFolderData(person: Person | null, staffView: boolean) {
  const [data, setData] = useState<Data | null>(null);
  const eligible = !!person && usesForms(person) && !staffView;
  const load = useCallback(async () => {
    if (!eligible) { setData(null); return; }
    try {
      if (live && isSchoolStaff(person) && (await myChildren()).length === 0) { setData(null); return; }
      const [news, forms, notes] = await Promise.all([listNewsletters().catch(() => []), myForms(), myFolderNotes()]);
      setData({ news: news[0] ?? null, forms, notes });
    } catch { /* keep what's shown; it loads again when the page comes back */ }
  }, [eligible, person]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { data, setData, load };
}

export function MainFolder({ person, staffView }: { person: Person | null; staffView: boolean }) {
  const { data, setData, load } = useFolderData(person, staffView);
  const [shown, setShown] = useState(false);     // the overlay is up
  const [open, setOpen] = useState(false);       // the cover is open (or opening)
  const [dragging, setDragging] = useState(false);
  const [from, setFrom] = useState(0);           // how far the card's middle is from the screen's
  const [menu, setMenu] = useState(false);       // the + button's choices are showing
  const insets = useSafeAreaInsets();
  const [rise] = useState(() => new Animated.Value(0));
  const card = useRef<View>(null);

  // Out of view when the page is left (a paper's screen, another tab).
  useFocusEffect(useCallback(() => () => { setShown(false); setOpen(false); rise.setValue(0); }, [rise]));
  if (!data) return null;

  const today = schoolToday();
  const forms = pastForms(data.forms, today).inFolder;
  const notes = pastNotes(data.notes, today).inFolder;
  const unread = notes.filter((n) => !n.readAt).length;
  const line = coverLine(forms.length, unread);
  // As tall as the screen allows: room for the paper count under it (with more than one paper) and Done & removed.
  const papers = (data.news ? 1 : 0) + notes.length + forms.length;
  const room = Dimensions.get('window').height - insets.top - insets.bottom - 28 - (papers > 1 ? 60 : 0) - 40 - 36;
  const height = Math.round(Math.max(400, Math.min(680, room)));

  const show = () => {
    const up = (y: number, h: number) => {
      setFrom(y + h / 2 - Dimensions.get('window').height / 2);
      setShown(true);
      setOpen(true);
      Animated.timing(rise, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    };
    if (card.current) card.current.measureInWindow((_x, y, _w, h) => up(y, h)); else up(0, 0);
  };
  const hide = () => { setMenu(false); setOpen(false); };   // the cover swings shut, then `closed`
  const closed = () => Animated.timing(rise, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: false })
    .start(() => { setShown(false); load(); });
  const go = (href: Href) => { setShown(false); setOpen(false); setMenu(false); rise.setValue(0); router.push(href); };

  const take = async (f: MyForm) => {
    setData((d) => d && { ...d, forms: d.forms.map((x) => (x.id === f.id ? { ...x, removedAt: new Date().toISOString() } : x)) });
    try { await removeForm(f.id); } catch (e) { Alert.alert('Folder', errorText(e)); }
  };
  const takeNote = async (n: FolderNote) => {
    setData((d) => d && { ...d, notes: d.notes.map((x) => (x.id === n.id ? { ...x, removedAt: new Date().toISOString() } : x)) });
    try { await removeFolderNote(n.id); } catch (e) { Alert.alert('Folder', errorText(e)); }
  };

  const content = {
    opacity: rise.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
      { scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
    ],
  };

  return (
    <>
      <Pressable ref={card} onPress={show} accessibilityRole="button" accessibilityLabel={`Class Folder: ${line}. Open it`}
        style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}>
        <View style={styles.cover}>
          <View style={styles.spine} />
          <View style={styles.band} />
          <Shield size={46} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title} numberOfLines={1}>Class Folder</Text>
            <Text style={[styles.count, (forms.length > 0 || unread > 0) && { color: '#fff' }]}>{line}</Text>
          </View>
          {(forms.length > 0 || unread > 0) && (
            <View style={styles.badge}><Text style={styles.badgeText}>{forms.length + unread}</Text></View>
          )}
          <Ionicons name="chevron-forward" size={22} color="rgba(255, 255, 255, 0.8)" />
        </View>
      </Pressable>

      <Modal visible={shown} transparent animationType="none" statusBarTranslucent onRequestClose={hide}>
        <AnimatedBlur intensity={rise.interpolate({ inputRange: [0, 1], outputRange: [0, 45] })} tint="dark" style={StyleSheet.absoluteFill} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'android' ? 'rgba(10, 16, 40, 0.72)' : 'rgba(10, 16, 40, 0.25)',
          opacity: rise }]} />
        {/* Anywhere outside the folder closes it (the + button's choices first, when they're showing). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => (menu ? setMenu(false) : hide())} accessibilityRole="button"
          accessibilityLabel={menu ? 'Close the menu' : 'Close the folder'} />
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View style={[styles.sheet, content]}>
            <Folder news={data.news} notes={notes} forms={forms} open={open} onClosed={closed} height={height}
              onRemove={take} onRemoveNote={takeNote} onDragging={setDragging} onOpenPaper={go} onDark
              corners={{
                // × closes the folder.
                left: (
                  <Pressable onPress={hide} accessibilityRole="button" accessibilityLabel="Close the folder" hitSlop={8}
                    style={({ pressed }) => [styles.round, styles.closeRound, pressed && { opacity: 0.7 }]}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </Pressable>
                ),
                // + writes to a teacher or tells the office about an absence; its choices open above it.
                right: (
                  <>
                    {menu && (
                      <View style={styles.menu}>
                        <Choice icon="create-outline" label="Note to a teacher" onPress={() => go('/forms/to-teacher' as Href)} />
                        <Choice icon="bed-outline" label="Excused Absence" onPress={() => go('/forms/excused-absence')} />
                      </View>
                    )}
                    <Pressable onPress={() => setMenu(!menu)} accessibilityRole="button" accessibilityState={{ expanded: menu }} hitSlop={8}
                      accessibilityLabel={menu ? 'Close the menu' : 'Write a note to a teacher or report an absence'}
                      style={({ pressed }) => [styles.round, styles.plus, pressed && { transform: [{ scale: 0.94 }] }]}>
                      <Ionicons name={menu ? 'close' : 'add'} size={24} color="#fff" />
                    </Pressable>
                  </>
                ),
              }} />
            <View style={[styles.links, dragging && { opacity: 0.4 }]}>
              <Text style={styles.link} accessibilityRole="link" onPress={() => go('/forms')}>Done & removed ›</Text>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

/** One of the + button's choices. */
function Choice({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [styles.choice, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={20} color={C.primary} />
      <Text style={{ color: C.ink, fontWeight: '800', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 4 },
  cover: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingBottom: 26, paddingLeft: 24, paddingRight: 12, borderRadius: 14,
    backgroundColor: OUTSIDE, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  spine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 10, backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRightWidth: 1, borderRightColor: 'rgba(255, 255, 255, 0.18)' },
  band: { position: 'absolute', left: 0, right: 0, bottom: 12, height: 6, backgroundColor: TRIM },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  count: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 14, fontWeight: '600' },
  badge: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: TRIM, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  sheet: { width: '100%', maxWidth: 460 },
  links: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 4, marginTop: -4 },
  link: { color: '#fff', fontWeight: '800', fontSize: 15, paddingVertical: 8 },
  /** The × and + on the pocket's corners. */
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  closeRound: { backgroundColor: 'rgba(255, 255, 255, 0.16)', borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.55)' },
  plus: { backgroundColor: TRIM, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  // The + button's choices, above it.
  menu: { position: 'absolute', right: 0, bottom: 52, width: 240, gap: 10, alignItems: 'flex-end' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
});
