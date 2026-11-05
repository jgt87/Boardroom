// File object view (track J): a card with a type icon, the file name, its size and a Download button.
// The kept bytes are never previewed or opened; Download saves them under the original name.
import {
  Download,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Presentation,
} from 'lucide-react';
import type { ImageAsset, Item } from './model';
import type { WidgetCtx, WidgetView } from './widget-types';
import { decodeDataUrl } from './images';
import { saveBlobFile } from './widget-kit';
import {
  FILE_ASSET_MIME,
  FILE_MAX_BYTES,
  fileData,
  fileExtension,
  fileKindOf,
  formatBytes,
  safeFileName,
  type FileKind,
} from './specs-file';
import './widgets-file.css';

const icons: Record<FileKind, typeof FileIcon> = {
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  pdf: FileText,
  image: FileImage,
  audio: FileAudio,
  video: FileVideo,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  other: FileIcon,
};
const nameOf = (item: Item, asset?: ImageAsset) => item.text || asset?.name || 'File';

/** Save the kept bytes under the file's own name, as an opaque binary download. */
function downloadFile(item: Item, ctx: WidgetCtx) {
  const asset = item.assetId ? ctx.assets[item.assetId] : undefined;
  if (!asset) return ctx.display('This file is not stored in this browser.');
  try {
    const { bytes } = decodeDataUrl(asset.data);
    saveBlobFile(new Blob([bytes as BlobPart], { type: FILE_ASSET_MIME }), safeFileName(nameOf(item, asset)));
  } catch (err) {
    ctx.display((err as Error).message || 'The file could not be downloaded.');
  }
}

function FileView({ item, ctx }: { item: Item; ctx: WidgetCtx }) {
  const asset = item.assetId ? ctx.assets[item.assetId] : undefined,
    d = item.data ?? {},
    name = nameOf(item, asset),
    kind = fileKindOf(name, d.mime),
    Icon = icons[kind],
    ext = (d.ext || fileExtension(name)).toUpperCase();
  return (
    <div className="file-object" data-kind={kind} title={name}>
      <span className="file-object-icon" aria-hidden="true">
        <Icon size={26} strokeWidth={1.6} />
        {ext && <small>{ext.slice(0, 5)}</small>}
      </span>
      <span className="file-object-meta">
        <strong>{name}</strong>
        <small>{asset ? formatBytes(d.size) : 'File not stored in this browser'}</small>
      </span>
      <button
        className="file-object-download"
        aria-label={`Download ${name}`}
        title="Download"
        disabled={!asset}
        onPointerDown={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          downloadFile(item, ctx);
        }}
      >
        <Download size={16} />
      </button>
    </div>
  );
}

/** Keep a file as it is: read its bytes into a neutral binary asset. */
async function loadFile(file: File) {
  const name = file.name.slice(0, 200) || 'File';
  if (file.size > FILE_MAX_BYTES) throw new Error(`"${name}" is larger than 25 MB. Choose a smaller file.`);
  // Re-typed as plain bytes, so the stored data URL never carries a type the browser could render.
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`"${name}" could not be read.`));
    reader.readAsDataURL(new Blob([file], { type: FILE_ASSET_MIME }));
  });
  const prefix = `data:${FILE_ASSET_MIME};base64,`;
  return {
    asset: { mime: FILE_ASSET_MIME, data: data.startsWith(prefix) ? data : prefix, width: 1, height: 1, name },
    data: fileData(file),
    size: [300, 84] as [number, number],
    text: name,
  };
}

export const fileView: WidgetView = {
  kind: 'file',
  mode: 'html',
  interactive: true,
  Render: p => <FileView {...p} />,
  fromFile: { accept: '', load: loadFile },
  actions: (item, ctx) => [
    {
      label: 'Download file',
      icon: <Download size={17} />,
      disabled: !(item.assetId && ctx.assets[item.assetId]),
      run: () => downloadFile(item, ctx),
    },
  ],
};
