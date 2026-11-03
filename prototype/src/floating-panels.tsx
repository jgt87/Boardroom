import React from 'react';
import { createItem } from './model';
import type { Item, Crop } from './model';
import { AnchoredPanel } from './anchored-panel';
import { NoteDetails } from './sticky-tools';
import { ConnectorDetails } from './connectors';
import { setConnectorConnections } from './connector-geometry';
import {
  alignSelection,
  distributeSelection,
  canAlign,
  canDistribute,
  expandGroups,
  isGrouped,
  canGroup,
} from './arrange';
import { ArrangePanel } from './arrange-tools';
import { applyCrop } from './images';
import { CropEditor } from './image-tools';
import { setNoteEmoji, convertNote } from './notes';
import { EmojiPicker, ConvertPanel } from './note-extras';
import { SearchPanel } from './search-panel';
import { PresentationPanel, PresentOverlay } from './presentation';
import { moveInPresentation } from './navigation';
import { PreviewContext, PrototypePreview } from './prototype-preview';
import { MarkdownPastePanel } from './markdown-paste';
import { markdownToItems } from './markdown';
import { CodeEditorDialog } from './code-block';
import { ReactionsPanel, AuthorsPanel } from './collab-extras';
import {
  startVoting,
  endVoting,
  addThread,
  replyThread,
  setResolved,
  deleteThread,
  threadPoint,
  setLinkTo,
  checkAccessibility,
  templateItems,
} from './board-tools';
import type { TemplateName } from './board-tools';
import {
  VotingPanel,
  BoardTimer,
  CommentThreadView,
  NewComment,
  CommentsPanel,
  LinkPicker,
  A11yPanel,
  TemplatesPanel,
} from './board-panels';
import { viewFor } from './widgets';
import type { WidgetCtx } from './widget-types';
import { useApp } from './board-app';

export function FloatingPanels() {
  const {
    authorName,
    setAuthorName,
    assets,
    board,
    boardRef,
    camera,
    codeId,
    connectorDetailsId,
    cropId,
    detailsId,
    display,
    facil,
    fit,
    groupNow,
    mdPaste,
    panel,
    patch,
    presentPanel,
    presenting,
    previewStart,
    previewState,
    run,
    searchExclude,
    searchOpen,
    selected,
    selectedItem,
    selectionLocked,
    setCamera,
    setCodeId,
    setConnectorDetailsId,
    setCropId,
    setDetailsId,
    setFacil,
    setMatches,
    setMdPaste,
    setPanel,
    setPresentPanel,
    setSearchOpen,
    setSelected,
    setThread,
    setTimerOn,
    setWidgetEditId,
    shown,
    size,
    startPresenting,
    stopPresenting,
    stopPreview,
    thread,
    timerOn,
    toWorld,
    ungroupNow,
    update,
    widgetCtx,
    widgetEditId,
  } = useApp();
  return (
    <>
      {detailsId === selectedItem?.id && selectedItem?.type === 'note' && (
        <AnchoredPanel anchor="note-details" placement="below">
          <NoteDetails key={detailsId} item={selectedItem} onApply={patch} onClose={() => setDetailsId(null)} />
        </AnchoredPanel>
      )}
      {connectorDetailsId === selectedItem?.id && selectedItem?.type === 'arrow' && (
        <AnchoredPanel anchor="connector-details" placement="below">
          <ConnectorDetails
            key={selectedItem.id}
            item={selectedItem}
            board={board}
            onApply={(start, end, text, sides) =>
              update(setConnectorConnections(boardRef.current, selectedItem.id, start, end, text, sides))
            }
            onRoute={change => run(change)}
            onClose={() => setConnectorDetailsId(null)}
          />
        </AnchoredPanel>
      )}
      {panel === 'arrange' && selected.length > 0 && !selectionLocked && (
        <AnchoredPanel anchor="arrange" placement="below">
          <ArrangePanel
            canAlign={canAlign(board, selected)}
            canDistribute={canDistribute(board, selected)}
            canGroup={canGroup(board, selected)}
            grouped={isGrouped(board, selected)}
            onAlign={mode => run(b => alignSelection(b, selected, mode))}
            onDistribute={axis => run(b => distributeSelection(b, selected, axis))}
            onGroup={groupNow}
            onUngroup={ungroupNow}
            onClose={() => setPanel(null)}
          />
        </AnchoredPanel>
      )}
      {panel === 'emoji' && selectedItem?.type === 'note' && (
        <AnchoredPanel anchor="note-emoji" placement="below">
          <EmojiPicker
            current={selectedItem.emoji}
            onChoose={emoji => {
              run(b => setNoteEmoji(b, [selectedItem.id], emoji));
              setPanel(null);
            }}
            onClose={() => setPanel(null)}
          />
        </AnchoredPanel>
      )}
      {panel === 'convert' && selectedItem?.type === 'note' && (
        <AnchoredPanel anchor="note-convert" placement="below">
          <ConvertPanel
            board={board}
            onConvert={target => {
              try {
                const r = convertNote(boardRef.current, selectedItem.id, target);
                update(r.board);
                setSelected([r.selectId]);
                setPanel(null);
                display('Note converted. Undo restores the note.');
              } catch (err) {
                display((err as Error).message);
              }
            }}
            onClose={() => setPanel(null)}
          />
        </AnchoredPanel>
      )}
      {panel === 'link' && selectedItem && (
        <AnchoredPanel anchor="link-to" placement="below">
          <LinkPicker
            item={selectedItem}
            board={board}
            onLink={target => {
              run(b => setLinkTo(b, selectedItem.id, target));
              setPanel(null);
            }}
            onClose={() => setPanel(null)}
          />
        </AnchoredPanel>
      )}
      {facil === 'voting' && !presenting && (
        <AnchoredPanel anchor="facilitate" placement="below">
          <VotingPanel
            board={board}
            selectedCount={selected.length}
            onStart={(budget, scope) =>
              run(b =>
                startVoting(
                  b,
                  scope === 'selection'
                    ? expandGroups(b, selected)
                    : b.items.filter(i => !['arrow', 'frame', 'pen'].includes(i.type) && !i.hidden).map(i => i.id),
                  budget,
                ),
              )
            }
            onEnd={() => {
              try {
                const r = endVoting(
                  boardRef.current,
                  i => i.name || i.text.trim().slice(0, 60) || `Untitled ${i.type}`,
                );
                update(r.board);
                display('Voting ended. Results are saved with the board.');
              } catch (err) {
                display((err as Error).message);
              }
            }}
            onClose={() => setFacil(null)}
          />
        </AnchoredPanel>
      )}
      {facil === 'comments' && !presenting && (
        <AnchoredPanel anchor="facilitate" placement="below">
          <CommentsPanel
            board={board}
            active={thread && 'id' in thread ? thread.id : null}
            onOpen={t => {
              setThread({ id: t.id });
              const p = threadPoint(boardRef.current, t);
              setCamera(c => ({ ...c, x: size.w / 2 - p.x * c.z, y: size.h / 2 - p.y * c.z }));
            }}
            onClose={() => setFacil(null)}
          />
        </AnchoredPanel>
      )}
      {facil === 'templates' && (
        <AnchoredPanel anchor="facilitate" placement="below">
          <TemplatesPanel
            onChoose={(name: TemplateName) => {
              const at = toWorld(size.w / 2 - 300, size.h / 2 - 200),
                items = templateItems(name, at, (t, x, y, f) => createItem(t, x, y, f));
              update({ ...boardRef.current, items: [...boardRef.current.items, ...items] });
              setSelected(items.map(i => i.id));
              setFacil(null);
              fit(items);
            }}
            onClose={() => setFacil(null)}
          />
        </AnchoredPanel>
      )}
      {facil === 'a11y' && (
        <AnchoredPanel anchor="facilitate" placement="below">
          <A11yPanel
            issues={checkAccessibility(board)}
            onSelect={id => {
              const item = boardRef.current.items.find(i => i.id === id);
              if (item) {
                setSelected([id]);
                fit([item]);
              }
            }}
            onClose={() => setFacil(null)}
          />
        </AnchoredPanel>
      )}
      {facil === 'reactions' && (
        <AnchoredPanel anchor="facilitate" placement="below">
          <ReactionsPanel onClose={() => setFacil(null)} />
        </AnchoredPanel>
      )}
      {facil === 'authors' && (
        <AnchoredPanel anchor="facilitate" placement="below">
          <AuthorsPanel
            name={authorName}
            show={!!board.showAuthors}
            onName={setAuthorName}
            onShow={show =>
              run(b => {
                const next: typeof b = { ...b };
                if (show) next.showAuthors = true;
                else delete next.showAuthors;
                return next;
              })
            }
            onClose={() => setFacil(null)}
          />
        </AnchoredPanel>
      )}
      {timerOn && <BoardTimer onClose={() => setTimerOn(false)} />}
      {thread &&
        (() => {
          const existing = 'id' in thread ? (board.comments ?? []).find(t => t.id === thread.id) : undefined;
          if ('id' in thread && !existing) return null;
          const loose = thread as { x: number; y: number; itemId?: string },
            p = existing ? threadPoint(shown, existing) : { x: loose.x, y: loose.y },
            left = Math.max(12, Math.min(size.w - 340, p.x * camera.z + camera.x + 18)),
            top = Math.max(80, Math.min(size.h - 320, p.y * camera.z + camera.y - 30));
          return (
            <aside className="comment-popover floating" style={{ left, top }} aria-label="Comment thread">
              {existing ? (
                <CommentThreadView
                  thread={existing}
                  onReply={text => run(b => replyThread(b, existing.id, text))}
                  onResolve={r => {
                    run(b => setResolved(b, existing.id, r));
                    if (r) setThread(null);
                  }}
                  onDelete={() => {
                    run(b => deleteThread(b, existing.id));
                    setThread(null);
                  }}
                  onClose={() => setThread(null)}
                />
              ) : (
                <NewComment
                  onAdd={text => {
                    const item = loose.itemId ? boardRef.current.items.find(i => i.id === loose.itemId) : undefined;
                    try {
                      const r = addThread(boardRef.current, { x: loose.x, y: loose.y }, text, item);
                      update(r.board);
                      setThread({ id: r.thread.id });
                    } catch (err) {
                      display((err as Error).message);
                    }
                  }}
                  onClose={() => setThread(null)}
                />
              )}
            </aside>
          );
        })()}
      {widgetEditId &&
        (() => {
          const item = board.items.find(i => i.id === widgetEditId),
            v = item && viewFor(item.type);
          if (!item || !v?.Editor) return null;
          const E = v.Editor as (props: { item: Item; ctx: WidgetCtx; onClose: () => void }) => React.ReactNode;
          return <E key={widgetEditId} item={item} ctx={widgetCtx(item)} onClose={() => setWidgetEditId(null)} />;
        })()}
      {previewStart && previewState && (
        <PreviewContext.Provider value={previewState}>
          <PrototypePreview board={board} state={previewState} size={size} onCamera={setCamera} onExit={stopPreview} />
        </PreviewContext.Provider>
      )}
      {mdPaste !== null && (
        <MarkdownPastePanel
          text={mdPaste}
          onChoose={mode => {
            const at = toWorld(size.w / 2, size.h / 2),
              items = markdownToItems(mdPaste, mode, at);
            if (items.length) {
              update({ ...boardRef.current, items: [...boardRef.current.items, ...items] });
              setSelected(items.map(i => i.id));
              fit(items);
            }
            setMdPaste(null);
          }}
          onClose={() => setMdPaste(null)}
        />
      )}
      {searchOpen && !presenting && (
        <div className="search-anchor">
          <SearchPanel
            board={board}
            exclude={searchExclude}
            onReveal={id => {
              const item = boardRef.current.items.find(i => i.id === id);
              if (!item) return;
              setSelected([id]);
              fit([item]);
            }}
            onMatches={(ids, current) => setMatches({ ids: new Set(ids), current })}
            onClose={() => setSearchOpen(false)}
          />
        </div>
      )}
      {presentPanel && !presenting && (
        <AnchoredPanel anchor="present" placement="below">
          <PresentationPanel
            board={board}
            onMove={(id, delta) => update(moveInPresentation(boardRef.current, id, delta))}
            onStart={startPresenting}
            onShow={f => {
              setSelected([f.id]);
              fit([f]);
            }}
            onClose={() => setPresentPanel(false)}
          />
        </AnchoredPanel>
      )}
      {presenting && (
        <PresentOverlay
          board={board}
          start={presenting.start}
          size={size}
          onCamera={setCamera}
          onExit={stopPresenting}
        />
      )}
      {cropId &&
        (() => {
          const item = board.items.find(i => i.id === cropId),
            asset = item && assets[item.assetId!];
          return item && asset ? (
            <CropEditor
              key={cropId}
              item={item}
              asset={asset}
              onApply={(crop: Crop | null) => {
                update(applyCrop(boardRef.current, item.id, crop, asset));
                setCropId(null);
              }}
              onClose={() => setCropId(null)}
            />
          ) : null;
        })()}
      {codeId && board.items.find(i => i.id === codeId) && (
        <CodeEditorDialog
          key={codeId}
          item={board.items.find(i => i.id === codeId)!}
          onApply={(text, language) => {
            update({
              ...boardRef.current,
              items: boardRef.current.items.map(i => (i.id === codeId ? { ...i, text, language } : i)),
            });
            setCodeId(null);
          }}
          onClose={() => setCodeId(null)}
        />
      )}
    </>
  );
}
