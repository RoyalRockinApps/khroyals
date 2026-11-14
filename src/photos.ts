/** Pick a photo (camera or library), cropped square and shrunk to 512 px, as base64 JPEG. Null when cancelled. */
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { SCHOOL } from './school';

/** `size`: the most pixels on a side (profile photos 512; student work on a bulletin board more). */
export async function pickSquarePhoto(camera: boolean, size = 512): Promise<string | null> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    Alert.alert('Camera is off', `Allow camera access for ${SCHOOL.appName} in Settings to take a photo.`);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const ctx = ImageManipulator.manipulate(asset.uri);
  const side = Math.min(asset.width, asset.height);
  if (asset.width !== asset.height) ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  if (side > size) ctx.resize({ width: size, height: size });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.75, format: SaveFormat.JPEG, base64: true });
  return out.base64 ?? null;
}

/**
 * Pick a cover photo for a Volunteer card (camera or library): the middle of it cropped to 2:1, like the banner it fills,
 * and shrunk to 1600 × 800 at most, as base64 JPEG (and a data link to preview it). Null when cancelled.
 */
export async function pickCoverPhoto(camera: boolean): Promise<{ base64: string; uri: string } | null> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
    Alert.alert('Camera is off', `Allow camera access for ${SCHOOL.appName} in Settings to take a photo.`);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const width = Math.min(asset.width, asset.height * 2);
  const height = Math.round(width / 2);
  const ctx = ImageManipulator.manipulate(asset.uri)
    .crop({ originX: (asset.width - width) / 2, originY: (asset.height - height) / 2, width, height });
  if (width > 1600) ctx.resize({ width: 1600, height: 800 });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? { base64: out.base64, uri: `data:image/jpeg;base64,${out.base64}` } : null;
}

/**
 * Pick photos for the gallery (several at once): each shrunk to at most 1600 px on its long side,
 * plus a 400 px thumbnail, as base64 JPEG. Empty when cancelled.
 */
export async function pickGalleryPhotos(limit = 30): Promise<{ full: string; thumb: string; width: number; height: number }[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit, quality: 1 });
  if (result.canceled) return [];
  const out: { full: string; thumb: string; width: number; height: number }[] = [];
  for (const asset of result.assets) {
    const fit = (max: number) => {
      const k = Math.min(1, max / Math.max(asset.width, asset.height));
      return { width: Math.round(asset.width * k), height: Math.round(asset.height * k) };
    };
    const size = fit(1600);
    const full = ImageManipulator.manipulate(asset.uri);
    if (size.width < asset.width) full.resize(size);
    const big = await (await full.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
    const small = ImageManipulator.manipulate(asset.uri).resize(fit(400));
    const thumb = await (await small.renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
    if (big.base64 && thumb.base64) out.push({ full: big.base64, thumb: thumb.base64, width: size.width, height: size.height });
  }
  return out;
}

/**
 * Pick a finished graphic for a splash page (from the library, as it is: a tall one fills a phone best), shrunk to
 * 1600 px on its long side, as base64 JPEG with a data link to preview it. Null when cancelled.
 */
export async function pickSplashPicture(): Promise<{ base64: string; uri: string; width: number; height: number } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const k = Math.min(1, 1600 / Math.max(asset.width, asset.height));
  const width = Math.round(asset.width * k), height = Math.round(asset.height * k);
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (k < 1) ctx.resize({ width, height });
  const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.85, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? { base64: out.base64, uri: `data:image/jpeg;base64,${out.base64}`, width, height } : null;
}
