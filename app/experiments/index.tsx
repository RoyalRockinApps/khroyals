/**
 * A/B tests (Admin portal → Your tools in other apps, or Royal News → the gear), for push.send holders behind the
 * authenticator check: every test, running or not, with how many people it has counted. Tap one for its results.
 */
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorText, experimentsList, type ExperimentSummary } from '../../src/api/connect';
import { MfaGate } from '../../src/comms/MfaGate';
import { EXPERIMENTS } from '../../src/experiments/registry';
import { C, Loading, P, s } from '../../src/ui';

export default function Experiments() {
  return (
    <>
      <Stack.Screen options={{ title: 'A/B tests' }} />
      <MfaGate>{(access) => access.permissions.includes('push.send')
        ? <List />
        : <View style={[s.screen, s.pad]}><P>A/B tests are for staff who send notifications.</P></View>}
      </MfaGate>
    </>
  );
}

function List() {
  const [list, setList] = useState<ExperimentSummary[] | null>(null);
  useFocusEffect(useCallback(() => { experimentsList().then(setList).catch((e) => { setList([]); Alert.alert('A/B tests', errorText(e)); }); }, []));
  if (!list) return <Loading />;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <P muted>Different groups of people see different versions of one part of the app, and the counts show which works better.</P>
      {list.length === 0 && <P muted>No tests yet.</P>}
      {list.map((x) => (
        <Pressable key={x.key} onPress={() => router.push({ pathname: '/experiments/[key]', params: { key: x.key } })} accessibilityRole="button"
          style={({ pressed }) => [s.card, s.row, { gap: 12 }, pressed && { opacity: 0.8 }]}>
          <Ionicons name={x.active ? 'radio-button-on' : 'pause-circle-outline'} size={22} color={x.active ? '#15803D' : C.muted} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{EXPERIMENTS[x.key]?.title ?? x.title}</Text>
            <Text style={{ color: C.muted }}>{x.active ? 'Running' : x.startedAt ? 'Stopped' : 'Not started'} · {x.people} {x.people === 1 ? 'person' : 'people'} counted</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
