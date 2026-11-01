/**
 * Scan the leader's check-in QR code. Arriving, it checks you in to what you said yes to; scanning again asks whether
 * you're done, then checks you out and shows your time. The short code under the QR can be typed instead (the web has
 * no scanner).
 */
import { useCallback, useRef, useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { errorText, volunteerScan, type VolunteerScan } from '../../src/api/connect';
import { clockAt, duration } from '../../src/volunteer/attendance';
import { GREEN } from '../../src/volunteer/parts';
import { VolunteerGate } from '../../src/volunteer/VolunteerGate';
import { Button, C, P, s } from '../../src/ui';
import { SCHOOL } from '../../src/school';

export default function ScanCheckIn() {
  return <VolunteerGate title="Volunteer check-in">{() => <Scanner />}</VolunteerGate>;
}

type Result = VolunteerScan | { error: string };

function Scanner() {
  const [permission, ask] = useCameraPermissions();
  const [result, setResult] = useState<Result | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const reading = useRef(false);
  const last = useRef('');   // the code that was read, to confirm you're done with

  const scan = useCallback(async (code: string, done = false) => {
    if (reading.current) return;   // the camera reports the same code many times a second
    reading.current = true;
    setBusy(true);
    last.current = code;
    try { setResult(await volunteerScan(code, done)); } catch (e) { setResult({ error: errorText(e) }); } finally {
      reading.current = false;
      setBusy(false);
    }
  }, []);
  const read = (data: string) => {
    if (reading.current) return;
    if (!/^VOL-/i.test(data.trim())) { setResult({ error: "That isn't a volunteer check-in code. Scan the one your leader shows." }); return; }
    scan(data.trim());
  };
  const submit = () => { if (typed.trim()) { scan(typed.trim()); setTyped(''); } };
  const camera = Platform.OS !== 'web';

  return (
    <View style={[s.screen, { padding: 16, gap: 12 }]}>
      {!result && camera && (permission?.granted ? (
        <>
          <P>Point the camera at your leader's check-in QR code.</P>
          <View style={{ flex: 1, minHeight: 260, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => read(data)} />
            <View pointerEvents="none" style={{ position: 'absolute', top: '20%', left: '20%', right: '20%', bottom: '20%', borderWidth: 3, borderColor: '#fff', borderRadius: 16, opacity: 0.8 }} />
          </View>
        </>
      ) : (
        <View style={{ gap: 8 }}>
          <P>Checking in uses the camera to read your leader's QR code.</P>
          <Button label="Turn on the camera" onPress={() => ask()} />
          {permission && !permission.canAskAgain && <P muted>Camera access is off for {SCHOOL.appName}. Turn it on in Settings, or type the code below.</P>}
        </View>
      ))}

      {result && <Outcome r={result} busy={busy} onDone={() => scan(last.current, true)} onAgain={() => setResult(null)} />}

      {!result && (
        <>
          <View style={[s.row, { gap: 8 }]}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Or type the code under the QR" accessibilityLabel="Check-in code" value={typed}
              onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} maxLength={40} returnKeyType="done" onSubmitEditing={submit} />
            <Button label="Check in" disabled={!typed.trim() || busy} onPress={submit} />
          </View>
          {!camera && <P muted>On a phone, {SCHOOL.appName} scans the QR code with the camera.</P>}
        </>
      )}
    </View>
  );
}

/** What the scan did: checked in, asks whether you're done, checked out, or why not. */
function Outcome({ r, busy, onDone, onAgain }: { r: Result; busy: boolean; onDone: () => void; onAgain: () => void }) {
  const panel = (color: string, icon: React.ComponentProps<typeof Ionicons>['name'], title: string, body: string) => (
    <View accessibilityLiveRegion="assertive" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderRadius: 16, backgroundColor: color }}>
      <Ionicons name={icon} size={38} color="#fff" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: '#fff', fontSize: 21, fontWeight: '900' }}>{title}</Text>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{body}</Text>
      </View>
    </View>
  );
  if ('error' in r) {
    return (
      <View style={{ gap: 12 }}>
        {panel(C.danger, 'close-circle', 'Not checked in', r.error)}
        <Button label="Try again" onPress={onAgain} />
      </View>
    );
  }
  if (r.action === 'confirm') {
    return (
      <View style={{ gap: 12 }}>
        {panel(C.primary, 'help-circle', 'Are you done?', `${r.title}${r.since ? `: you checked in at ${clockAt(r.since)}` : ''}.`)}
        <Button label={busy ? 'Checking out…' : "Yes, I'm done: check out"} disabled={busy} onPress={onDone} />
        <Button kind="ghost" label="Not yet" onPress={() => router.back()} />
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {r.action === 'in'
        ? panel(GREEN, 'checkmark-circle', "You're checked in!", `${r.title}. Scan the code again when you're done.`)
        : panel(GREEN, 'heart', 'Thank you!', `You gave ${duration(r.minutes ?? 0)} to ${r.title}.`)}
      <Button label="Done" onPress={() => router.back()} />
    </View>
  );
}
