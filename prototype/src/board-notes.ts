// Board notes (track L): one Markdown document per board, edited in a docked side panel with the same rich
// text model Docs use (markdown.ts, canvas-doc.tsx). Stored as the optional `board.notes` field. Pure.
import type { Board } from './model.ts';
import { DOC_MAX } from './doc-tools.ts';

export const NOTES_MAX = DOC_MAX;

/** Validate the optional notes field of a loaded board (throws a readable error). */
export function validateNotes(b: Board): void {
  if (b.notes !== undefined && (typeof b.notes !== 'string' || b.notes.length > NOTES_MAX))
    throw new Error('Invalid board notes.');
}

/** The board with new notes; empty notes remove the field, so boards without notes stay unchanged. */
export function setBoardNotes(board: Board, markdown: string): Board {
  const text = markdown.replace(/\r\n?/g, '\n').trim().slice(0, NOTES_MAX);
  if ((board.notes ?? '') === text) return board;
  const next = { ...board };
  if (text) next.notes = text;
  else delete next.notes;
  return next;
}

export type NoteTemplate = { id: string; label: string; markdown: string };
/** Starting points for board notes; `{date}` is replaced with the day the template is applied. */
export const noteTemplates: NoteTemplate[] = [
  {
    id: 'meeting',
    label: 'Meeting notes',
    markdown:
      '# Meeting notes\n\n**Date:** {date}\n**Attendees:** \n\n## Agenda\n\n1. \n2. \n\n## Notes\n\n- \n\n## Action items\n\n- [ ] Owner — task\n',
  },
  {
    id: 'retro',
    label: 'Retro notes',
    markdown:
      '# Retro notes\n\n**Date:** {date}\n\n## What went well\n\n- \n\n## What could be better\n\n- \n\n## Actions\n\n- [ ] Owner — action\n',
  },
  {
    id: 'decisions',
    label: 'Decision log',
    markdown:
      '# Decision log\n\n## {date} — Decision title\n\n**Status:** Proposed\n**Owner:** \n**Context:** \n**Decision:** \n\n> [!TIP]\n> Add a new heading for each decision, newest first.\n',
  },
  {
    id: 'one-on-one',
    label: '1:1',
    markdown:
      '# 1:1\n\n**Date:** {date}\n\n## Check-in\n\n- \n\n## Topics\n\n- \n\n## Feedback\n\n- \n\n## Follow-ups\n\n- [ ] \n',
  },
];
/** A local calendar date as YYYY-MM-DD. */
export const isoDay = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
/** The template's Markdown with its date filled in. */
export const noteTemplateMarkdown = (t: NoteTemplate, now: Date) => t.markdown.replace(/\{date\}/g, isoDay(now));
/** Templates ready to apply today (for the editor's template menu). */
export const noteTemplatesFor = (now: Date): NoteTemplate[] =>
  noteTemplates.map(t => ({ ...t, markdown: noteTemplateMarkdown(t, now) }));

/** Download name for exported notes: "<board title> notes.md". */
export function notesFileName(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[^ -￿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
  return `${base || 'Board'} notes.md`;
}
