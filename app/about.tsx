import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { getSite } from '../src/api/mockApi';
import { AutoImage } from '../src/site/Blocks';
import { openLink, routeFor } from '../src/site/links';
import { moreMenu } from '../src/site/moreMenu';
import { SCHOOL } from '../src/school';
import { C, Card, H, Loading, P, s, useLoad } from '../src/ui';

type Campus = { name: string; grades: string; line1: string; city: string; state: string; zip: string; phone: string };

/**
 * About the school (Profile tab → About, once the More tab): the website's menu (shaped for the app in
 * src/site/moreMenu.ts), contact details and footer.
 */
export default function About() {
  const { data } = useLoad(getSite);
  const [open, setOpen] = useState<string | null>(null);
  const title = <Stack.Screen options={{ title: `About ${SCHOOL.name}` }} />;
  if (!data) return <>{title}<Loading /></>;
  const { school, navigation, footer, social } = data;
  const external = (url: string) => routeFor(url).kind === 'external';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      {title}
      {school.logo && <AutoImage uri={school.logo} contain maxHeight={110} />}

      {moreMenu(navigation, footer).map((n) => n.items ? (
        <Card key={n.label} onPress={() => setOpen(open === n.label ? null : n.label)}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{n.label}  {open === n.label ? '▾' : '▸'}</Text>
          {open === n.label && n.items.map((it) => (
            <Text key={it.label} onPress={() => openLink(it.url)} style={{ paddingVertical: 8, fontSize: 15, color: C.primary }}>
              {it.label}{external(it.url) ? '  ↗' : ''}
            </Text>
          ))}
        </Card>
      ) : (
        <Card key={n.label} onPress={() => n.url && openLink(n.url)}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.ink }}>{n.label}{n.url && external(n.url) ? '  ↗' : '  ›'}</Text>
        </Card>
      ))}

      <Card>
        <H>Contact</H>
        {/* A school on several campuses lists each, with its grades and phone. */}
        {(school as { campuses?: Campus[] }).campuses?.map((c) => (
          <View key={c.name} style={{ gap: 2, marginBottom: 6 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{c.name} <Text style={{ color: C.muted, fontWeight: '400' }}>· {c.grades}</Text></Text>
            <P>{c.line1}{'\n'}{c.city}, {c.state} {c.zip}</P>
            <Text style={{ color: C.primary }} onPress={() => Linking.openURL(`tel:${c.phone.replace(/\D/g, '')}`)}>{c.phone}</Text>
          </View>
        )) ?? (<>
          <P>{school.address.line1}{'\n'}{school.address.city}, {school.address.state} {school.address.zip}</P>
          <Text style={{ color: C.primary }} onPress={() => Linking.openURL(`tel:${school.phone.replace(/\D/g, '')}`)}>{school.phone}</Text>
        </>)}
        <Text style={{ color: C.primary }} onPress={() => Linking.openURL(`mailto:${school.email}`)}>{school.email}</Text>
        <Text style={{ color: C.primary }} onPress={() => Linking.openURL(`mailto:${school.admissionsEmail}`)}>{school.admissionsEmail}</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
          {social.map((x) => <Text key={x.service} style={{ color: C.primary, fontWeight: '700' }} onPress={() => Linking.openURL(x.url)}>{x.service}</Text>)}
        </View>
      </Card>

      <P muted>{footer.about}</P>
      <P muted>{footer.nonDiscrimination}</P>
    </ScrollView>
  );
}
