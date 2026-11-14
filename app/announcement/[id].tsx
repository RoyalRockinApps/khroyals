/**
 * An announcement as the people it went to see it, from its notification: its splash page (when it has one), else its
 * title and message, with a button to the screen it's about.
 */
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router';
import { errorText, viewAnnouncement, type Announcement } from '../../src/api/connect';
import { DESTINATIONS } from '../../src/announcements/kinds';
import { SplashView } from '../../src/announcements/Splash';
import { NAVY } from '../../src/sports/ui';
import { Button, C, Card, Loading, P, s } from '../../src/ui';

export default function AnnouncementView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [a, setA] = useState<Announcement | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { viewAnnouncement(id).then(setA).catch((e) => setError(errorText(e))); }, [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (error) return <View style={[s.screen, s.pad]}><Stack.Screen options={{ title: 'Announcement' }} /><Card><P muted>{error}</P></Card></View>;
  if (a === undefined) return <><Stack.Screen options={{ title: 'Announcement' }} /><Loading /></>;
  if (!a) return <View style={[s.screen, s.pad]}><Stack.Screen options={{ title: 'Announcement' }} /><Card><P muted>This announcement isn't here anymore.</P></Card></View>;
  if (a.splash) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SplashView a={a} onClose={back} onTap={a.link ? () => router.replace(a.link as Href) : undefined} />
      </>
    );
  }
  const goes = a.link ? DESTINATIONS.find((d) => d.path === a.link)?.label ?? 'it' : null;
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <Stack.Screen options={{ title: 'Announcement' }} />
      <Card style={{ gap: 10, borderTopWidth: 5, borderTopColor: NAVY }}>
        <Text style={{ fontSize: 22, fontWeight: '900', color: C.ink }}>{a.title}</Text>
        <Text style={{ fontSize: 16, lineHeight: 24, color: C.ink }}>{a.body}</Text>
        {a.sentAt && <P muted>{new Date(a.sentAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</P>}
        {a.link && goes && <Button label={`Open ${goes}`} onPress={() => router.replace(a.link as Href)} />}
      </Card>
    </ScrollView>
  );
}
