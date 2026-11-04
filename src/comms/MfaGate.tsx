/**
 * Admin tools require a session verified with an authenticator app (Google
 * Authenticator, Microsoft Authenticator, Authy, 1Password…). Free, and the
 * database enforces it too. First visit links the app; later visits ask for a code.
 *
 * MfaGate covers a whole admin screen; VerifyCard asks in place, on a screen
 * everyone uses, where only one tool needs the code (sending a critical alert,
 * triaging feedback, adding a Royal News issue, routing questions). Either way
 * the session is verified once and every admin tool opens after that.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Image, Linking, Platform, Text, View } from 'react-native';
import { errorText, mfaEnroll, mfaStatus, mfaVerify, myAccess, type Access } from '../api/connect';
import { Button, C, Card, Field, H, Loading, P, s } from '../ui';
import { SCHOOL } from '../school';

type Step = 'none' | 'needs-code';

/** Enter the code from the authenticator app, or link one the first time; `onDone` once the session is verified. */
function Verify({ step, factorId: linked, why, onDone }: { step: Step; factorId?: string; why?: string; onDone: () => void }) {
  const [factorId, setFactorId] = useState(linked);
  const [enroll, setEnroll] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try { const r = await mfaEnroll(); setFactorId(r.factorId); setEnroll(r); } catch (e) { Alert.alert('Authenticator', errorText(e)); }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true);
    try { await mfaVerify(factorId!, code); setCode(''); setEnroll(null); setBusy(false); onDone(); return; }
    catch (e) { Alert.alert('That code didn\'t work', errorText(e)); }
    setBusy(false);
  };

  const codeBox = (
    <>
      <Field label="6-digit code from your authenticator app" style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center' }} placeholder="123456" keyboardType="number-pad"
        maxLength={6} value={code} onChangeText={setCode} autoComplete="one-time-code" />
      <Button label={busy ? 'Checking…' : 'Verify'} onPress={verify} disabled={busy || code.length !== 6} />
    </>
  );

  if (step === 'needs-code' && !enroll) return (
    <Card>
      <H>Verify it's you</H>
      <P>{why ? `${why} Enter` : 'Enter'} the 6-digit code from your authenticator app for {SCHOOL.connectName}.</P>
      {codeBox}
    </Card>
  );
  if (!enroll) return (
    <Card>
      <H>Protect your admin account</H>
      <P>{why ? `${why} ` : ''}Admin tools need a second step: a code from a free authenticator app such as Google Authenticator, Microsoft Authenticator or Authy.</P>
      <Button label={busy ? 'Please wait…' : 'Set up authenticator app'} onPress={start} disabled={busy} />
    </Card>
  );
  return (
    <Card>
      <H>Link your authenticator app</H>
      {Platform.OS === 'web'
        ? <><P>Scan this with your authenticator app:</P><Image source={{ uri: enroll.qr }} style={{ width: 200, height: 200, alignSelf: 'center' }} /></>
        : <Button kind="ghost" label="Open in authenticator app" onPress={() => Linking.openURL(enroll.uri).catch(() => Alert.alert('No authenticator app found', 'Install one, or enter the key below by hand.'))} />}
      <P muted>Or add it by hand with this key:</P>
      <Text selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 16, color: C.ink, textAlign: 'center' }}>
        {enroll.secret.replace(/(.{4})/g, '$1 ').trim()}
      </Text>
      <P>Then enter the 6-digit code it shows:</P>
      {codeBox}
    </Card>
  );
}

/** A whole admin screen: shown once the person is an admin and the session is verified. */
export function MfaGate({ children }: { children: (access: Access) => ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [state, setState] = useState<'loading' | Step | 'ok' | 'not-admin'>('loading');
  const [factorId, setFactorId] = useState<string>();

  const check = useCallback(async () => {
    const a = await myAccess();
    setAccess(a);
    if (!a || (!a.tier && a.granted.length === 0)) return setState('not-admin');
    if (!a.mfaRequired || a.mfaVerified) return setState('ok');
    const m = await mfaStatus();
    setFactorId(m.factorId);
    // Verified at sign-in but my_access hadn't caught up: ask again for what it now allows.
    if (m.state === 'verified') return setState('ok');
    setState(m.state);
  }, []);
  useEffect(() => { check().catch((e) => Alert.alert('Admin tools', errorText(e))); }, [check]);

  if (state === 'loading') return <Loading />;
  if (state === 'not-admin') return <View style={s.center}><P>This is for school administrators.</P></View>;
  if (state === 'ok' && access) return <>{children(access)}</>;
  return (
    <View style={[s.screen, s.pad]}>
      <Verify step={state === 'ok' ? 'needs-code' : state} factorId={factorId} onDone={() => { check().catch(() => {}); }} />
    </View>
  );
}

/**
 * In place on a screen: "Verify it's you" for the one tool that needs it (`why` says which), then
 * `onVerified` so the screen loads what the verified session allows. Nothing once it's verified.
 */
export function VerifyCard({ why, onVerified }: { why: string; onVerified: () => void }) {
  const [m, setM] = useState<{ step: Step; factorId?: string } | null>(null);
  const done = useRef(onVerified);
  done.current = onVerified;
  useEffect(() => {
    let live = true;
    mfaStatus().then((r) => {
      if (!live) return;
      if (r.state === 'verified') done.current();
      else setM({ step: r.state, factorId: r.factorId });
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!m) return null;
  return <Verify step={m.step} factorId={m.factorId} why={why} onDone={() => done.current()} />;
}
