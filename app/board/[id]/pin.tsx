/**
 * Pin something to a board (its teacher or editors): `?kind=note` a note on colored paper, `?kind=photo` a photo of
 * student work (from the camera or the library, squared like a print) with a caption. It shows on the board's own
 * background before it goes up.
 */
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { boardView, pinBoardNote, pinBoardPhoto, type Board, type BoardItem } from '../../../src/api/connect';
import { BoardFrame, PinnedItem } from '../../../src/boards/Corkboard';
import { PAPERS, type Paper } from '../../../src/boards/decor';
import { pickSquarePhoto } from '../../../src/photos';
import { oops } from '../../../src/study/ui';
import { Button, C, Card, Field, Loading, P, s } from '../../../src/ui';

export default function PinScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const photo = kind === 'photo';
  const [board, setBoard] = useState<Board | null | undefined>(undefined);
  const [body, setBody] = useState('');
  const [color, setColor] = useState<Paper>('yellow');
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();
  useEffect(() => { boardView(id).then(setBoard).catch((e) => { oops(e); setBoard(null); }); }, [id]);

  const header = <Stack.Screen options={{ title: photo ? 'Pin student work' : 'Pin a note' }} />;
  if (board === undefined) return <>{header}<Loading /></>;
  if (!board?.editor) return <View style={[s.screen, s.pad]}>{header}<Card><P muted>Only the board's teacher or its editors pin things to it.</P></Card></View>;

  const pick = (camera: boolean) => pickSquarePhoto(camera, 1080).then((b64) => { if (b64) setPicked(b64); }).catch(oops);
  const preview: BoardItem = {
    id: 'preview', boardId: board.id, kind: photo ? 'photo' : 'note', body: body.trim() || (photo ? '' : 'Your note'), color: photo ? 'white' : color,
    image: null, photo: picked ? `data:image/jpeg;base64,${picked}` : '', position: 0, createdAt: '',
  };
  const ready = photo ? !!picked : !!body.trim();
  const pin = () => {
    setBusy(true);
    (photo ? pinBoardPhoto(board.id, picked!, body) : pinBoardNote(board.id, body, color))
      .then(() => router.back()).catch(oops).finally(() => setBusy(false));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {header}
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <BoardFrame background={board.background} border={board.border} minHeight={200}>
          <View style={{ alignItems: 'center', paddingVertical: 6 }}>
            <PinnedItem item={preview} width={Math.min(width - 140, 260)} />
          </View>
        </BoardFrame>

        {photo ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PickButton icon="images" label={picked ? 'Another photo' : 'Choose a photo'} onPress={() => pick(false)} />
              {Platform.OS !== 'web' && <PickButton icon="camera" label="Take a photo" onPress={() => pick(true)} />}
            </View>
            <Field label="Caption (optional)" value={body} onChangeText={setBody} maxLength={300} placeholder="Our leaf drawings" />
            <P muted>Families of the class see it. Leave out students' last names.</P>
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <Field label="Note" value={body} onChangeText={setBody} maxLength={300} multiline placeholder="Spelling test Friday!"
              style={{ minHeight: 90, textAlignVertical: 'top' }} autoFocus />
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Paper</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(Object.keys(PAPERS) as Paper[]).map((p) => (
                <Pressable key={p} onPress={() => setColor(p)} accessibilityRole="radio" accessibilityState={{ checked: color === p }} accessibilityLabel={`${p} paper`}
                  style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: PAPERS[p], borderWidth: color === p ? 3 : 1,
                    borderColor: color === p ? C.primary : C.line, alignItems: 'center', justifyContent: 'center' }}>
                  {color === p && <Ionicons name="checkmark" size={20} color={C.primary} />}
                </Pressable>
              ))}
            </View>
          </Card>
        )}
        <Button label={busy ? 'Pinning…' : 'Pin it to the board'} disabled={busy || !ready} onPress={pin} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PickButton({ icon, label, onPress }: { icon: 'images' | 'camera'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12,
        borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={18} color={C.primary} />
      <Text style={{ color: C.primary, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}
