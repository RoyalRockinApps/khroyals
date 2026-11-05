/**
 * Checking in at school, at the top of a teacher's, staff member's or substitute's Planner: "Check in" when they get to
 * school (the server checks they're there, by location, like the car line), then "Check out" when they leave, so
 * On-Site Attendance knows who is on campus. Says when they came and went today, and when the office did it for them.
 * Nothing for anyone else, or on demo data.
 */
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { campusCheck, errorText, myCampusStatus, type CampusStatus } from '../api/connect';
import { clock } from '../carline/format';
import { currentSpot } from '../carline/location';
import { C, Card, ask } from '../ui';

const GREEN = '#15803D';

export function CheckInCard() {
  const [st, setSt] = useState<CampusStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let on = true;
    myCampusStatus().then((x) => on && setSt(x)).catch(() => {});
    return () => { on = false; };
  }, []));
  if (!st?.role) return null;

  const firstIn = st.checks.find((c) => c.kind === 'in');
  const last = st.checks[st.checks.length - 1];
  const run = async (kind: 'in' | 'out') => {
    setBusy(true); setError(null);
    try {
      const at = kind === 'in' ? await currentSpot('so it can tell you\'re at school') : null;
      setSt(await campusCheck(kind, at));
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const title = st.here ? `Checked in at ${clock(firstIn?.at ?? last.at)}` : last ? `Checked out at ${clock(last.at)}` : 'Not checked in yet';
  const sub = st.here ? `${last.byOffice ? 'The office checked you in. ' : ''}Check out when you leave school.`
    : last ? 'Back at school? Check in again.' : 'Check in when you get to school, so the office knows you’re here.';

  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: st.here ? `${GREEN}1A` : `${C.primary}14` }}>
          <Ionicons name={st.here ? 'checkmark-circle' : 'location-outline'} size={22} color={st.here ? GREEN : C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{title}</Text>
          <Text style={{ color: C.muted }}>{sub}</Text>
        </View>
        <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={st.here ? 'Check out' : 'Check in'}
          onPress={() => (st.here
            ? ask('Check out?', 'On-Site Attendance shows you’ve left school.', 'Check out', () => run('out'))
            : run('in'))}
          style={({ pressed }) => [{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
            backgroundColor: st.here ? '#fff' : C.primary, borderWidth: st.here ? 1 : 0, borderColor: C.line },
            (pressed || busy) && { opacity: 0.7 }]}>
          <Text style={{ fontWeight: '800', color: st.here ? C.primary : '#fff' }}>{busy ? '…' : st.here ? 'Check out' : 'Check in'}</Text>
        </Pressable>
      </View>
      {!!error && <Text style={{ color: C.danger }}>{error}</Text>}
    </Card>
  );
}
