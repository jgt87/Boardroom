import React from 'react';
import { boardPeople } from './card-tools';
import { createItem, colors } from './model';
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
import { applyCrop, drawableAsset } from './images';
import { CropEditor } from './image-tools';
import { setNoteEmoji, convertNote } from './notes';
import { EmojiPicker, ConvertPanel } from './note-extras';
import { SearchPanel } from './search-panel';
import { PresentationPanel, PresentOverlay } from './presentation';
import { TalktrackPanel, PhotoboothPanel, StickiesPanel } from './capture-panels';
import { placeNotes } from './sticky-detect';
import { validateDiagram } from './diagram-validation';
import { sortFramesByPosition } from './frame-workflow';
import {
  editTemplate,
  loadTemplates,
  rememberTemplateUse,
  removeTemplate,
  storeTemplates,
  templatePayload,
  userUseKey,
} from './user-templates';
import { starterUseKey } from './starter-templates';
import { useLibraryFiles } from './use-library-files';
import { pastePayload } from './clipboard';
import { moveInPresentation, setFrameNotes, setHiddenSlide, replaceText } from './navigation';
import {
  editMessage,
  setPinned,
  toggleReaction,
  renameVotingResult,
  deleteVotingResult,
  voteLabel,
  votingResultText,
  setCommentColor,
} from './facilitation-rules';
import { VotingClock } from './facilitation-actions';
import { PreviewContext, PrototypePreview } from './prototype-preview';
import { MarkdownPastePanel } from './markdown-paste';
import { markdownToItems } from './markdown';
import { CodeEditorDialog } from './code-block';
import { withCodeOptions } from './code-lines';
import { ReactionsPanel, AuthorsPanel } from './collab-extras';
import {
  startVoting,
  endVoting,
  castVote,
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
  ValidationPanel,
  TemplatesPanel,
} from './board-panels';
import { viewFor } from './widgets';
import type { WidgetCtx } from './widget-types';
import { useApp } from './board-app';
import { MermaidLinkPanel } from './mermaid-link-panel';
import { PinnedComments } from './pinned-comments';

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
    templatesFrom,
    insertCaptured,
    insertImages,
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
    setPresenting,
    svg,
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
  // People offered for @mentions in comments (gap G10).
  const mentionNames = [...boardPeople(board), ...(authorName ? [authorName] : [])];
  // Saved templates are read when the panel opens, so a template saved from Export appears immediately.
  const [userTemplates, setUserTemplates] = React.useState(loadTemplates),
    [templatesFor, setTemplatesFor] = React.useState(facil);
  if (facil !== templatesFor) {
    setTemplatesFor(facil);
    if (facil === 'templates') setUserTemplates(loadTemplates());
  }
  const libraryFiles = useLibraryFiles();
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
                display((err as Error).message, undefined, 'error');
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
            onStart={(budget, scope, options) =>
              run(b =>
                startVoting(
                  b,
                  scope === 'selection'
                    ? expandGroups(b, selected)
                    : b.items.filter(i => !['arrow', 'frame', 'pen'].includes(i.type) && !i.hidden).map(i => i.id),
                  budget,
                  options,
                ),
              )
            }
            onRenameResult={(index, name) => run(b => renameVotingResult(b, index, name))}
            onDeleteResult={index => run(b => deleteVotingResult(b, index))}
            onPlaceResult={index => {
              const result = boardRef.current.votingResults?.[index];
              if (!result) return;
              const c = toWorld(size.w / 2, size.h / 2),
                text = { ...createItem('text', c.x - 160, c.y - 100), w: 320, text: votingResultText(result) };
              update({ ...boardRef.current, items: [...boardRef.current.items, text] });
              setSelected([text.id]);
              display('Voting results placed on the board.');
            }}
            onTableResult={index => {
              const c = toWorld(size.w / 2, size.h / 2);
              // The Table import code loads on demand, as it does for CSV files.
              void import('./facilitation-results').then(({ votingResultToTable }) => {
                try {
                  const made = votingResultToTable(boardRef.current, index, { x: c.x, y: c.y, w: 0, h: 0 });
                  update(made.board);
                  setSelected([made.item.id]);
                  display('Voting results added as a Table beside the voted objects.');
                } catch (err) {
                  display((err as Error).message, undefined, 'error');
                }
              });
            }}
            onEnd={() => {
              try {
                const r = endVoting(boardRef.current, voteLabel);
                update(r.board);
                display('Voting ended. Results are saved with the board.');
              } catch (err) {
                display((err as Error).message, undefined, 'error');
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
        // Beside the Templates rail button when opened from the rail, gallery or palette (closing on a press
        // outside, like the other rail pop-outs); below Collaborate and review when opened from that menu.
        <AnchoredPanel
          anchor={templatesFrom === 'rail' ? 'templates' : 'facilitate'}
          placement={templatesFrom === 'rail' ? 'right' : 'below'}
          onDismiss={templatesFrom === 'rail' ? () => setFacil(null) : undefined}
        >
          <TemplatesPanel
            userTemplates={userTemplates}
            onDeleteUser={id => {
              const next = removeTemplate(userTemplates, id);
              if (storeTemplates(next)) setUserTemplates(next);
            }}
            onEditUser={(id, patch) => {
              const next = editTemplate(userTemplates, id, patch);
              if (storeTemplates(next)) setUserTemplates(next);
              else display('The template could not be saved (browser storage is full).');
            }}
            onExport={libraryFiles.exportTemplateFile}
            onImport={file =>
              void libraryFiles.importTemplateFile(file).then(next => {
                if (next) setUserTemplates(next);
              })
            }
            onInsertUser={t => {
              const payload = templatePayload(t);
              if (!payload) return display('This template can no longer be read.');
              rememberTemplateUse(userUseKey(t.id));
              const c = toWorld(size.w / 2, size.h / 2),
                result = pastePayload(boardRef.current, payload, {
                  x: c.x - payload.bounds.w / 2,
                  y: c.y - payload.bounds.h / 2,
                });
              update(result.board);
              setSelected(result.ids);
              setFacil(null);
              fit(result.board.items.filter(i => result.ids.includes(i.id)));
            }}
            onChoose={(name: TemplateName) => {
              rememberTemplateUse(starterUseKey(name));
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
      {facil === 'stickies' && (
        <AnchoredPanel anchor="facilitate" placement="below">
          <StickiesPanel
            palette={colors}
            onCreate={(found, photo) => {
              const origin = toWorld(size.w / 2 - 200, size.h / 2 - 200),
                notes = placeNotes(found, origin).map(p => ({ ...createItem('note', p.x, p.y, p.color), text: '' }));
              update({ ...boardRef.current, items: [...boardRef.current.items, ...notes] });
              setSelected(notes.map(n => n.id));
              setFacil(null);
              fit(notes);
              if (photo) void insertImages([photo], { x: origin.x - 520, y: origin.y });
              display(
                `Added ${notes.length} sticky note${notes.length === 1 ? '' : 's'}. Double-click a note to type its text.`,
              );
            }}
            onClose={() => setFacil(null)}
          />
        </AnchoredPanel>
      )}
      {facil === 'validation' && (
        <AnchoredPanel anchor="facilitate" placement="below">
          <ValidationPanel
            issues={validateDiagram(board)}
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
      {(facil === 'talktrack' || facil === 'photobooth') && (
        <AnchoredPanel anchor="facilitate" placement="below">
          {facil === 'talktrack' ? (
            <TalktrackPanel
              onSave={file => {
                void insertCaptured(file);
                setFacil(null);
              }}
              onClose={() => setFacil(null)}
            />
          ) : (
            <PhotoboothPanel
              onSave={file => {
                void insertCaptured(file);
                setFacil(null);
              }}
              onClose={() => setFacil(null)}
            />
          )}
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
      <VotingClock />
      <PinnedComments names={mentionNames} />
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
                  key={existing.id}
                  thread={existing}
                  names={mentionNames}
                  onReply={text => run(b => replyThread(b, existing.id, text))}
                  onEdit={(messageId, text) => run(b => editMessage(b, existing.id, messageId, text))}
                  onPin={pinned => run(b => setPinned(b, existing.id, pinned))}
                  onColor={color => run(b => setCommentColor(b, existing.id, color))}
                  onReact={(messageId, emoji) => run(b => toggleReaction(b, existing.id, messageId, emoji))}
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
                  names={mentionNames}
                  onAdd={text => {
                    const item = loose.itemId ? boardRef.current.items.find(i => i.id === loose.itemId) : undefined;
                    try {
                      const r = addThread(boardRef.current, { x: loose.x, y: loose.y }, text, item);
                      update(r.board);
                      setThread({ id: r.thread.id });
                    } catch (err) {
                      display((err as Error).message, undefined, 'error');
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
            onReplace={(ids, find, replacement, matchCase) =>
              run(b => {
                const r = replaceText(b, ids, find, replacement, matchCase);
                display(
                  r.count
                    ? `Replaced ${r.count} ${r.count === 1 ? 'match' : 'matches'} in ${r.objects} ${r.objects === 1 ? 'object' : 'objects'}.`
                    : 'No exact matches to replace (locked objects are skipped).',
                );
                return r.board;
              })
            }
            onClose={() => setSearchOpen(false)}
          />
        </div>
      )}
      {presentPanel && !presenting && (
        <AnchoredPanel anchor="present" placement="below">
          <PresentationPanel
            board={board}
            onMove={(id, delta) => update(moveInPresentation(boardRef.current, id, delta))}
            onSort={() => {
              update(sortFramesByPosition(boardRef.current));
              display('Frames are now ordered by position.');
            }}
            onStart={startPresenting}
            onHide={(id, hidden) => run(b => setHiddenSlide(b, id, hidden))}
            onNotes={(id, notes) => run(b => setFrameNotes(b, id, notes))}
            onShow={f => {
              setSelected([f.id]);
              fit([f]);
            }}
            onAdd={() => {
              const c = toWorld(size.w / 2, size.h / 2),
                count = boardRef.current.items.filter(i => i.type === 'frame').length,
                frame = { ...createItem('frame', c.x - 320, c.y - 180), w: 640, h: 360, text: `Frame ${count + 1}` };
              update({ ...boardRef.current, items: [frame, ...boardRef.current.items] });
              setSelected([frame.id]);
              fit([frame]);
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
          getOrigin={() => {
            const r = svg.current?.getBoundingClientRect();
            return r ? { x: r.left, y: r.top } : { x: 0, y: 0 };
          }}
          onCanvas={frame => {
            setPresenting(null);
            setSelected([frame.id]);
          }}
          timerOn={timerOn}
          onTimer={() => setTimerOn(!timerOn)}
          onStartVote={ids => {
            try {
              update(startVoting(boardRef.current, ids, 3));
              display('Voting started on this slide: 3 votes. Use + and − on each object.');
            } catch (err) {
              display((err as Error).message, undefined, 'error');
            }
          }}
          onEndVote={() => {
            try {
              update(endVoting(boardRef.current, voteLabel).board);
              display('Voting ended. Results are saved with the board.');
            } catch (err) {
              display((err as Error).message, undefined, 'error');
            }
          }}
          onVote={(id, delta) => {
            try {
              update(castVote(boardRef.current, id, delta));
            } catch (err) {
              display((err as Error).message, undefined, 'error');
            }
          }}
        />
      )}
      {cropId &&
        (() => {
          const item = board.items.find(i => i.id === cropId),
            asset = item && assets[item.assetId!];
          return item && asset && drawableAsset(asset) ? (
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
          onApply={(text, language, options) => {
            update({
              ...boardRef.current,
              items: boardRef.current.items.map(i =>
                i.id === codeId ? { ...i, text, language, data: withCodeOptions(i.data, options) } : i,
              ),
            });
            setCodeId(null);
          }}
          onClose={() => setCodeId(null)}
        />
      )}
      <MermaidLinkPanel />
    </>
  );
}
