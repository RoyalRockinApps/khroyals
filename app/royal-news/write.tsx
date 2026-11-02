/**
 * Write a newsletter issue in the app, or paste one (from the newsletter email or its web page):
 * blank lines separate items, a short first line is an item's title, a short line on its own a
 * section heading, and web addresses become links (src/news/compose.ts). The preview shows how it
 * will read. push.send holders; `?id=` changes an issue written here before.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { errorText, getNewsletter, isWritten, writeNewsletter } from '../../src/api/connect';
import { schoolToday } from '../../src/calendar/past';
import { DateField } from '../../src/forms/DateTimeField';
import { composeIssue, issueText } from '../../src/news/compose';
import { SCHOOL } from '../../src/school';
import { Button, C, Card, Field, H, Loading, P, s } from '../../src/ui';

const longDate = (iso: string) => new Date(`${iso}T12:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

export default function WriteIssue() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loaded, setLoaded] = useState(!id);
  const [title, setTitle] = useState(SCHOOL.newsName);
  const [sentOn, setSentOn] = useState(schoolToday());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    getNewsletter(id).then((n) => {
      if (n && isWritten(n)) { setTitle(n.title); setSentOn(n.sentOn); setText(issueText(n.blocks)); }
    }).catch((e) => Alert.alert('Not loaded', errorText(e))).finally(() => setLoaded(true));
  }, [id]);
  // The title and date often come along in a paste; they aren't repeated in the issue.
  const blocks = useMemo(() => composeIssue(text, [title, longDate(sentOn)]), [text, title, sentOn]);

  const header = <Stack.Screen options={{ title: id ? 'Change issue' : 'Write an issue' }} />;
  if (!loaded) return <>{header}<Loading /></>;
  const save = () => {
    setBusy(true);
    writeNewsletter({ id: id ?? null, title: title.trim(), sentOn, blocks })
      .then((nid) => router.replace(`/royal-news/${nid}`))
      .catch((e) => Alert.alert('Not saved', errorText(e)))
      .finally(() => setBusy(false));
  };
  const items = blocks.filter((b) => b.kind === 'text').length;
  const headings = blocks.filter((b) => b.kind === 'heading').map((b) => (b.kind === 'heading' ? b.text : ''));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <Card>
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
        <DateField label="Date" value={sentOn} onChange={setSentOn} />
        <Field label="The issue" value={text} onChangeText={setText} multiline placeholder="Type or paste the newsletter here"
          style={{ minHeight: 260, textAlignVertical: 'top' }} />
        <P muted>Leave a blank line between items. A short first line becomes the item’s title; a short line on its own,
          a section heading. Web addresses become links. Pasting the newsletter email or web page works.</P>
      </Card>
      <Card>
        <H>Preview</H>
        <P muted>{items} item{items === 1 ? '' : 's'}{headings.length ? `; sections: ${headings.join(', ')}` : ''}</P>
        {blocks.slice(0, 12).map((b, i) => (
          <View key={i} style={{ paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            {b.kind === 'heading' && <Text style={{ fontWeight: '900', color: C.accent }}>{b.text}</Text>}
            {b.kind === 'text' && (<>
              {!!b.title && <Text style={{ fontWeight: '800', color: C.ink }}>{b.title}</Text>}
              <Text style={{ color: C.muted }} numberOfLines={2}>{b.paragraphs.map((p) => p.map((x) => x.text).join('')).join(' ')}</Text>
            </>)}
          </View>
        ))}
      </Card>
      <Button label={busy ? 'Saving…' : id ? 'Save changes' : `Add to ${SCHOOL.newsName}`} onPress={save} disabled={busy || !title.trim() || !blocks.length} />
    </ScrollView>
  );
}
