/**
 * Picking a doctor's note on the phone for an absence report (app/forms/excused-absence.tsx): a photo of the paper
 * note (camera or library), sent as a JPEG at most 2000 px on its long side, or a PDF or picture file from the
 * clinic's portal. Null when cancelled. Up to 10 MB, like the storage bucket.
 */
import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as DeviceFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { DoctorNoteFile } from '../api/connect';
import { SCHOOL } from '../school';

export type NoteSource = 'camera' | 'photos' | 'file';
const MAX_BYTES = 10 * 1024 * 1024;
const LONG_SIDE = 2000;

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;

/** A picture as a JPEG no bigger than LONG_SIDE. */
async function asJpeg(uri: string, width: number, height: number): Promise<DoctorNoteFile | null> {
  const k = Math.min(1, LONG_SIDE / Math.max(width || LONG_SIDE, height || LONG_SIDE));
  const ctx = ImageManipulator.manipulate(uri);
  if (k < 1) ctx.resize({ width: Math.round(width * k), height: Math.round(height * k) });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? { mimeType: 'image/jpeg', body: bytes(out.base64) } : null;
}

export async function pickDoctorNote(source: NoteSource): Promise<DoctorNoteFile | null> {
  if (source === 'file') {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return null;
    if ((asset.size ?? 0) > MAX_BYTES) {
      Alert.alert('That file is too big', 'Pick a file under 10 MB, or take a photo of the note instead.');
      return null;
    }
    const pdf = asset.mimeType === 'application/pdf' || /\.pdf$/i.test(asset.name);
    if (!pdf) return asJpeg(asset.uri, 0, 0);
    const body = Platform.OS === 'web' && asset.file ? asset.file : await new DeviceFile(asset.uri).arrayBuffer();
    return { mimeType: 'application/pdf', body };
  }
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    Alert.alert('Camera is off', `Allow camera access for ${SCHOOL.appName} in Settings to take a photo of the note.`);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? asJpeg(asset.uri, asset.width, asset.height) : null;
}
