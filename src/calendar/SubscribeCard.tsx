/**
 * "Your calendar in Google, Outlook, Yahoo or your iPhone": one private link the person's own
 * calendar subscribes to, and that keeps itself up to date (moved or cancelled games too). What's
 * in it depends on who they are: the school calendar, their own events and the games they'll go to
 * (staff), their children's activities (families). Names stay in the app.
 */
import { useState } from 'react';
import { Alert, Linking, Platform, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { calendarSubscription, errorText } from '../api/connect';
import { Button, C, Card, H, P, ask } from '../ui';

type Links = NonNullable<Awaited<ReturnType<typeof calendarSubscription>>>;

export function SubscribeCard({ staff }: { staff: boolean }) {
  const [links, setLinks] = useState<Links | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const get = (fresh = false) => {
    setBusy(true);
    calendarSubscription(fresh).then(setLinks).catch((e) => Alert.alert('Calendar link', errorText(e))).finally(() => setBusy(false));
  };
  const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert('Calendar link', 'That calendar app isn’t on this device.'));
  const copy = () => Clipboard.setStringAsync(links!.https).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  const renew = () => ask('Make a new link?', 'The old link stops working, so any calendar using it needs the new one.', 'New link', () => get(true));

  return (
    <Card style={{ gap: 8 }}>
      <H>In your Google, Outlook, Yahoo or iPhone calendar</H>
      <P muted>
        Subscribe once and it keeps itself up to date: the school calendar{staff ? ', your own events and the games you’ll go to' : ', and your children’s games, rehearsals and meets'}.
        Students’ names stay in the app.
      </P>
      {!links ? <Button kind="ghost" label={busy ? 'Getting your link…' : 'Subscribe'} onPress={() => get()} disabled={busy} /> : (
        <View style={{ gap: 6 }}>
          <Button label="Google Calendar" onPress={() => open(links.google)} />
          <Button kind="ghost" label={Platform.OS === 'ios' ? 'iPhone Calendar' : 'Apple Calendar'} onPress={() => open(links.apple)} />
          <Button kind="ghost" label="Outlook.com" onPress={() => open(links.outlook)} />
          <Button kind="ghost" label="Outlook (work or school)" onPress={() => open(links.outlookWork)} />
          <Button kind="ghost" label={copied ? 'Copied' : 'Copy the link (Yahoo and others)'} onPress={copy} />
          <P muted>Yahoo: Calendar → Actions → Follow Other Calendars → paste the link. Calendars check it every few hours; Google can take up to a day.</P>
          <Text style={{ color: C.muted, fontWeight: '700' }} accessibilityRole="button" onPress={renew}>Shared it by mistake? Make a new link</Text>
        </View>
      )}
    </Card>
  );
}
