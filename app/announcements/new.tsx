/**
 * Write an announcement (people with Send notifications, behind the authenticator code). On top, "What they'll see":
 * the notification as it looks on a phone and the splash page as a little phone (tap it for the full-screen preview),
 * changing as they type. Below, numbered steps: the message; where it shows (a push and bell notification, a splash page
 * when people open the app, or both, and Urgent); the splash page (a template with a headline, words and an optional
 * photo, or an uploaded graphic (a picture, an animated GIF or an .mp4 video, src/announcements/media.ts), with a button and the days it shows); who it's for, with how many people that reaches;
 * which screen tapping it opens (a sheet of icons); and when (now, or a day and time). The Send bar stays at the bottom
 * and says what goes to how many and when, or what's still missing. `?start=` fills it in from one of the history's
 * quick starts (src/announcements/kinds.ts); their [blanks] have to be filled before it sends.
 */
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { announcementReach, live, sendAnnouncement, uploadAnnouncementMedia, uploadAnnouncementPicture, type Audience } from '../../src/api/connect';
import { pickSplashMedia, type SplashUpload } from '../../src/announcements/media';
import { AudiencePicker, Chip } from '../../src/announcements/AudiencePicker';
import { DestinationSheet } from '../../src/announcements/DestinationSheet';
import {
  DESTINATIONS, QUICK_STARTS, SPLASH_MAX_MB, TEMPLATES, audienceLabel, audienceProblem, blanksLeft, dayWord, sendSummary, type Template,
} from '../../src/announcements/kinds';
import { NotificationPreview, SplashThumb } from '../../src/announcements/Preview';
import { SplashView } from '../../src/announcements/Splash';
import { schoolToday } from '../../src/calendar/past';
import { MfaGate } from '../../src/comms/MfaGate';
import { DateField, TimeField } from '../../src/forms/DateTimeField';
import { pickSplashPicture } from '../../src/photos';
import { SCHOOL } from '../../src/school';
import { GOLD_LIGHT, NAVY } from '../../src/sports/ui';
import { oops } from '../../src/study/ui';
import { Button, C, Card, Field, P, ask, s } from '../../src/ui';

export default function NewAnnouncementScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'New announcement' }} />
      {/* Demo builds (no server, nothing really sent) open it so it can be tried. */}
      {live ? <MfaGate>{() => <Composer />}</MfaGate> : <Composer />}
    </>
  );
}

const plus = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** "7:30 AM" from "07:30". */
const twelve = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const AMBER = '#B45309';
type Picture = { base64: string; uri: string } | null;

function tell(text: string) {
  if (Platform.OS === 'web') globalThis.alert?.(text);
  else Alert.alert('Almost there', text);
}

function Composer() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  const [quick] = useState(() => QUICK_STARTS.find((x) => x.key === start) ?? null);
  const insets = useSafeAreaInsets();
  const today = schoolToday();
  const [title, setTitle] = useState(quick?.title ?? '');
  const [body, setBody] = useState(quick?.body ?? '');
  const [push, setPush] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [audience, setAudience] = useState<Audience>(quick?.audience ?? { kind: 'everyone' });
  const [names, setNames] = useState<Record<string, string>>({});
  const [reach, setReach] = useState<number | null>(null);
  const [link, setLink] = useState<string | null>(quick?.link ?? null);
  const [picking, setPicking] = useState(false);
  const [later, setLater] = useState(false);
  const [sendOn, setSendOn] = useState(plus(today, 1));
  const [sendTime, setSendTime] = useState('07:30');
  const [splash, setSplash] = useState(!!quick?.splash);
  const [design, setDesign] = useState<'template' | 'image'>('template');
  const [template, setTemplate] = useState<Template>(quick?.splash?.template ?? 'navy');
  const [headline, setHeadline] = useState(quick?.splash?.headline ?? '');
  const [words, setWords] = useState(quick?.splash?.text ?? '');
  const [button, setButton] = useState(quick?.splash?.button ?? '');
  const [photo, setPhoto] = useState<Picture>(null);
  const [image, setImage] = useState<SplashUpload | null>(null);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(plus(today, 6));
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const problem = audienceProblem(audience);
  useEffect(() => {
    if (problem) { setReach(null); return; }
    let on = true;
    const t = setTimeout(() => announcementReach(audience).then((n) => on && setReach(n)).catch(() => on && setReach(null)), 350);
    return () => { on = false; clearTimeout(t); };
  }, [audience, problem]);

  const linkLabel = (path: string) => (path === '/royal-news' ? SCHOOL.newsName : DESTINATIONS.find((d) => d.path === path)?.label ?? path);
  const linkIcon = DESTINATIONS.find((d) => d.path === link)?.icon ?? 'document-text';
  const usesTemplate = splash && design === 'template';
  const missing = !title.trim() ? 'Give it a title.'
    : !push && !splash ? 'Pick where it shows: a notification, a splash page, or both.'
    : push && !body.trim() ? 'Write the message.'
    : problem ? problem
    : splash && design === 'image' && !image ? 'Choose the picture, GIF or video.'
    : usesTemplate && !headline.trim() ? 'Give the splash page a headline.'
    : splash && endsOn < startsOn ? 'The splash page\'s last day comes after its first.'
    : blanksLeft(title, push ? body : '', usesTemplate ? `${headline} ${words}` : '', splash && link ? button : '') ? 'Fill in the parts in [brackets].'
    : null;
  const day = dayWord(sendOn, today);
  const when = later ? `${day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day} at ${twelve(sendTime)}` : null;

  const send = () => {
    if (missing) { tell(missing); return; }
    const count = reach == null ? 'the people it\'s for' : `${reach} ${reach === 1 ? 'person' : 'people'}`;
    const what = [push && 'a notification', splash && 'a splash page'].filter(Boolean).join(' and ');
    ask(later ? 'Schedule this announcement?' : 'Send this announcement?', `${what[0].toUpperCase()}${what.slice(1)} to ${count}${urgent && push ? ', even in their quiet hours' : ''}.`,
      later ? 'Schedule' : 'Send', async () => {
        setBusy(true);
        try {
          const img = splash && design === 'image' && image ? await uploadAnnouncementMedia(image) : null;
          const pic = usesTemplate && photo ? await uploadAnnouncementPicture(photo.base64) : null;
          await sendAnnouncement({
            title: title.trim(), body: body.trim(), audience, audienceLabel: audienceLabel(audience, names), urgent: push && urgent,
            link, push, sendOn: later ? sendOn : null, sendTime: later ? sendTime : null,
            splash: splash ? { image: img, template: img ? null : template, photo: pic, headline: headline.trim(), text: words.trim(),
              button: link ? button.trim() : '', startsOn, endsOn } : null,
          });
          router.replace('/announcements');
        } catch (e) { oops(e); } finally { setBusy(false); }
      });
  };

  const shown = { title, link, splashButton: link ? button : '', splashHeadline: headline, splashText: words, splashTemplate: design === 'image' ? null : template,
    splashImageUrl: design === 'image' ? image?.uri ?? '' : '', splashPhotoUrl: design === 'template' ? photo?.uri ?? '' : '' };
  const thumb = { template: design === 'image' ? null : template, headline: headline || title, imageUrl: design === 'image' ? image?.uri : undefined,
    photoUrl: design === 'template' ? photo?.uri : undefined, media: design === 'image' ? image?.media : undefined };
  let step = 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={s.screen} keyboardShouldPersistTaps="handled">
        {/* What they'll see, changing as they type. */}
        <View style={{ backgroundColor: NAVY }}>
          <View style={[s.pad, { paddingBottom: 20 }]}>
            <Text style={{ color: GOLD_LIGHT, fontWeight: '800', fontSize: 12, letterSpacing: 1 }}>WHAT THEY’LL SEE</Text>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
              {push && (
                <View style={{ flex: 1, gap: 6 }}>
                  <NotificationPreview title={title} body={body} />
                  {urgent && <Text style={{ color: '#FFB4AB', fontWeight: '700', fontSize: 12 }}>Urgent: it rings even in quiet hours.</Text>}
                </View>
              )}
              {splash && (
                <View style={{ alignItems: 'center', gap: 5, flex: push ? undefined : 1 }}>
                  <SplashThumb s={thumb} width={push ? 72 : 108} onPress={() => setPreview(true)} label="See the splash page full screen" />
                  <Text style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: 11, fontWeight: '700' }}>Tap to see it big</Text>
                </View>
              )}
              {!push && !splash && <Text style={{ flex: 1, color: 'rgba(255, 255, 255, 0.8)' }}>Pick where it shows below to see it here.</Text>}
            </View>
          </View>
        </View>

        <View style={s.pad}>
          <Step n={++step} title="Message">
            <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} placeholder="Early dismissal Wednesday" hint={`${title.length} of 80`} />
            <Field label={push ? 'Message' : 'Message (optional)'} value={body} onChangeText={setBody} maxLength={1000} multiline
              placeholder="School lets out at 12:00 for teacher meetings." style={{ minHeight: 90, textAlignVertical: 'top' }}
              hint={`${body.length} of 1,000`} />
            {quick && <Text style={{ color: AMBER, fontWeight: '600' }}>Started from {quick.label}: fill in the parts in [brackets].</Text>}
          </Step>

          <Step n={++step} title="Where it shows">
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ShowTile icon="notifications" label="Notification" sub="On phones and the bell page" on={push} onPress={() => setPush((x) => !x)} />
              <ShowTile icon="phone-portrait" label="Splash page" sub="Full screen, once, when they open the app" on={splash} onPress={() => setSplash((x) => !x)} />
            </View>
            {push && (
              <View style={[s.row, { gap: 10, padding: 10, borderRadius: 12, borderWidth: 1,
                borderColor: urgent ? C.danger : C.line, backgroundColor: urgent ? `${C.danger}0D` : C.card }]}>
                <Ionicons name={urgent ? 'alert-circle' : 'alert-circle-outline'} size={22} color={C.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: urgent ? C.danger : C.ink }}>Urgent</Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>Reaches phones even in quiet hours or with school notifications off. Save it for what can’t wait.</Text>
                </View>
                <Switch value={urgent} onValueChange={setUrgent} accessibilityLabel="Urgent" trackColor={{ true: C.danger }} />
              </View>
            )}
          </Step>

          {splash && (
            <Step n={++step} title="Splash page">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Use a template" on={design === 'template'} onPress={() => setDesign('template')} />
                <Chip label="Upload a graphic" on={design === 'image'} onPress={() => setDesign('image')} />
              </View>
              {design === 'image' ? (
                <>
                  <P muted>
                    {`A finished picture (like one made in Canva), an animated GIF, or a short .mp4 video, which plays silently on a loop with a sound button. A tall one (9 by 16) fills a phone best. Up to ${SPLASH_MAX_MB} MB.`}
                  </P>
                  {image && (
                    <Text style={{ color: C.muted, fontWeight: '700' }}>
                      {image.media === 'video' ? 'Video chosen' : image.media === 'gif' ? 'GIF chosen' : 'Picture chosen'}: tap the preview at the top to see it.
                    </Text>
                  )}
                  <Button label={image ? 'Choose another' : 'Choose a picture, GIF or video'} kind="ghost"
                    onPress={() => pickSplashMedia().then((p) => p && setImage(p)).catch(oops)} />
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    {(Object.keys(TEMPLATES) as Template[]).map((k) => (
                      <View key={k} style={{ alignItems: 'center', gap: 4 }}>
                        <SplashThumb s={{ template: k, headline: headline || title, photoUrl: photo?.uri }} width={62} selected={template === k}
                          onPress={() => setTemplate(k)} label={`${TEMPLATES[k].label} template`} />
                        <Text style={{ fontSize: 12, fontWeight: template === k ? '800' : '600', color: template === k ? NAVY : C.muted }}>{TEMPLATES[k].label}</Text>
                      </View>
                    ))}
                  </View>
                  <Field label="Headline" value={headline} onChangeText={setHeadline} maxLength={60} placeholder="Spirit Week!" />
                  <Field label="Words (optional)" value={words} onChangeText={setWords} maxLength={300} multiline placeholder="Monday is Pajama Day."
                    style={{ minHeight: 70, textAlignVertical: 'top' }} />
                  <View style={[s.row, { gap: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Button label={photo ? 'Change the photo' : 'Add a photo (optional)'} kind="ghost"
                        onPress={() => pickSplashPicture().then((p) => p && setPhoto(p)).catch(oops)} />
                    </View>
                    {photo && <Text onPress={() => setPhoto(null)} accessibilityRole="button" style={{ color: C.danger, fontWeight: '700' }}>Remove</Text>}
                  </View>
                </>
              )}
              {link ? <Field label="Button (optional)" value={button} onChangeText={setButton} maxLength={30} placeholder={`Open ${linkLabel(link)}`}
                hint={`Opens ${linkLabel(link)}.`} />
                : <P muted>Pick a screen under “Tapping it opens” to give the splash page a button.</P>}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><DateField label="First day" value={startsOn} onChange={setStartsOn} min={today} /></View>
                <View style={{ flex: 1 }}><DateField label="Last day" value={endsOn} onChange={setEndsOn} min={startsOn} max={plus(startsOn, 60)} /></View>
              </View>
            </Step>
          )}

          <Step n={++step} title="Who it’s for" right={(
            <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: problem ? C.bg : `${GOLD_LIGHT}80` }}>
              <Text style={{ fontWeight: '800', fontSize: 13, color: problem ? C.muted : NAVY }}>
                {problem ? 'Pick who' : reach == null ? 'Counting…' : `${reach} ${reach === 1 ? 'person' : 'people'}`}
              </Text>
            </View>
          )}>
            <AudiencePicker value={audience} onChange={setAudience} onNames={setNames} />
            {!!problem && <Text style={{ color: C.muted }}>{problem}</Text>}
          </Step>

          <Step n={++step} title="Tapping it opens" onPress={() => setPicking(true)} right={(
            <View style={[s.row, { gap: 6, flexShrink: 1 }]}>
              <Ionicons name={linkIcon as React.ComponentProps<typeof Ionicons>['name']} size={16} color={NAVY} />
              <Text numberOfLines={1} style={{ color: NAVY, fontWeight: '700', flexShrink: 1 }}>{link ? linkLabel(link) : 'The announcement'}</Text>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </View>
          )} />

          <Step n={++step} title="When" right={(
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Chip label="Now" on={!later} onPress={() => setLater(false)} />
              <Chip label="Later" on={later} onPress={() => setLater(true)} />
            </View>
          )}>
            {later && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><DateField label="Day" value={sendOn} onChange={setSendOn} min={today} max={plus(today, 90)} /></View>
                <View style={{ flex: 1 }}><TimeField label="Time" value={sendTime} onChange={setSendTime} /></View>
              </View>
            )}
            {later && splash && <P muted>The splash page starts showing once it goes out, on its first day.</P>}
          </Step>
        </View>
      </ScrollView>

      {/* The Send bar: what goes to how many and when, or what's still missing. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 10,
        backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={missing ? 'information-circle-outline' : 'checkmark-circle'} size={18} color={missing ? AMBER : '#15803D'} />
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: missing ? AMBER : C.ink }}>
            {missing ?? sendSummary({ push, splash, urgent: push && urgent, reach, when })}
          </Text>
        </View>
        <Pressable onPress={busy ? undefined : send} accessibilityRole="button" accessibilityLabel={later ? 'Schedule it' : 'Send it'}
          style={({ pressed }) => [{ backgroundColor: NAVY, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22,
            opacity: busy ? 0.6 : missing ? 0.75 : 1 }, pressed && { transform: [{ scale: 0.97 }] }]}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>{busy ? 'Sending…' : later ? 'Schedule' : 'Send'}</Text>
        </Pressable>
      </View>

      <DestinationSheet visible={picking} value={link} label={linkLabel} onPick={setLink} onClose={() => setPicking(false)} />
      <Modal visible={preview} animationType="fade" onRequestClose={() => setPreview(false)} statusBarTranslucent>
        <SplashView a={shown} media={design === 'image' ? image?.media : undefined} preview onClose={() => setPreview(false)} onTap={() => setPreview(false)} />
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** One step of the composer: a gold number, its name, something on the right (a count, a choice) and what's in it. */
function Step({ n, title, right, onPress, children }: { n: number; title: string; right?: React.ReactNode; onPress?: () => void; children?: React.ReactNode }) {
  return (
    <Card onPress={onPress} style={{ gap: 12 }}>
      <View style={[s.row, { gap: 10 }]}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD_LIGHT, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '900', color: NAVY }}>{n}</Text>
        </View>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: C.ink }}>{title}</Text>
        {right}
      </View>
      {children}
    </Card>
  );
}

/** Notification or Splash page: a big tile that's on or off. */
function ShowTile({ icon, label, sub, on, onPress }: { icon: 'notifications' | 'phone-portrait'; label: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}
      style={({ pressed }) => [{ flex: 1, padding: 12, gap: 6, borderRadius: 14, borderWidth: on ? 2 : 1, borderColor: on ? NAVY : C.line,
        backgroundColor: on ? `${NAVY}0D` : C.card }, pressed && { opacity: 0.8 }]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? NAVY : C.bg }}>
          <Ionicons name={icon} size={20} color={on ? GOLD_LIGHT : C.muted} />
        </View>
        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={on ? NAVY : C.line} />
      </View>
      <Text style={{ fontWeight: '800', fontSize: 15, color: on ? NAVY : C.ink }}>{label}</Text>
      <Text style={{ color: C.muted, fontSize: 12 }}>{sub}</Text>
    </Pressable>
  );
}
