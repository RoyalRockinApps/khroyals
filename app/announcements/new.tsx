/**
 * Write an announcement (people with Send notifications, behind the authenticator code): what it says; where it shows (a
 * push and bell notification, a splash page when people open the app, or both); who it's for, with how many people that
 * reaches; which screen tapping it opens; and when (now, or a day and time). A splash page is a finished graphic to
 * upload or a template (background, optional photo, headline, words), with a button and the days it shows; Preview shows
 * it full screen as people will see it.
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { announcementReach, live, sendAnnouncement, uploadAnnouncementPicture, type Audience } from '../../src/api/connect';
import { AudiencePicker, Chip } from '../../src/announcements/AudiencePicker';
import { DESTINATIONS, TEMPLATES, audienceLabel, audienceProblem, type Template } from '../../src/announcements/kinds';
import { SplashView } from '../../src/announcements/Splash';
import { schoolToday } from '../../src/calendar/past';
import { MfaGate } from '../../src/comms/MfaGate';
import { DateField, TimeField } from '../../src/forms/DateTimeField';
import { pickSplashPicture } from '../../src/photos';
import { SCHOOL } from '../../src/school';
import { GOLD, NAVY } from '../../src/sports/ui';
import { oops } from '../../src/study/ui';
import { Button, C, Card, Field, H, P, ask, s } from '../../src/ui';

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
type Picture = { base64: string; uri: string } | null;

function Composer() {
  const today = schoolToday();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [push, setPush] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [audience, setAudience] = useState<Audience>({ kind: 'everyone' });
  const [names, setNames] = useState<Record<string, string>>({});
  const [reach, setReach] = useState<number | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [later, setLater] = useState(false);
  const [sendOn, setSendOn] = useState(plus(today, 1));
  const [sendTime, setSendTime] = useState('07:30');
  const [splash, setSplash] = useState(false);
  const [design, setDesign] = useState<'template' | 'image'>('template');
  const [template, setTemplate] = useState<Template>('navy');
  const [headline, setHeadline] = useState('');
  const [words, setWords] = useState('');
  const [button, setButton] = useState('');
  const [photo, setPhoto] = useState<Picture>(null);
  const [image, setImage] = useState<Picture>(null);
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
  const missing = !title.trim() ? 'Give it a title.'
    : !push && !splash ? 'Send a notification, show a splash page, or both.'
    : push && !body.trim() ? 'Write the message.'
    : problem ? problem
    : splash && design === 'image' && !image ? 'Choose the graphic.'
    : splash && design === 'template' && !headline.trim() ? 'Give the splash page a headline.'
    : splash && endsOn < startsOn ? 'The splash page\'s last day comes after its first.'
    : null;

  const send = () => {
    if (missing) return;
    const count = reach == null ? 'the people it\'s for' : `${reach} ${reach === 1 ? 'person' : 'people'}`;
    const what = [push && 'a notification', splash && 'a splash page'].filter(Boolean).join(' and ');
    ask(later ? 'Schedule this announcement?' : 'Send this announcement?', `${what[0].toUpperCase()}${what.slice(1)} to ${count}${urgent && push ? ', even in their quiet hours' : ''}.`,
      later ? 'Schedule' : 'Send', async () => {
        setBusy(true);
        try {
          const img = splash && design === 'image' && image ? await uploadAnnouncementPicture(image.base64) : null;
          const pic = splash && design === 'template' && photo ? await uploadAnnouncementPicture(photo.base64) : null;
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 12 }}>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} placeholder="Early dismissal Wednesday" />
          <Field label={push ? 'Message' : 'Message (optional)'} value={body} onChangeText={setBody} maxLength={1000} multiline
            placeholder="School lets out at 12:00 for teacher meetings." style={{ minHeight: 90, textAlignVertical: 'top' }} />
        </Card>

        <Card style={{ gap: 12 }}>
          <H>Where it shows</H>
          <Toggle icon="notifications" label="Push and bell notification" sub="On their phones and on the bell page." value={push} onChange={setPush} />
          {push && (
            <Toggle icon="alert-circle" label="Urgent" sub="Reaches phones even in quiet hours or with school notifications off. Save it for things that can't wait."
              value={urgent} onChange={setUrgent} danger />
          )}
          <Toggle icon="phone-portrait" label="Splash page" sub="A full-screen page they see once when they open the app, then close to carry on." value={splash} onChange={setSplash} />
        </Card>

        <Card style={{ gap: 10 }}>
          <H>Who it's for</H>
          <AudiencePicker value={audience} onChange={setAudience} onNames={setNames} />
          <View style={[s.row, { gap: 8, marginTop: 4 }]}>
            <Ionicons name="people" size={18} color={problem ? C.muted : NAVY} />
            <Text style={{ fontWeight: '800', color: problem ? C.muted : NAVY }}>
              {problem ?? (reach == null ? 'Counting…' : `Reaches ${reach} ${reach === 1 ? 'person' : 'people'}`)}
            </Text>
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <H>Tapping it opens</H>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="The announcement" on={link === null} onPress={() => setLink(null)} />
            {DESTINATIONS.map((d) => <Chip key={d.path} label={linkLabel(d.path)} on={link === d.path} onPress={() => setLink(d.path)} />)}
          </View>
        </Card>

        {splash && (
          <Card style={{ gap: 12 }}>
            <H>Splash page</H>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Use a template" on={design === 'template'} onPress={() => setDesign('template')} />
              <Chip label="Upload a graphic" on={design === 'image'} onPress={() => setDesign('image')} />
            </View>
            {design === 'image' ? (
              <>
                <P muted>A finished picture, like one made in Canva. A tall one (9 by 16) fills a phone best.</P>
                <Button label={image ? 'Choose another graphic' : 'Choose the graphic'} kind="ghost"
                  onPress={() => pickSplashPicture().then((p) => p && setImage(p)).catch(oops)} />
                {image && <Text style={{ color: C.muted }}>Graphic chosen. Preview it below.</Text>}
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {(Object.keys(TEMPLATES) as Template[]).map((k) => (
                    <Pressable key={k} onPress={() => setTemplate(k)} accessibilityRole="radio" accessibilityState={{ checked: template === k }}
                      accessibilityLabel={TEMPLATES[k].label} style={{ alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 54, height: 80, borderRadius: 10, backgroundColor: TEMPLATES[k].background, borderWidth: template === k ? 3 : 1,
                        borderColor: template === k ? C.primary : C.line, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 26, height: 4, borderRadius: 2, backgroundColor: TEMPLATES[k].accent }} />
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: template === k ? '800' : '600', color: C.ink }}>{TEMPLATES[k].label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Field label="Headline" value={headline} onChangeText={setHeadline} maxLength={60} placeholder="Spirit Week!" />
                <Field label="Words (optional)" value={words} onChangeText={setWords} maxLength={300} multiline placeholder="Monday is Pajama Day."
                  style={{ minHeight: 70, textAlignVertical: 'top' }} />
                <Button label={photo ? 'Change the photo' : 'Add a photo (optional)'} kind="ghost"
                  onPress={() => pickSplashPicture().then((p) => p && setPhoto(p)).catch(oops)} />
                {photo && <Text onPress={() => setPhoto(null)} accessibilityRole="button" style={{ color: C.danger, fontWeight: '700' }}>Take the photo off</Text>}
              </>
            )}
            {link ? <Field label="Button (optional)" value={button} onChangeText={setButton} maxLength={30} placeholder={`Open ${linkLabel(link)}`}
              hint={`Opens ${linkLabel(link)}.`} />
              : <P muted>Pick what tapping it opens (above) to give the splash page a button.</P>}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><DateField label="First day" value={startsOn} onChange={setStartsOn} min={today} /></View>
              <View style={{ flex: 1 }}><DateField label="Last day" value={endsOn} onChange={setEndsOn} min={startsOn} max={plus(startsOn, 60)} /></View>
            </View>
            <Button label="Preview the splash page" kind="ghost" onPress={() => setPreview(true)}
              disabled={design === 'image' ? !image : !headline.trim()} />
          </Card>
        )}

        <Card style={{ gap: 10 }}>
          <H>When</H>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Now" on={!later} onPress={() => setLater(false)} />
            <Chip label="Later" on={later} onPress={() => setLater(true)} />
          </View>
          {later && (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><DateField label="Day" value={sendOn} onChange={setSendOn} min={today} max={plus(today, 90)} /></View>
              <View style={{ flex: 1 }}><TimeField label="Time" value={sendTime} onChange={setSendTime} /></View>
            </View>
          )}
          {later && splash && <P muted>The splash page starts showing once it goes out, on its first day.</P>}
        </Card>

        {missing && <Text style={{ color: C.muted, textAlign: 'center' }}>{missing}</Text>}
        <Button label={busy ? 'Sending…' : later ? 'Schedule it' : 'Send it'} disabled={busy || !!missing} onPress={send} />
      </ScrollView>

      <Modal visible={preview} animationType="fade" onRequestClose={() => setPreview(false)} statusBarTranslucent>
        <SplashView a={shown} preview onClose={() => setPreview(false)} onTap={() => setPreview(false)} />
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Toggle({ icon, label, sub, value, onChange, danger }: {
  icon: 'notifications' | 'alert-circle' | 'phone-portrait'; label: string; sub: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean;
}) {
  const tint = danger ? C.danger : value ? NAVY : C.muted;
  return (
    <View style={[s.row, { gap: 12, alignItems: 'flex-start' }]}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: value ? (danger ? `${C.danger}18` : `${GOLD}33`) : C.bg,
        alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '800', color: C.ink, fontSize: 15 }}>{label}</Text>
        <Text style={{ color: C.muted, fontSize: 13 }}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}
