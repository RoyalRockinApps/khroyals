/**
 * An activity's photos (the Photos tab): this school year's album from the photo gallery ("Volleyball 2026–27"), its
 * newest pictures in a grid, and earlier years' albums below. Its coaches or directors start the year's album; then
 * everyone who sees it adds photos, as in every album (it opens in the Photos app).
 */
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { getAlbum, listAlbums, makeSportAlbum, type GalleryAlbum, type GalleryPhoto } from '../../api/connect';
import { AlbumCard } from '../../gallery/AlbumCard';
import { schoolYearLabel, schoolYearOf } from '../../gallery/years';
import { Button, C, Card, Loading, P, s } from '../../ui';
import { schoolToday } from '../seasons';
import { fail } from './parts';

const SHOWN = 12;

export function TeamPhotos({ sportId, name, leader, leaders }: { sportId: string; name: string; leader: boolean; leaders: string }) {
  const [albums, setAlbums] = useState<GalleryAlbum[] | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const year = schoolYearOf(schoolToday());
  const load = useCallback(async () => {
    const list = await listAlbums({ sport: sportId }).catch(() => []);
    const now = list.find((a) => a.schoolYear === year);
    setPhotos(now ? (await getAlbum(now.id).catch(() => null))?.photos ?? [] : []);
    setAlbums(list);
  }, [sportId, year]);
  useEffect(() => { load(); }, [load]);

  if (!albums) return <Loading />;
  const current = albums.find((a) => a.schoolYear === year);
  const earlier = albums.filter((a) => a !== current);
  const start = () => {
    setBusy(true);
    makeSportAlbum(sportId).then((id) => router.push(`/photos/${id}`)).catch(fail).finally(() => setBusy(false));
  };
  const newest = [...photos].reverse().slice(0, SHOWN);

  return (
    <View style={{ gap: 12 }}>
      {current ? (
        <Card style={{ gap: 10 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{current.title}</Text>
              <P muted>{photos.length === 1 ? '1 photo' : `${photos.length} photos`}</P>
            </View>
            {photos.length > SHOWN && (
              <Text style={{ color: C.primary, fontWeight: '700' }} onPress={() => router.push(`/photos/${current.id}`)} accessibilityRole="button">See all</Text>
            )}
          </View>
          {newest.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 }}>
              {newest.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/photos/${current.id}`)} accessibilityRole="imagebutton"
                  accessibilityLabel={p.caption || 'Photo'} style={{ width: '33.333%', aspectRatio: 1, padding: 2 }}>
                  <Image source={{ uri: p.thumb }} style={{ flex: 1, borderRadius: 8, backgroundColor: C.line }} />
                </Pressable>
              ))}
            </View>
          ) : <P muted>No photos yet. Be the first to add some from a game or practice.</P>}
          <Button label="+ Add photos" onPress={() => router.push({ pathname: '/photos/[id]', params: { id: current.id, add: '1' } })} />
        </Card>
      ) : leader ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink }}>{`${name} ${schoolYearLabel(year)}`}</Text>
          <P muted>Start this year's photo album. Everyone at school can see it, and families add their own pictures too.</P>
          <Button label={busy ? 'Starting…' : 'Start the photo album'} disabled={busy} onPress={start} />
        </Card>
      ) : (
        <Card><P muted>{`No photo album yet this year. Once the ${leaders} start it, everyone can add pictures.`}</P></Card>
      )}

      {earlier.length > 0 && (
        <>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted, letterSpacing: 0.5 }}>EARLIER YEARS</Text>
          {earlier.map((a) => <AlbumCard key={a.id} a={a} />)}
        </>
      )}
    </View>
  );
}
