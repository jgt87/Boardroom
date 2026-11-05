// Pinned comment threads stay open on the canvas (track G): each pinned, unresolved thread shows as a comment card
// beside its pin until it is unpinned. Cards can be collapsed to their header; that choice is kept on this device.
// Cards are screen overlays, so exports never include them.
import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, PinOff } from 'lucide-react';
import { useApp } from './board-app';
import { threadPoint } from './board-tools';
import {
  COMMENT_COLLAPSED_KEY,
  DEFAULT_COMMENT_COLOR,
  pinnedCardPosition,
  pinnedOpenThreads,
  readStoredMap,
  setPinned,
  withCollapsed,
} from './facilitation-rules';
import { MentionText } from './mention-field';

function readCollapsed(): Record<string, number> {
  try {
    return readStoredMap<number>(localStorage.getItem(COMMENT_COLLAPSED_KEY), 'number');
  } catch {
    return {};
  }
}

export function PinnedComments({ names }: { names: string[] }) {
  const { board, shown, camera, size, viewPrefs, presenting, thread, setThread, run } = useApp(),
    [collapsed, setCollapsed] = useState(readCollapsed);
  if (!viewPrefs.comments || presenting) return null;
  const openId = thread && 'id' in thread ? thread.id : undefined,
    threads = pinnedOpenThreads(board.comments, openId);
  if (!threads.length) return null;
  const toggle = (id: string, value: boolean) => {
    const next = withCollapsed(collapsed, id, value);
    setCollapsed(next);
    try {
      localStorage.setItem(COMMENT_COLLAPSED_KEY, JSON.stringify(next));
    } catch {
      /* storage is full or blocked: the card still collapses for this session */
    }
  };
  return (
    <>
      {threads.map(t => {
        const at = pinnedCardPosition(threadPoint(shown, t), camera, size);
        if (!at) return null;
        const closed = !!collapsed[t.id],
          first = t.messages[0],
          recent = t.messages.slice(-3),
          count = `${t.messages.length} ${t.messages.length === 1 ? 'comment' : 'comments'}`;
        return (
          <aside
            key={t.id}
            className={`pinned-comment floating ${closed ? 'collapsed' : ''}`}
            data-comment-card={t.id}
            style={{ left: at.left, top: at.top, borderLeftColor: t.color ?? DEFAULT_COMMENT_COLOR }}
            aria-label={`Pinned comment: ${first.text.slice(0, 60)}`}
            onPointerDown={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            <header>
              <button
                type="button"
                className="icon-button"
                aria-expanded={!closed}
                aria-label={closed ? 'Expand pinned comment' : 'Collapse pinned comment'}
                title={closed ? 'Expand' : 'Collapse'}
                onClick={() => toggle(t.id, !closed)}
              >
                {closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              </button>
              <span className="pinned-comment-title">{closed ? first.text : count}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Unpin thread"
                title="Unpin"
                onClick={() => run(b => setPinned(b, t.id, false))}
              >
                <PinOff size={14} />
              </button>
            </header>
            {!closed && (
              <>
                {t.messages.length > recent.length && (
                  <small className="pinned-comment-more">
                    {t.messages.length - recent.length} earlier{' '}
                    {t.messages.length - recent.length === 1 ? 'reply' : 'replies'}
                  </small>
                )}
                <ol>
                  {recent.map(m => (
                    <li key={m.id}>
                      <small>
                        {new Date(m.at).toLocaleString()}
                        {m.editedAt && ' · edited'}
                      </small>
                      <p>
                        <MentionText text={m.text} names={names} />
                      </p>
                      {m.reactions?.length ? (
                        <span className="pinned-comment-reactions">{m.reactions.join(' ')}</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
                <button type="button" className="pinned-comment-open" onClick={() => setThread({ id: t.id })}>
                  <MessageSquare size={13} /> Reply or edit
                </button>
              </>
            )}
          </aside>
        );
      })}
    </>
  );
}
