/**
 * Share: a pass in the school's colors with a QR code (the shield in its middle) that anyone can scan with their
 * phone's camera. Chips pick what it opens: the app (src/share/targets.ts: its web address), the website, the school
 * calendar and the latest Royal News issue, each only with a public link. Share sends the link, Copy puts it on the
 * clipboard, and Save image makes a picture of the pass for a flyer or the newsletter (react-native-view-shot; the
 * share sheet's Save Image on phones, a download on the web).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Share as ShareSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { errorText, listNewsletters } from '../../src/api/connect';
import { SCHOOL } from '../../src/school';
import { Pass } from '../../src/share/Pass';
import { shareTargets, type ShareKey } from '../../src/share/targets';
import { C, P, s } from '../../src/ui';

// The web app can only share where the browser supports it (phones, Safari).
const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'share' in navigator);

export default function Share() {
  const { width } = useWindowDimensions();
  const passWidth = Math.min(width - 40, 380);   // pass-sized on tablets and computers too
  const [news, setNews] = useState<{ title: string; url: string } | null>(null);
  const [key, setKey] = useState<ShareKey>('app');
  const [saving, setSaving] = useState(false);   // the shine stays out of the picture
  const [copied, setCopied] = useState(false);
  const pass = useRef<View>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The newest Royal News issue with a public (Smore) link, if there is one.
  useEffect(() => {
    listNewsletters().then((list) => {
      const issue = list.find((n) => /^https:\/\//.test(n.sourceUrl ?? ''));
      setNews(issue ? { title: issue.title, url: issue.sourceUrl! } : null);
    }).catch(() => {});
    return () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); };
  }, []);
  const targets = useMemo(() => shareTargets({
    appName: SCHOOL.appName, schoolName: SCHOOL.name, fullName: SCHOOL.fullName, newsName: SCHOOL.newsName,
    webApp: SCHOOL.webApp, website: SCHOOL.website, calendarPdf: SCHOOL.calendarPdf, news,
  }), [news]);
  const target = targets.find((t) => t.key === key) ?? targets[0];

  const share = () => ShareSheet.share(
    Platform.OS === 'ios' ? { url: target.url, message: target.message } : { message: `${target.message}: ${target.url}`, title: SCHOOL.name },
  ).catch(() => {});
  const copy = () => Clipboard.setStringAsync(target.url).then(() => {
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }).catch(() => {});
  const save = async () => {
    setSaving(true);
    await new Promise((done) => setTimeout(done, 60));   // let the pass draw without its shine
    try {
      if (Platform.OS === 'web') {
        const uri = await captureRef(pass, { format: 'png', result: 'data-uri' });
        const a = document.createElement('a');
        a.href = uri;
        a.download = `${SCHOOL.appName} ${target.label}.png`.replace(/[^\w .-]/g, '');
        a.click();
      } else {
        const uri = await captureRef(pass, { format: 'png', quality: 1, result: 'tmpfile' });
        if (!(await Sharing.isAvailableAsync())) throw new Error("This phone can't save or share images from here.");
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `Save the ${target.label} QR code` });
      }
    } catch (e) {
      Alert.alert("Couldn't make the image", errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { gap: 16 }]}>
      <View style={[s.row, { flexWrap: 'wrap', gap: 8, justifyContent: 'center' }]} accessibilityRole="tablist">
        {targets.map((t) => {
          const on = t.key === target.key;
          return (
            <Text key={t.key} onPress={() => setKey(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, overflow: 'hidden', borderWidth: 1.5,
                borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : '#fff', color: on ? '#fff' : C.ink, fontWeight: '700' }}>
              {t.label}
            </Text>
          );
        })}
      </View>

      <Pass ref={pass} target={target} width={passWidth} shine={!saving} />

      <View style={[s.row, { justifyContent: 'center', gap: 12, flexWrap: 'wrap' }]}>
        {canShare && <Action icon="share-outline" label="Share" onPress={share} />}
        <Action icon={copied ? 'checkmark' : 'copy-outline'} label={copied ? 'Copied' : 'Copy link'} onPress={copy} />
        <Action icon="download-outline" label={saving ? 'Saving…' : 'Save image'} onPress={saving ? undefined : save} />
      </View>
      <P muted>
        {"Show this to a friend: pointing their phone's camera at the code opens it. Save the image to put the code on a flyer, a sign or the newsletter."}
      </P>
    </ScrollView>
  );
}

/** A round button with its label under it. */
function Action({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} disabled={!onPress}
      style={({ pressed }) => [{ alignItems: 'center', gap: 6, width: 84 }, (pressed || !onPress) && { opacity: 0.6 }]}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.primary,
        alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={C.primary} />
      </View>
      <Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
