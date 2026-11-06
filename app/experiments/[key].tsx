/**
 * One A/B test's results (Royal News → the gear, or Admin portal → Your tools in other apps → A/B tests), for push.send
 * holders behind the authenticator check: what each version is, how many saw, opened and read to the end, and whether
 * a version is really doing better (src/experiments/stats.ts). Start, stop, or start over (clears the counts).
 * Counts only: nobody's name is shown.
 */
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { errorText, experimentResults, setExperiment, type ExperimentResults } from '../../src/api/connect';
import { MfaGate } from '../../src/comms/MfaGate';
import { ResultsView } from '../../src/experiments/ResultsView';
import { Card, Loading, P, s } from '../../src/ui';

export default function Experiment() {
  return (
    <>
      <Stack.Screen options={{ title: 'A/B test' }} />
      <MfaGate>{(access) => access.permissions.includes('push.send')
        ? <Results />
        : <View style={[s.screen, s.pad]}><P>A/B tests are for staff who send notifications.</P></View>}
      </MfaGate>
    </>
  );
}

function Results() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const [r, setR] = useState<ExperimentResults | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { experimentResults(key).then(setR).catch((e) => { setR(null); Alert.alert('A/B test', errorText(e)); }); }, [key]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (r === undefined) return <Loading />;
  if (!r) return <View style={[s.screen, s.pad]}><Card><P>There’s no test called “{key}”.</P></Card></View>;

  const run = async (active: boolean, reset = false) => {
    setBusy(true);
    try { await setExperiment(r.key, active, reset); load(); } catch (e) { Alert.alert('A/B test', errorText(e)); } finally { setBusy(false); }
  };
  return <ResultsView r={r} busy={busy} onRun={run} onRefresh={load} />;
}
