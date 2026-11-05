// File object (track J): keeps an uploaded file as it was added, with its name, size and a type icon,
// for download later. The bytes live in the asset store under `item.assetId` with a neutral binary type,
// so the app never interprets, previews or runs them; they are only ever downloaded.
// Pure module: only type imports from the model, so it is safe inside the model's import cycle.
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';

/** Stored type of every kept file: bytes only, never drawn or opened by the app. */
export const FILE_ASSET_MIME = 'application/octet-stream';
/** Largest file that can be kept (the media limit, MAX_MEDIA_BYTES in model-ext.ts). */
export const FILE_MAX_BYTES = 25_000_000;

export type FileKind =
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'code'
  | 'text'
  | 'other';
const byExtension: Record<string, FileKind> = {};
const add = (kind: FileKind, list: string) => list.split(' ').forEach(ext => (byExtension[ext] = kind));
add('document', 'doc docx docm dot dotx odt ott rtf pages wpd');
add('spreadsheet', 'xls xlsx xlsm xlsb xlt xltx ods ots csv tsv numbers');
add('presentation', 'ppt pptx pptm pps ppsx pot potx odp otp key');
add('pdf', 'pdf');
add('image', 'png jpg jpeg gif webp bmp svg tif tiff heic heif ico psd ai eps raw');
add('audio', 'mp3 wav ogg oga flac m4a aac wma opus');
add('video', 'mp4 mov webm avi mkv wmv m4v mpg mpeg');
add('archive', 'zip rar 7z tar gz tgz bz2 xz');
add('code', 'js ts tsx jsx json xml html htm css py java c cpp h cs go rb php sh ps1 sql yml yaml');
add('text', 'txt md markdown log ini cfg');

/** Lower-case extension of a file name, without the dot ('' when there is none). At most 10 characters. */
export function fileExtension(name: string): string {
  const ext = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim())?.[1];
  return ext ? ext.toLowerCase() : '';
}
/** Icon family of a file from its extension, then its MIME type. */
export function fileKindOf(name: string, mime = ''): FileKind {
  const kind = byExtension[fileExtension(name)];
  if (kind) return kind;
  if (mime === 'application/pdf') return 'pdf';
  const top = mime.split('/')[0];
  if (top === 'image' || top === 'audio' || top === 'video') return top;
  if (top === 'text') return 'text';
  return 'other';
}
/** Human-readable size: "512 bytes", "12 KB", "3.4 MB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return `${n} ${n === 1 ? 'byte' : 'bytes'}`;
  if (n < 1_000_000) return `${Math.round(n / 1000)} KB`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)} MB`;
}
/** A file name that is safe to offer as a download name (no path separators or control characters). */
export function safeFileName(name: string, fallback = 'file'): string {
  return (
    name
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/^[\s.]+/, '')
      .trim()
      .slice(0, 200) || fallback
  );
}
const MIME = /^[\w.+-]{1,60}\/[\w.+-]{1,80}$/;
/** Data kept on a File object: byte size, extension and the type the browser reported (shown only). */
export function fileData(file: { name: string; size: number; type: string }): Record<string, unknown> {
  return { size: file.size, ext: fileExtension(file.name), ...(MIME.test(file.type) ? { mime: file.type } : {}) };
}

export const fileSpec: WidgetSpec = {
  kind: 'file',
  label: 'File',
  description: 'Keep any file on the board to download later',
  category: 'Media',
  size: [300, 84],
  validate: (i: Item) => {
    if (typeof i.assetId !== 'string' || !i.assetId || i.assetId.length > 100)
      throw new Error('A file object is missing its file reference.');
    const d = i.data ?? {};
    if (
      !Number.isInteger(d.size) ||
      d.size < 0 ||
      d.size > FILE_MAX_BYTES ||
      typeof d.ext !== 'string' ||
      !/^[a-z0-9]{0,10}$/.test(d.ext) ||
      (d.mime !== undefined && (typeof d.mime !== 'string' || !MIME.test(d.mime)))
    )
      throw new Error('Invalid file details.');
  },
  searchText: i => `${i.data?.ext ?? ''}`,
};
