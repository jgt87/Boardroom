// Suggestions shown under a comment field while an @name is typed (gap G10).
import type { RefObject } from 'react';
import { insertMention, mentionMatches, mentionQuery, splitMentions } from './mentions';

export function MentionSuggestions({
  field,
  text,
  setText,
  names,
}: {
  field: RefObject<HTMLTextAreaElement | null>;
  text: string;
  setText: (text: string) => void;
  names: string[];
}) {
  const caret = field.current?.selectionStart ?? text.length,
    q = names.length ? mentionQuery(text, caret) : null,
    matches = q ? mentionMatches(names, q.query) : [];
  if (!q || !matches.length) return null;
  return (
    <div className="mention-list" role="group" aria-label="Mention someone">
      {matches.map(n => (
        <button
          key={n}
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            const r = insertMention(text, q.start, caret, n);
            setText(r.text);
            requestAnimationFrame(() => {
              field.current?.focus();
              field.current?.setSelectionRange(r.caret, r.caret);
            });
          }}
        >
          @{n}
        </button>
      ))}
    </div>
  );
}

/** Comment text with known @names highlighted. */
export function MentionText({ text, names }: { text: string; names: string[] }) {
  return (
    <>
      {splitMentions(text, names).map((part, k) =>
        part.mention ? (
          <mark key={k} className="mention">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
