/**
 * Decorate a board (its teacher or editors): the title and the name under it, the background, the border trim and the
 * photo album along its bottom, with a preview as it changes. Admins with Groups also choose who runs it (an
 * academy's leaders, a co-teacher).
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  boardEditors, boardView, decorateBoard, getUser, listAlbums, listUsers, myAccess, setBoardEditor, type Access, type Board, type GalleryAlbum, type Person,
} from '../../../src/api/connect';
import { BoardFrame, BoardHeading } from '../../../src/boards/Corkboard';
import { BACKGROUNDS, BORDERS, boardHeading, type Background, type Border } from '../../../src/boards/decor';
import { VerifyCard } from '../../../src/comms/MfaGate';
import { mayHave, needsCodeFor } from '../../../src/comms/mfa';
import { oops } from '../../../src/study/ui';
import { Button, C, Card, Field, H, Loading, P, s } from '../../../src/ui';

export default function Decorate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [byline, setByline] = useState('');
  const [background, setBackground] = useState<string>('cork');
  const [border, setBorder] = useState<string>('scallop-red');
  const [album, setAlbum] = useState<string | null>(null);
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [access, setAccess] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    boardView(id).then((b) => {
      setBoard(b);
      if (!b) return;
      setTitle(b.title); setByline(b.byline); setBackground(b.background); setBorder(b.border); setAlbum(b.linkedAlbumId);
    }).catch((e) => { oops(e); setBoard(null); });
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listAlbums({ limit: 80 }).then(setAlbums).catch(() => {});
    myAccess().then(setAccess).catch(() => {});
  }, []);

  const header = <Stack.Screen options={{ title: 'Decorate the board' }} />;
  if (board === undefined) return <>{header}<Loading /></>;
  if (!board?.editor) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>Only the board's teacher or its editors decorate it.</P></Card></View>;

  const auto = boardHeading({ ...board, title: '', byline: '' });
  const shown = boardHeading({ ...board, title, byline });
  const save = () => {
    setBusy(true);
    decorateBoard(board.id, { title, byline, background, border, albumId: album }).then(() => router.back()).catch(oops).finally(() => setBusy(false));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      {header}
      <BoardFrame background={background} border={border} minHeight={150}>
        <BoardHeading title={shown.title} byline={shown.byline} background={background} />
      </BoardFrame>

      <Card style={{ gap: 12 }}>
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={60} placeholder={auto.title} hint="Leave it blank to use the class's grade or name." />
        <Field label="Under the title" value={byline} onChangeText={setByline} maxLength={60} placeholder={auto.byline}
          hint={board.kind === 'teacher' ? 'How families know you, like “Mrs. Smith”.' : undefined} />
      </Card>

      <Card style={{ gap: 10 }}>
        <H>Background</H>
        <Swatches options={Object.entries(BACKGROUNDS).map(([key, v]) => ({ key, label: v.label, color: v.color }))} value={background} onChange={setBackground} />
        <H>Border</H>
        <Swatches options={Object.entries(BORDERS).map(([key, v]) => ({ key, label: v.label, color: v.colors[0] ?? C.card, stripes: v.colors }))}
          value={border} onChange={setBorder} />
      </Card>

      <Card style={{ gap: 8 }}>
        <H>Class photos</H>
        <P muted>The newest photos from this album run along the bottom of the board.</P>
        <AlbumRow on={album === null} label={board.kind === 'teacher' ? 'The class\'s grade album (when they\'re all in one grade)' : 'None'} onPress={() => setAlbum(null)} />
        {albums.filter((a) => a.grade == null || a.schoolYear === Math.max(...albums.map((x) => x.schoolYear))).slice(0, 40).map((a) => (
          <AlbumRow key={a.id} on={album === a.id} label={a.title} onPress={() => setAlbum(a.id)} />
        ))}
        {albums.length === 0 && <P muted>Albums you can see in Photos show up here.</P>}
      </Card>

      <Button label={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={save} />

      {mayHave(access, 'groups.manage') && (needsCodeFor(access, 'groups.manage')
        ? <VerifyCard why="Choosing who runs a board is an admin tool." onVerified={() => myAccess().then(setAccess).catch(() => {})} />
        : <Runners boardId={board.id} teacherId={board.teacherId} />)}
    </ScrollView>
  );
}

function Swatches({ options, value, onChange }: { options: { key: string; label: string; color: string; stripes?: readonly string[] }[]; value: string; onChange: (k: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label}
            style={{ width: 92, gap: 4, alignItems: 'center' }}>
            <View style={{ width: 64, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: o.color, borderWidth: on ? 3 : 1,
              borderColor: on ? C.primary : C.line, flexDirection: 'row' }}>
              {o.stripes && o.stripes.length > 1 && o.stripes.map((c) => <View key={c} style={{ flex: 1, backgroundColor: c }} />)}
              {o.stripes && o.stripes.length === 0 && <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={20} color={C.muted} /></View>}
            </View>
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: on ? C.primary : C.ink }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AlbumRow({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[s.row, { gap: 10, paddingVertical: 5 }]}>
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.primary : C.muted} />
      <Text style={{ flex: 1, color: C.ink, fontWeight: on ? '800' : '500' }}>{label}</Text>
    </Pressable>
  );
}

/** Staff put in charge of the board (admins with Groups choose them). */
function Runners({ boardId, teacherId }: { boardId: string; teacherId: string | null }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const [staff, setStaff] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const load = useCallback(() => { boardEditors(boardId).then(setIds).catch(() => setIds([])); }, [boardId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { listUsers().then((ps) => setStaff(ps.filter((p) => ['admin', 'teacher', 'staff'].includes(p.schoolRole)))).catch(() => {}); }, []);
  if (!ids) return <Loading />;
  const set = (uid: string, on: boolean) => { setQ(''); setBoardEditor(boardId, uid, on).then(load).catch(oops); };
  const name = (uid: string) => { const p = getUser(uid); return p ? `${p.firstName} ${p.lastName}` : 'Someone'; };
  const matches = q.trim().length < 2 ? [] : staff.filter((p) => !ids.includes(p.id) && p.id !== teacherId
    && `${p.firstName} ${p.lastName}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5);
  return (
    <Card style={{ gap: 8 }}>
      <H>Who runs this board</H>
      <P muted>{teacherId ? 'Its teacher, and anyone you add (a co-teacher or an aide).' : 'The staff you add here pin, announce and decorate it.'}</P>
      {ids.map((uid) => (
        <View key={uid} style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: C.ink, fontWeight: '600' }}>{name(uid)}</Text>
          <Text style={{ color: C.danger, fontWeight: '700' }} onPress={() => set(uid, false)} accessibilityRole="button">Remove</Text>
        </View>
      ))}
      <TextInput style={s.input} placeholder="Add someone: search faculty and staff" value={q} onChangeText={setQ} accessibilityLabel="Search faculty and staff" />
      {matches.map((p) => (
        <Text key={p.id} style={{ color: C.primary, fontWeight: '700', paddingVertical: 4 }} onPress={() => set(p.id, true)} accessibilityRole="button">
          + {p.firstName} {p.lastName}
        </Text>
      ))}
    </Card>
  );
}
