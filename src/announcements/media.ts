/**
 * Picking an uploaded splash page in the Announcements composer ("Upload a graphic"): a picture, an animated GIF or a
 * video. A picture becomes a JPEG at most 1600 px on its long side (src/photos.ts); a GIF and a video go up as they
 * are, the video as an .mp4 (an iPhone turns a library video into a 720p .mp4 while it's picked; on Android it must
 * already be one). Up to SPLASH_MAX_MB, like the storage bucket. Null when cancelled or refused (with a message).
 */
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File as DeviceFile } from 'expo-file-system';
import { splashJpeg } from '../photos';
import { SPLASH_MAX_MB, type SplashMedia } from './kinds';

export type SplashUpload = {
  media: SplashMedia; mimeType: 'image/jpeg' | 'image/gif' | 'video/mp4'; uri: string;
  /** A picture: the JPEG. A GIF or video: the file as it is. */
  base64?: string; body?: ArrayBuffer | Blob;
};

const tooBig = () => {
  Alert.alert('That file is too big', `Pick one under ${SPLASH_MAX_MB} MB. A short video clip (under a minute) works best.`);
  return null;
};

export async function pickSplashMedia(): Promise<SplashUpload | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'], quality: 1,
    // iPhone: hand over library videos as H.264 .mp4 (720p), which every phone and browser plays.
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const name = (asset.fileName ?? asset.uri).toLowerCase();
  const video = asset.type === 'video' || (asset.mimeType ?? '').startsWith('video/');
  const gif = !video && (asset.mimeType === 'image/gif' || name.split(/[?#]/)[0].endsWith('.gif'));

  if (!video && !gif) {
    const jpeg = await splashJpeg(asset);
    return jpeg && { media: 'image', mimeType: 'image/jpeg', uri: jpeg.uri, base64: jpeg.base64 };
  }
  if (video && !(asset.mimeType === 'video/mp4' || name.split(/[?#]/)[0].endsWith('.mp4'))) {
    Alert.alert('Pick an .mp4 video', 'Splash pages play .mp4 videos. Save or export the video as an .mp4 and pick it again.');
    return null;
  }
  const max = SPLASH_MAX_MB * 1024 * 1024;
  if ((asset.fileSize ?? 0) > max) return tooBig();
  const body: ArrayBuffer | Blob = Platform.OS === 'web' && asset.file ? asset.file : await new DeviceFile(asset.uri).arrayBuffer();
  if ((body instanceof ArrayBuffer ? body.byteLength : body.size) > max) return tooBig();
  return { media: video ? 'video' : 'gif', mimeType: video ? 'video/mp4' : 'image/gif', uri: asset.uri, body };
}
