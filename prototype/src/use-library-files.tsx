// Library file actions (gaps C3 and C4): back up every board to one file, restore a library backup by
// adding its boards, and import a single-board backup as a new board. File parsing lives in the pure
// library-backup.ts (loaded on demand); this hook only stores media and talks to the app.
import { parseBoard } from './model';
import type { ImageAsset } from './model';
import { useApp } from './board-app';
import { loadAssets, saveAsset } from './assets-store';
import { useExporters } from './use-exporters';

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
  /** One .boardroom file with every board (trash included), spaces and media. */
  const backupAll = async () => {
    try {
      const lib = boardActions.flush();
      const [{ encodeLibrary }, all] = await Promise.all([
        import('./library-backup'),
        loadAssets().catch(() => ({}) as Record<string, ImageAsset>),
      ]);
      const made = encodeLibrary(localStorage, lib, all);
      saveBlob(
        new Blob([made.bytes as BlobPart], { type: 'application/zip' }),
        `boardroom-library-${new Date().toISOString().slice(0, 10)}.boardroom`,
      );
      display(`Backed up ${plural(made.boards, 'board')} and ${plural(made.media, 'media file')}.`);
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
        if (!boardActions.addBoards(contents.entries, contents.spaces)) return;
        display(
          `Restored ${plural(contents.entries.length, 'board')} next to your boards.` +
            (contents.skipped ? ` ${plural(contents.skipped, 'board')} could not be read.` : ''),
        );
      } else if (boardActions.createFrom(contents.board)) display('Backup imported as a new board.');
    } catch (err) {
      display((err as Error).message || 'Unable to import this file.');
    }
  };
  return { backupAll, importFile };
}
