/**
 * Picking work to turn in for an assignment (app/assignments/[id].tsx): a document from the phone's files (PDF, Word,
 * PowerPoint, Excel, text or a picture), or a photo of the work (camera or library), sent as a JPEG at most 2400 px on
 * its long side. Up to WORK_MAX_MB, like the storage bucket. Null when cancelled or refused (with a message).
 */
import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as DeviceFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { SCHOOL } from '../school';
import { WORK_MAX_MB, WORK_TYPES, workTypeOf, type WorkType } from './fileTypes';

export type WorkSource = 'file' | 'camera' | 'photos';
export type WorkFile = { name: string; mimeType: WorkType; body: ArrayBuffer | Blob; size: number };

const MAX_BYTES = WORK_MAX_MB * 1024 * 1024;
const LONG_SIDE = 2400;
const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
const tooBig = () => {
  Alert.alert('That file is too big', `Pick a file under ${WORK_MAX_MB} MB.`);
  return null;
};

/** A picture as a JPEG no bigger than LONG_SIDE, named after the file it came from (or the day). */
async function asJpeg(uri: string, width: number, height: number, name: string): Promise<WorkFile | null> {
  const k = Math.min(1, LONG_SIDE / Math.max(width || LONG_SIDE, height || LONG_SIDE));
  const ctx = ImageManipulator.manipulate(uri);
  if (k < 1) ctx.resize({ width: Math.round(width * k), height: Math.round(height * k) });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) return null;
  const body = bytes(out.base64);
  return { name: `${name.replace(/\.[^.]+$/, '')}.jpg`, mimeType: 'image/jpeg', body, size: body.byteLength };
}

const photoName = () => `Photo ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

export async function pickWork(source: WorkSource): Promise<WorkFile | null> {
  if (source === 'file') {
    const result = await DocumentPicker.getDocumentAsync({ type: [...Object.keys(WORK_TYPES), 'image/*'], copyToCacheDirectory: true, multiple: false });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return null;
    if ((asset.size ?? 0) > MAX_BYTES) return tooBig();
    const type = workTypeOf(asset.mimeType, asset.name);
    // Other pictures (an iPhone's HEIC) go up as JPEGs.
    if (!type && (asset.mimeType ?? '').startsWith('image/')) return asJpeg(asset.uri, 0, 0, asset.name);
    if (!type) {
      Alert.alert('That kind of file can’t be turned in', 'Save it as a PDF or a Word, PowerPoint or Excel file and pick it again.');
      return null;
    }
    const body = Platform.OS === 'web' && asset.file ? asset.file : await new DeviceFile(asset.uri).arrayBuffer();
    const size = body instanceof ArrayBuffer ? body.byteLength : body.size;
    if (size > MAX_BYTES) return tooBig();
    return { name: asset.name, mimeType: type, body, size };
  }
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    Alert.alert('Camera is off', `Allow camera access for ${SCHOOL.appName} in Settings to take a photo of your work.`);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? asJpeg(asset.uri, asset.width, asset.height, asset.fileName ?? photoName()) : null;
}
