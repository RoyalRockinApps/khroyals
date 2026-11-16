/**
 * Picking a file of flash cards for Add cards (app/study/add.tsx): a text, CSV or tab-separated file from the phone's
 * files, read as text and turned into the paste box's lines (src/study/cardFile.ts). Null when cancelled or refused
 * (with a message).
 */
import { Alert, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as DeviceFile } from 'expo-file-system';
import { CARD_FILE_EXTS, CARD_FILE_MAX_KB, cardListFromFile, extOf } from './cardFile';

export async function pickCardFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // CSV files come with several names; the extension decides below.
    type: ['text/plain', 'text/csv', 'text/comma-separated-values', 'text/tab-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/*'],
    copyToCacheDirectory: true, multiple: false,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (!(CARD_FILE_EXTS as readonly string[]).includes(extOf(asset.name))) {
    Alert.alert('Pick a text or CSV file', 'Save a spreadsheet as CSV (term in the first column, meaning in the second), or a list as a text file, and pick it again.');
    return null;
  }
  if ((asset.size ?? 0) > CARD_FILE_MAX_KB * 1024) {
    Alert.alert('That file is too big', 'A deck holds up to 500 cards. Split the list into smaller files.');
    return null;
  }
  const content = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new DeviceFile(asset.uri).text();
  return { name: asset.name, text: cardListFromFile(asset.name, content) };
}
