/**
 * Its leaders (?opportunity= or ?event=, with its title): the check-in QR code, big enough to scan from a phone held up
 * or a printed sign (Print on the web), with the short code to type under it. Volunteers scan it when they arrive and
 * again when they're done. A new code stops the old one working (a lost printout, say).
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { errorText, volunteerCheckInCode } from '../../src/api/connect';
import { QrCode } from '../../src/share/QrCode';
import { checkInQr, shortCheckInCode } from '../../src/volunteer/attendance';
import { GREEN } from '../../src/volunteer/parts';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, Card, H, Loading, P, ask, s, useBottomInset } from '../../src/ui';
import { SCHOOL } from '../../src/school';

export default function CheckInCode() {
  const { opportunity, event, title } = useLocalSearchParams<{ opportunity?: string; event?: string; title?: string }>();
  return (
    <VolunteerGate title="Check-in QR code">
      {() => <Code kind={opportunity ? 'opportunity' : 'event'} id={opportunity ?? event ?? ''} title={title ?? ''} />}
    </VolunteerGate>
  );
}

function Code({ kind, id, title }: { kind: 'opportunity' | 'event'; id: string; title: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();
  const bottom = useBottomInset();
  const load = useCallback((renew = false) => {
    setBusy(true);
    return volunteerCheckInCode(kind === 'opportunity' ? { opportunityId: id } : { eventId: id }, renew)
      .then((c) => { setCode(c); setError(null); }).catch((e) => setError(errorText(e))).finally(() => setBusy(false));
  }, [kind, id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <View style={[s.screen, s.pad]}><Card><H>No check-in code</H><P muted>{error}</P><Button label="Try again" onPress={() => load()} /></Card></View>;
  if (!code) return <Loading />;

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { alignItems: 'center', paddingBottom: 16 + bottom }]}>
      <Stack.Screen options={{ title: 'Check-in QR code' }} />
      <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1.2, color: GREEN }}>VOLUNTEER CHECK-IN</Text>
      {!!title && <Text style={{ fontSize: 24, fontWeight: '900', color: C.ink, textAlign: 'center' }}>{title}</Text>}
      <QrCode value={checkInQr(code)} size={Math.min(width - 64, 360)} label={`Check-in QR code for ${title}`} />
      <Text style={{ color: C.muted, fontWeight: '600' }}>Or type this code in the app</Text>
      <Text selectable style={{ fontSize: 30, fontWeight: '900', letterSpacing: 4, color: C.ink, fontVariant: ['tabular-nums'] }}>{shortCheckInCode(code)}</Text>
      <Card style={{ alignSelf: 'stretch', gap: 6 }}>
        <Text style={{ fontWeight: '800', color: C.ink }}>Volunteers</Text>
        <P muted>{`Open Volunteer in the ${SCHOOL.appName} app and tap "I'm here: scan to check in" when you arrive. Scan again when you're done to check out, so your time counts.`}</P>
        {kind === 'event' && <P muted>This one code works for every opportunity in the event.</P>}
      </Card>
      {Platform.OS === 'web' && (
        <View style={{ alignSelf: 'stretch' }}><Button label="Print" onPress={() => globalThis.print?.()} /></View>
      )}
      <Text style={{ color: C.danger, fontWeight: '600', opacity: busy ? 0.5 : 1 }} accessibilityRole="button"
        onPress={busy ? undefined : () => ask('Make a new code?', 'The old code, and any copies you printed, stop working.', 'New code', () => { load(true); })}>
        Make a new code
      </Text>
    </ScrollView>
  );
}
