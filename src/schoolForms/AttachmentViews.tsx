/**
 * A bulletin's or note's pictures, PDFs and links: in full on the note's screen (`AttachmentList`: the pictures, then a
 * row for each PDF and link) and on its paper in the Folder (`PaperAttachments`: the first picture and a line for the
 * rest). Tapping a picture opens it full screen (`ImageViewer`, pinch to zoom on iPhone, arrows between pictures);
 * tapping a PDF or a link opens it in the in-app browser. The files come by one-hour links (folderFileUrls).
 */
import { useEffect, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { errorText, folderFileUrls, type FolderAttachment } from '../api/connect';
import { C, s } from '../ui';
import { attachmentLine, linkName, splitAttachments } from './attachments';

/** One-hour links to the pictures and PDFs, by path. */
export function useFileUrls(list: FolderAttachment[]): Record<string, string> {
  // The paths, not the list's identity, decide when to fetch again.
  const key = list.map((a) => a.path).filter(Boolean).join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let on = true;
    folderFileUrls(key ? key.split('|') : []).then((u) => on && setUrls(u)).catch(() => {});
    return () => { on = false; };
  }, [key]);
  return urls;
}

export const openLink = (url: string) => WebBrowser.openBrowserAsync(url).catch((e) => Alert.alert('Couldn’t open it', errorText(e)));

/** A picture's link: an uploaded one by its path, or (demo builds) the address itself. */
const srcOf = (a: FolderAttachment, urls: Record<string, string>) => (a.path ? urls[a.path] : null);

export function AttachmentList({ attachments }: { attachments: FolderAttachment[] }) {
  const urls = useFileUrls(attachments);
  const [open, setOpen] = useState<number | null>(null);
  const { pictures, others } = splitAttachments(attachments);
  const { width } = useWindowDimensions();
  // The space it's given (a card's inside), measured; the window until then.
  const [box, setBox] = useState(0);
  if (!attachments.length) return null;
  const side = Math.min(box || width - 64, 560);
  return (
    <View style={{ gap: 10 }} onLayout={(e) => setBox(Math.floor(e.nativeEvent.layout.width))}>
      {pictures.length === 1 ? (
        <Picture a={pictures[0]} uri={srcOf(pictures[0], urls)} width={side} onPress={() => setOpen(0)} />
      ) : pictures.length > 1 && (
        <View style={[s.row, { flexWrap: 'wrap', gap: 8 }]}>
          {pictures.map((p, i) => <Picture key={p.id} a={p} uri={srcOf(p, urls)} width={(side - 8) / 2} square onPress={() => setOpen(i)} />)}
        </View>
      )}
      {others.map((a) => (
        <Pressable key={a.id} onPress={() => { const u = a.kind === 'link' ? a.url : srcOf(a, urls); if (u) openLink(u); }}
          accessibilityRole="link" accessibilityLabel={`${a.kind === 'pdf' ? 'Open the PDF' : 'Open the link'}: ${a.name}`}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, borderWidth: 1,
            borderColor: C.line, padding: 12 }, pressed && { opacity: 0.8 }]}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: a.kind === 'pdf' ? '#FEE4E2' : `${C.primary}14`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={a.kind === 'pdf' ? 'document-text' : 'link'} size={22} color={a.kind === 'pdf' ? '#B42318' : C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', color: C.ink }} numberOfLines={2}>{a.name}</Text>
            <Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{a.kind === 'pdf' ? 'PDF · tap to open' : linkName(a.url ?? '')}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={C.muted} />
        </Pressable>
      ))}
      <ImageViewer pictures={pictures} urls={urls} index={open} onIndex={setOpen} />
    </View>
  );
}

function Picture({ a, uri, width, square, onPress }: { a: FolderAttachment; uri: string | null | undefined; width: number; square?: boolean; onPress: () => void }) {
  const ratio = a.width && a.height ? a.height / a.width : 0.75;
  const height = square ? width : Math.min(width * ratio, 520);
  return (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={`${a.name}. Open full screen`}
      style={({ pressed }) => [{ width, height, borderRadius: 14, overflow: 'hidden', backgroundColor: C.line }, pressed && { opacity: 0.85 }]}>
      {!!uri && <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode={square ? 'cover' : 'contain'} />}
    </Pressable>
  );
}

/** The first picture and a line for the rest, on a paper in the Folder (the picture opens full screen). */
export function PaperAttachments({ attachments, height = 120 }: { attachments: FolderAttachment[]; height?: number }) {
  const urls = useFileUrls(attachments);
  const [open, setOpen] = useState<number | null>(null);
  const { pictures } = splitAttachments(attachments);
  if (!attachments.length) return null;
  const first = pictures[0];
  const uri = first ? srcOf(first, urls) : null;
  return (
    <View style={{ gap: 6 }}>
      {first && (
        <Pressable onPress={() => setOpen(0)} accessibilityRole="imagebutton" accessibilityLabel={`${first.name}. Open full screen`}
          style={({ pressed }) => [{ height, borderRadius: 8, overflow: 'hidden', backgroundColor: C.line }, pressed && { opacity: 0.85 }]}>
          {/* Full width from the top, so a flyer shows its heading; a wide picture fills the box. */}
          {!!uri && <Image source={{ uri }} resizeMode="cover"
            style={first.width && first.height ? { width: '100%', aspectRatio: first.width / first.height, minHeight: '100%' } : { width: '100%', height: '100%' }} />}
          {pictures.length > 1 && (
            <View style={{ position: 'absolute', right: 6, bottom: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#000a' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>+{pictures.length - 1}</Text>
            </View>
          )}
        </Pressable>
      )}
      <View style={[s.row, { gap: 6 }]}>
        <Ionicons name="attach" size={16} color={C.muted} />
        <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13, flex: 1 }} numberOfLines={1}>{attachmentLine(attachments)}</Text>
      </View>
      <ImageViewer pictures={pictures} urls={urls} index={open} onIndex={setOpen} />
    </View>
  );
}

/** Pictures full screen: pinch to zoom (iPhone), arrows between them, × to close. */
export function ImageViewer({ pictures, urls, index, onIndex }: {
  pictures: FolderAttachment[]; urls: Record<string, string>; index: number | null; onIndex: (i: number | null) => void;
}) {
  const shown = index === null ? null : pictures[index];
  const uri = shown ? srcOf(shown, urls) : null;
  return (
    <Modal visible={!!shown} animationType="fade" onRequestClose={() => onIndex(null)} supportedOrientations={['portrait', 'landscape']}>
      {shown && (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={[s.row, { justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 16, paddingBottom: 8 }]}>
            <Text style={{ color: '#fff', fontWeight: '700', flex: 1 }} numberOfLines={1}>
              {pictures.length > 1 ? `${index! + 1} of ${pictures.length} · ` : ''}{shown.name}
            </Text>
            <Pressable onPress={() => onIndex(null)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12}>
              <Ionicons name="close" size={30} color="#fff" />
            </Pressable>
          </View>
          <ScrollView key={shown.id} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} maximumZoomScale={4} minimumZoomScale={1}
            centerContent bouncesZoom showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
            {!!uri && <Image source={{ uri }} style={{ flex: 1, minHeight: 300 }} resizeMode="contain" accessibilityLabel={shown.name} />}
          </ScrollView>
          {pictures.length > 1 && (
            <View style={[s.row, { justifyContent: 'space-between', padding: 16, paddingBottom: 34 }]}>
              <Pressable onPress={() => onIndex(Math.max(0, index! - 1))} disabled={index === 0} accessibilityRole="button" accessibilityLabel="Previous picture" hitSlop={12}>
                <Ionicons name="chevron-back-circle" size={44} color={index === 0 ? '#555' : '#fff'} />
              </Pressable>
              <Pressable onPress={() => onIndex(Math.min(pictures.length - 1, index! + 1))} disabled={index === pictures.length - 1}
                accessibilityRole="button" accessibilityLabel="Next picture" hitSlop={12}>
                <Ionicons name="chevron-forward-circle" size={44} color={index === pictures.length - 1 ? '#555' : '#fff'} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Modal>
  );
}
