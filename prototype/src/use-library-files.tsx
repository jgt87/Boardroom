// Library file actions (gaps C3 and C4): back up every board to one file, restore a library backup by
// adding its boards, and import a single-board backup as a new board. File parsing lives in the pure
// library-backup.ts (loaded on demand); this hook only stores media and talks to the app.
// Gap R3-Q2: the library backup also carries saved space blueprints.
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
import { BLUEPRINT_LIMIT, loadBlueprints, mergeBlueprints, storeBlueprints, type Blueprint } from './blueprints';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function useLibraryFiles() {
  const { boardActions, setAssets, display, importWhiteboardFile } = useApp();
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
  /** Add restored blueprints to this browser's list (gap R3-Q2); returns a short sentence for the message. */
  const addBlueprints = (incoming: Blueprint[]): string => {
    if (!incoming.length) return '';
    const merged = mergeBlueprints(loadBlueprints(parseBoard), incoming, () => crypto.randomUUID());
    const full = merged.full
      ? ` ${plural(merged.full, 'blueprint')} did not fit (up to ${BLUEPRINT_LIMIT} are saved); delete blueprints to make room.`
      : '';
    if (!merged.added) return full;
    if (!storeBlueprints(merged.list)) return ' The blueprints could not be stored (browser storage is full).';
    return ` Added ${plural(merged.added, 'blueprint')}.${full}`;
  };
  /** One .boardroom file with every board (trash included), spaces, saved templates, blueprints and media. */
  const backupAll = async () => {
    try {
      const lib = boardActions.flush();
      const [{ encodeLibrary }, all] = await Promise.all([
        import('./library-backup'),
        loadAssets().catch(() => ({}) as Record<string, ImageAsset>),
      ]);
      const made = encodeLibrary(localStorage, lib, all, undefined, loadTemplates(), loadBlueprints(parseBoard));
      saveBlob(
        new Blob([made.bytes as BlobPart], { type: 'application/zip' }),
        `boardroom-library-${new Date().toISOString().slice(0, 10)}.boardroom`,
      );
      const extras = [
        made.templates ? plural(made.templates, 'template') : '',
        made.blueprints ? plural(made.blueprints, 'blueprint') : '',
      ].filter(Boolean);
      display(
        `Backed up ${plural(made.boards, 'board')} and ${plural(made.media, 'media file')}` +
          (extras.length ? ` with ${extras.join(' and ')}.` : '.'),
      );
    } catch (err) {
      display((err as Error).message || 'The library backup could not be created.');
    }
  };
  /**
   * Back up one or a few boards (track R2-I) in the library backup format, so the file restores the same way:
   * the boards with their space, star, emoji and media. Templates and blueprints are left out.
   */
  const backupBoards = async (ids: string[]) => {
    try {
      const lib = boardActions.flush();
      const chosen = lib.boards.filter(b => ids.includes(b.id));
      if (!chosen.length) return display('Choose boards to back up.');
      const [{ encodeLibrary }, all] = await Promise.all([
        import('./library-backup'),
        loadAssets().catch(() => ({}) as Record<string, ImageAsset>),
      ]);
      const made = encodeLibrary(localStorage, lib, all, undefined, [], [], ids);
      const stem =
        chosen.length === 1
          ? chosen[0].title
              .replace(/[^\w -]+/g, '')
              .trim()
              .replace(/\s+/g, '-')
              .slice(0, 60) || 'board'
          : `${chosen.length}-boards`;
      saveBlob(
        new Blob([made.bytes as BlobPart], { type: 'application/zip' }),
        `boardroom-${stem}-${new Date().toISOString().slice(0, 10)}.boardroom`,
      );
      display(
        `Backed up ${chosen.length === 1 ? `“${chosen[0].title}”` : plural(made.boards, 'board')}` +
          (made.media ? ` with ${plural(made.media, 'media file')}.` : '.'),
      );
    } catch (err) {
      display((err as Error).message || 'The backup could not be created.');
    }
  };
  /**
   * Add what a backup file holds: a library backup adds all its boards (new ids where an id is taken);
   * a single-board backup becomes a new board and opens. Nothing existing is replaced.
   */
  const importFile = async (file: File) => {
    try {
      if (file.size > 320_000_000) throw new Error('Choose a backup smaller than 300 MB.');
      // A board exported from another whiteboard's REST API (JSON) becomes a new board too.
      if ((/\.json$/i.test(file.name) || file.type === 'application/json') && (await importWhiteboardFile(file)))
        return;
      const { readBackup } = await import('./library-backup');
      const contents = readBackup(new Uint8Array(await file.arrayBuffer()), parseBoard);
      await storeMedia(contents.assets);
      if (contents.kind === 'library') {
        if (!contents.entries.length) throw new Error('This backup holds no readable boards.');
        if (!boardActions.addBoards(contents.entries, contents.spaces, contents.spaceInfo)) return;
        display(
          `Restored ${plural(contents.entries.length, 'board')} next to your boards.` +
            (contents.skipped ? ` ${plural(contents.skipped, 'board')} could not be read.` : '') +
            addTemplates(contents.templates) +
            addBlueprints(contents.blueprints),
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
  return { backupAll, backupBoards, importFile, exportTemplateFile, importTemplateFile };
}
