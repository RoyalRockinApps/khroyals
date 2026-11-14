/**
 * The Admin portal's way in on the Main Page's Staff view (for staff with admin powers), in place of a tile: a card the
 * size and shape of the Class Folder on the Standard view (src/schoolForms/MainFolder.tsx), in the school's dark color
 * with a gold band where the Folder's is red. It says how many things are waiting on an admin (`staff_today`'s admin
 * counts, which come in only once the session is verified with the authenticator app).
 */
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { staffToday } from '../api/connect';
import { SCHOOL } from '../school';
import { GOLD, NAVY } from '../sports/ui';
import { NEEDS } from './sections';

export function AdminButton() {
  const [waiting, setWaiting] = useState(0);
  useFocusEffect(useCallback(() => {
    staffToday().then((t) => setWaiting(NEEDS.reduce((n, x) => n + (Number(t[x.key]) || 0), 0))).catch(() => setWaiting(0));
  }, []));
  const line = waiting ? `${waiting} ${waiting === 1 ? 'thing needs' : 'things need'} you` : 'People, classes and access';
  return (
    <Pressable onPress={() => router.push('/admin')} accessibilityRole="button" accessibilityLabel={`Admin portal: ${line}. Open it`}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={styles.cover}>
        <View style={styles.spine} />
        <View style={styles.band} />
        <View style={styles.badgeIcon}>
          <Ionicons name="shield-checkmark" size={26} color={NAVY} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} numberOfLines={1}>Admin portal</Text>
          <Text style={[styles.count, waiting > 0 && { color: '#fff' }]} numberOfLines={1}>{line}</Text>
        </View>
        {waiting > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{waiting}</Text></View>}
        <Ionicons name="chevron-forward" size={22} color="rgba(255, 255, 255, 0.8)" />
      </View>
    </Pressable>
  );
}

// The Class Folder card's measurements (src/schoolForms/MainFolder.tsx), so the two match.
const styles = StyleSheet.create({
  card: { marginBottom: 4 },
  cover: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingBottom: 26, paddingLeft: 24, paddingRight: 12, borderRadius: 14,
    backgroundColor: SCHOOL.theme.dark, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  spine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 10, backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRightWidth: 1, borderRightColor: 'rgba(255, 255, 255, 0.18)' },
  band: { position: 'absolute', left: 0, right: 0, bottom: 12, height: 6, backgroundColor: GOLD },
  badgeIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  count: { color: 'rgba(255, 255, 255, 0.75)', fontSize: 14, fontWeight: '600' },
  badge: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: NAVY, fontWeight: '900', fontSize: 13 },
});
