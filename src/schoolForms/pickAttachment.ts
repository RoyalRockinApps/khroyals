/**
 * Picking a picture or a PDF to attach to a class bulletin or a teacher's note (app/forms/write.tsx): a photo (camera or
 * library) or a picture file goes up as a JPEG at most 2000 px on its long side; a PDF as it is. Up to ATTACH_MAX_MB,
 * like the storage bucket. Null when cancelled or refused (with a message).
 */
import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as DeviceFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { AttachmentUpload } from '../api/connect';
import { SCHOOL } from '../school';
import { ATTACH_MAX_MB } from './attachments';

export type AttachSource = 'camera' | 'photos' | 'file';
const MAX = ATTACH_MAX_MB * 1024 * 1024;
const LONG_SIDE = 2000;
const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
const tooBig = () => { Alert.alert('That file is too big', `Pick one under ${ATTACH_MAX_MB} MB.`); return null; };

async function asJpeg(uri: string, width: number, height: number, name: string): Promise<AttachmentUpload | null> {
  const k = Math.min(1, LONG_SIDE / Math.max(width || LONG_SIDE, height || LONG_SIDE));
  const ctx = ImageManipulator.manipulate(uri);
  if (k < 1) ctx.resize({ width: Math.round(width * k), height: Math.round(height * k) });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.82, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) return null;
  const body = bytes(out.base64);
  if (body.byteLength > MAX) return tooBig();
  return { kind: 'image', mimeType: 'image/jpeg', name: `${name.replace(/\.[^.]+$/, '') || 'Picture'}.jpg`, body, size: body.byteLength,
    width: out.width, height: out.height, preview: out.uri };
}

export async function pickAttachment(source: AttachSource): Promise<AttachmentUpload | null> {
  if (source === 'file') {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return null;
    if ((asset.size ?? 0) > MAX) return tooBig();
    const pdf = asset.mimeType === 'application/pdf' || /\.pdf$/i.test(asset.name);
    if (!pdf) return asJpeg(asset.uri, 0, 0, asset.name);
    const body = Platform.OS === 'web' && asset.file ? asset.file : await new DeviceFile(asset.uri).arrayBuffer();
    const size = body instanceof ArrayBuffer ? body.byteLength : body.size;
    if (size > MAX) return tooBig();
    return { kind: 'pdf', mimeType: 'application/pdf', name: asset.name, body, size };
  }
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    Alert.alert('Camera is off', `Allow camera access for ${SCHOOL.appName} in Settings to take a photo.`);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? asJpeg(asset.uri, asset.width, asset.height, asset.fileName ?? 'Photo') : null;
}
