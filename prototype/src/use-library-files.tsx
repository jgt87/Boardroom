// Library file actions (gaps C3 and C4): back up every board to one file, restore a library backup by
// adding its boards, and import a single-board backup as a new board. File parsing lives in the pure
// library-backup.ts (loaded on demand); this hook only stores media and talks to the app.
// Track R3: the library backup also carries saved templates and space details, and templates can be
// exported to and imported from their own file.
import { parseBoard } from './model';
import type { ImageAsset } from './model';
import { useApp } from './board-app';
import { loadAssets, saveAsset } from './assets-store';
import { useExporters } from './use-exporters';
import {
  exportTemplates,
  loadTemplates,
  mergeTemplates,
  readTemplatesFile,
  storeTemplates,
  type UserTemplate,
} from './user-templates';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function useLibraryFiles() {
  const { boardActions, setAssets, display } = useApp();
  const { saveBlob } = useExporters();
  const storeMedia = async (assets: Record<string, ImageAsset>) => {
    for (const [id, asset] of Object.entries(assets))
      await saveAsset(id, asset).catch(() => {
        throw new Error('Media in this backup could not be stored in this browser.');
      });
    if (Object.keys(assets).length) setAssets(a => ({ ...a, ...assets }));
  };
  /** Add templates to this browser's list; returns a short sentence for the status message. */
  const addTemplates = (incoming: UserTemplate[]): string => {
    if (!incoming.length) return '';
    const merged = mergeTemplates(loadTemplates(), incoming, () => crypto.randomUUID());
    if (!merged.added) return '';
    if (!storeTemplates(merged.list)) return ' The templates could not be stored (browser storage is full).';
    return ` Added ${plural(merged.added, 'template')}.${merged.dropped ? ` ${plural(merged.dropped, 'older template')} made room.` : ''}`;
  };
  /** One .boardroom file with every board (trash included), spaces, saved templates and media. */
  const backupAll = async () => {
    try {
      const lib = boardActions.flush();
      const [{ encodeLibrary }, all] = await Promise.all([
        import('./library-backup'),
        loadAssets().catch(() => ({}) as Record<string, ImageAsset>),
      ]);
      const made = encodeLibrary(localStorage, lib, all, undefined, loadTemplates());
      saveBlob(
        new Blob([made.bytes as BlobPart], { type: 'application/zip' }),
        `boardroom-library-${new Date().toISOString().slice(0, 10)}.boardroom`,
      );
      display(
        `Backed up ${plural(made.boards, 'board')} and ${plural(made.media, 'media file')}` +
          (made.templates ? ` with ${plural(made.templates, 'template')}.` : '.'),
      );
    } catch (err) {
      display((err as Error).message || 'The library backup could not be created.');
    }
  };
  /**
   * Add what a backup file holds: a library backup adds all its boards (new ids where an id is taken);
   * a single-board backup becomes a new board and opens. Nothing existing is replaced.
   */
  const importFile = async (file: File) => {
    try {
      if (file.size > 320_000_000) throw new Error('Choose a backup smaller than 300 MB.');
      const { readBackup } = await import('./library-backup');
      const contents = readBackup(new Uint8Array(await file.arrayBuffer()), parseBoard);
      await storeMedia(contents.assets);
      if (contents.kind === 'library') {
        if (!contents.entries.length) throw new Error('This backup holds no readable boards.');
        if (!boardActions.addBoards(contents.entries, contents.spaces, contents.spaceInfo)) return;
        display(
          `Restored ${plural(contents.entries.length, 'board')} next to your boards.` +
            (contents.skipped ? ` ${plural(contents.skipped, 'board')} could not be read.` : '') +
            addTemplates(contents.templates),
        );
      } else if (boardActions.createFrom(contents.board)) display('Backup imported as a new board.');
    } catch (err) {
      display((err as Error).message || 'Unable to import this file.');
    }
  };
  /** Save templates (one or all) as a .json templates file. */
  const exportTemplateFile = (list: UserTemplate[]) => {
    if (!list.length) return display('There are no saved templates to export.');
    const name = list.length === 1 ? list[0].name.replace(/[^\w -]+/g, '').trim() || 'template' : 'templates';
    saveBlob(new Blob([exportTemplates(list)], { type: 'application/json' }), `boardroom-${name}.json`);
    display(`Exported ${plural(list.length, 'template')}.`);
  };
  /** Add the templates in a templates file; returns the new list, or null when nothing changed. */
  const importTemplateFile = async (file: File): Promise<UserTemplate[] | null> => {
    try {
      if (file.size > 40_000_000) throw new Error('Choose a templates file smaller than 40 MB.');
      const read = readTemplatesFile(await file.text());
      if (!read.templates.length) throw new Error('This file holds no readable templates.');
      const merged = mergeTemplates(loadTemplates(), read.templates, () => crypto.randomUUID());
      if (!merged.added) {
        display('These templates are already saved.');
        return null;
      }
      if (!storeTemplates(merged.list)) throw new Error('Browser storage is full. Delete templates to make room.');
      display(
        `Imported ${plural(merged.added, 'template')}.` +
          (read.skipped ? ` ${plural(read.skipped, 'template')} could not be read.` : '') +
          (merged.dropped ? ` ${plural(merged.dropped, 'older template')} made room.` : ''),
      );
      return merged.list;
    } catch (err) {
      display((err as Error).message || 'Unable to import this file.');
      return null;
    }
  };
  return { backupAll, importFile, exportTemplateFile, importTemplateFile };
}
