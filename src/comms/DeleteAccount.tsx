/**
 * Delete my account, at the bottom of My profile and of the Waiting for approval screen (Apple requires it for any app
 * where people make accounts). A quiet link opens it; it says what goes, asks for DELETE, and once the school's server
 * has deleted the account (`delete_my_account`), tidies this phone (push, automatic car line check-in, the car pass)
 * and signs out here. A student whose parents are linked loses only the login; directors hand the role on first (the
 * server says so).
 */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { deleteMyAccount, errorText, type Person } from '../api/connect';
import { forgetCarPass } from '../carline/carPass';
import { disableAutoCheckIn } from '../carline/autoCheckIn';
import { SCHOOL } from '../school';
import { C, Card, Field, H, P } from '../ui';
import { disablePush } from './push';

export function DeleteAccount({ person, onDone }: { person: Person | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const student = person?.schoolRole === 'student' && !person.pending;

  if (!open) {
    return (
      <Text onPress={() => setOpen(true)} accessibilityRole="button"
        style={{ color: C.danger, fontWeight: '600', textAlign: 'center', paddingVertical: 10 }}>Delete my account</Text>
    );
  }

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const result = await deleteMyAccount(text);
      await Promise.all([disablePush(), disableAutoCheckIn(), forgetCarPass()].map((p) => p.catch(() => {})));
      Alert.alert(result === 'login_removed' ? 'Your login is removed' : 'Your account is deleted',
        result === 'login_removed' ? 'Your parents can give you a login again under My children.' : `Thank you for using ${SCHOOL.appName}.`);
      onDone();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const ready = text.trim().toUpperCase() === 'DELETE';

  return (
    <Card style={{ gap: 10, borderColor: `${C.danger}66` }}>
      <H>Delete my account</H>
      {student ? (
        <P>If your parents use the app, only your login goes: you stay on your classes and with your family, and they can give you a login again. Otherwise your account and what you posted are deleted.</P>
      ) : (
        <P>This permanently deletes your login and your profile, with your posts, comments, sign-ups and settings. Any children of yours stay at school, and the office keeps their records. This can’t be undone.</P>
      )}
      <Field label="Type DELETE to confirm" value={text} onChangeText={setText} autoCapitalize="characters" autoCorrect={false}
        placeholder="DELETE" error={error} />
      <Pressable onPress={run} disabled={busy || !ready} accessibilityRole="button" accessibilityState={{ disabled: busy || !ready }}
        style={({ pressed }) => [{ backgroundColor: C.danger, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
          (busy || !ready) && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{busy ? 'Deleting…' : student ? 'Remove my login' : 'Delete my account'}</Text>
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Text onPress={() => { setOpen(false); setText(''); setError(null); }} accessibilityRole="button"
          style={{ color: C.primary, fontWeight: '600', paddingVertical: 6 }}>Cancel</Text>
      </View>
    </Card>
  );
}
