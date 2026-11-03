// Doc callouts, slash commands, starter templates and Markdown import/export (item 79). Pure.
// Evidence: feature map — Doc slash prompt and four starting templates observed live; callouts and Markdown
// export (November 2025) and Markdown upload as Docs (April 2026) documented.

export const DOC_MAX = 60000;
export const DOC_FILE_MAX = 1024 * 1024;

export const calloutKinds = ['note', 'tip', 'important', 'warning'] as const;
export type CalloutKind = (typeof calloutKinds)[number];
export const calloutLabels: Record<CalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
};
/** GitHub-style alert syntax: `> [!NOTE]` followed by quoted lines. */
export const calloutMarkdown = (kind: CalloutKind, text = '') =>
  `> [!${kind.toUpperCase()}]\n${(text || calloutLabels[kind] + ' text')
    .split('\n')
    .map(l => `> ${l}`)
    .join('\n')}\n`;
/** Recognise a callout marker at the start of blockquote text. */
export function calloutOf(text: string): { kind: CalloutKind; rest: string } | null {
  const m = text.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING)\]\s*\n?([\s\S]*)$/i);
  return m ? { kind: m[1].toLowerCase() as CalloutKind, rest: m[2] } : null;
}

export type SlashCommand = {
  id: string;
  label: string;
  hint: string;
  /** execCommand-based block change, or HTML to insert. */
  block?: 'h1' | 'h2' | 'h3' | 'p' | 'blockquote' | 'pre';
  list?: 'bullet' | 'number' | 'check';
  callout?: CalloutKind;
  divider?: boolean;
};
export const slashCommands: SlashCommand[] = [
  { id: 'text', label: 'Text', hint: 'Plain paragraph', block: 'p' },
  { id: 'h1', label: 'Heading 1', hint: 'Large section heading', block: 'h1' },
  { id: 'h2', label: 'Heading 2', hint: 'Medium heading', block: 'h2' },
  { id: 'h3', label: 'Heading 3', hint: 'Small heading', block: 'h3' },
  { id: 'bullet', label: 'Bulleted list', hint: 'Simple list', list: 'bullet' },
  { id: 'number', label: 'Numbered list', hint: 'Ordered steps', list: 'number' },
  { id: 'check', label: 'Checklist', hint: 'Tasks with checkboxes', list: 'check' },
  { id: 'quote', label: 'Quote', hint: 'Quoted text', block: 'blockquote' },
  ...calloutKinds.map(kind => ({
    id: `callout-${kind}`,
    label: `${calloutLabels[kind]} callout`,
    hint: 'Highlighted block',
    callout: kind,
  })),
  { id: 'code', label: 'Code', hint: 'Monospaced block', block: 'pre' as const },
  { id: 'divider', label: 'Divider', hint: 'Horizontal line', divider: true },
];
/** Commands whose label or id contains the query (after the slash). */
export const filterSlash = (query: string) => {
  const q = query.trim().toLowerCase();
  return slashCommands.filter(c => !q || c.label.toLowerCase().includes(q) || c.id.includes(q));
};

export const docTemplates: { id: string; label: string; markdown: string }[] = [
  {
    id: 'meeting',
    label: 'Meeting notes',
    markdown:
      '# Meeting notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n\n1. \n2. \n\n## Notes\n\n- \n\n## Action items\n\n- [ ] Owner — task\n- [ ] Owner — task\n',
  },
  {
    id: 'brief',
    label: 'Project brief',
    markdown:
      '# Project brief\n\n> [!NOTE]\n> One-sentence summary of the project.\n\n## Problem\n\n## Goals\n\n- \n\n## Scope\n\n**In:** \n**Out:** \n\n## Milestones\n\n| Milestone | Date |\n| --- | --- |\n|  |  |\n\n## Risks\n\n> [!WARNING]\n> Main risk and mitigation.\n',
  },
  {
    id: 'retro',
    label: 'Retrospective',
    markdown:
      '# Retrospective\n\n## What went well\n\n- \n\n## What could be improved\n\n- \n\n## What we will try next\n\n- [ ] \n\n> [!TIP]\n> Keep actions small and give each one an owner.\n',
  },
  {
    id: 'decision',
    label: 'Decision record',
    markdown:
      '# Decision: \n\n**Status:** Proposed\n**Date:** \n\n## Context\n\n## Options considered\n\n1. \n2. \n\n## Decision\n\n> [!IMPORTANT]\n> The decision and its main reason.\n\n## Consequences\n\n- \n',
  },
];

/** Plain-text title of a Markdown document: its first heading, else the file name. */
export function docTitle(md: string, fileName = ''): string {
  const heading = md.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1];
  const base = fileName.replace(/\.(md|markdown|txt)$/i, '');
  return (heading?.replace(/[*_`[\]]/g, '').trim() || base || 'Untitled doc').slice(0, 200);
}
/** Prepare uploaded Markdown for a Doc: normalise line endings, strip a BOM and enforce the size limit. */
export function docFromMarkdown(text: string, fileName = ''): { markdown: string; title: string; truncated: boolean } {
  const clean = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  if (clean.includes(String.fromCharCode(0))) throw new Error('This file does not contain Markdown text.');
  return { markdown: clean.slice(0, DOC_MAX), title: docTitle(clean, fileName), truncated: clean.length > DOC_MAX };
}
/** Safe download name for a Doc export. */
export function markdownFileName(title: string): string {
  const base = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[^ -￿]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'doc'}.md`;
}
/** Markdown with a trailing newline, as written to an exported file. */
export const exportMarkdown = (md: string) => (md.endsWith('\n') ? md : md + '\n');
