/**
 * A class's teacher downloads everything turned in for an assignment as one ZIP (app/assignments/[id].tsx): a folder per
 * student (src/assignments/zipNames.ts), the files stored as they are (documents and photos are already compressed).
 * On the web it downloads like any file; on a phone the Share sheet opens to save it to Files or send it on. The phone
 * holds the whole ZIP while it's made, so it's refused over ZIP_MAX_MB.
 */
import { Platform } from 'react-native';
import { zipSync, type Zippable } from 'fflate';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { workFileUrls, type StudentWork } from '../api/connect';
import { ZIP_MAX_MB, totalMb, zipEntries, zipName } from './zipNames';

/** How many files download at once. */
const AT_ONCE = 4;

export async function downloadAllWork(title: string, className: string | null, work: StudentWork[],
  onProgress: (done: number, total: number) => void): Promise<void> {
  const entries = zipEntries(work);
  if (!entries.length) throw new Error('Nobody has turned in work yet.');
  if (totalMb(work) > ZIP_MAX_MB) {
    throw new Error(`That’s more than ${ZIP_MAX_MB} MB of files, too much to download at once. Open them one at a time instead.`);
  }
  const urls = await workFileUrls(entries.map((e) => e.filePath));
  const files: Zippable = {};
  let done = 0;
  onProgress(0, entries.length);
  for (let i = 0; i < entries.length; i += AT_ONCE) {
    await Promise.all(entries.slice(i, i + AT_ONCE).map(async (e, k) => {
      const res = await fetch(urls[i + k]);
      if (!res.ok) throw new Error(`Couldn’t download ${e.path}. Try again.`);
      files[e.path] = new Uint8Array(await res.arrayBuffer());
      onProgress(++done, entries.length);
    }));
  }
  const zip = zipSync(files, { level: 0 });
  const name = zipName(title, className);

  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('This phone can’t save or share files from here.');
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(zip);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/zip', UTI: 'public.zip-archive', dialogTitle: name });
}
