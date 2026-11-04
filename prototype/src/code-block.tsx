// Code blocks use public standalone packages (Prism for highlighting, react-simple-code-editor for
// editing). Evidence: the reference client's ComputedCodeWidget and library-ace chunk; no captured code is used.
import React, { useEffect, useRef, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import Editor from 'react-simple-code-editor';
import { AArrowDown, AArrowUp, ListOrdered, X } from 'lucide-react';
import type { Item } from './model';
import type { WidgetAction, WidgetCtx } from './widget-types';
import { codeLanguages } from './code-languages';
import {
  CODE_FONT_MAX,
  CODE_FONT_MIN,
  codeFontSize,
  codeFontSizes,
  codeLineNumbers,
  splitHighlightedLines,
  stepCodeFont,
  withCodeOptions,
} from './code-lines';
import type { CodeData } from './code-lines';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function highlight(code: string, language = 'plaintext'): string {
  const grammar = language !== 'plaintext' ? Prism.languages[language] : undefined;
  return grammar ? Prism.highlight(code, grammar, language) : escape(code);
}
export const languageLabel = (id?: string) =>
  codeLanguages.find(l => l.id === (id ?? 'plaintext'))?.label ?? 'Plain text';

/**
 * Read-only, highlighted rendering on the canvas. Each source line is its own row, so its number (drawn by
 * CSS from `data-line`, never part of the text) stays level with it when long lines wrap. Numbers are
 * pseudo-element content: they cannot be selected and are left out of copied text.
 */
export function CodePreview({ item }: { item: Item }) {
  const rows = splitHighlightedLines(highlight(item.text, item.language)),
    lines = rows.length,
    numbers = codeLineNumbers(item);
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{languageLabel(item.language)}</span>
        <small>
          {lines} {lines === 1 ? 'line' : 'lines'} · double-click to edit
        </small>
      </div>
      <pre
        className={`code-body${numbers ? ' with-line-numbers' : ''}`}
        data-font-size={codeFontSize(item)}
        style={
          {
            fontSize: codeFontSize(item),
            '--code-gutter': `${String(lines).length}ch`,
          } as React.CSSProperties
        }
      >
        <code className={`language-${item.language ?? 'plaintext'}`}>
          {rows.map((html, k) => (
            <span
              key={k}
              className="code-line"
              data-line={numbers ? k + 1 : undefined}
              dangerouslySetInnerHTML={{ __html: html || ' ' }}
            />
          ))}
        </code>
      </pre>
    </div>
  );
}

/** Change a code block's display options as one undo step. */
function setCodeOptions(item: Item, ctx: WidgetCtx, options: CodeData) {
  ctx.update(b => ({
    ...b,
    items: b.items.map(i => (i.id === item.id && !i.locked ? { ...i, data: withCodeOptions(i.data, options) } : i)),
  }));
}
/** Selection-bar actions for a code block: line numbers and text size. */
export function codeActions(item: Item, ctx: WidgetCtx): WidgetAction[] {
  const size = codeFontSize(item),
    numbers = codeLineNumbers(item),
    locked = !!item.locked;
  return [
    {
      label: 'Line numbers',
      icon: <ListOrdered size={17} />,
      pressed: numbers,
      disabled: locked,
      run: () => {
        setCodeOptions(item, ctx, { lineNumbers: !numbers });
        ctx.display(numbers ? 'Line numbers hidden.' : 'Line numbers shown.');
      },
    },
    {
      label: 'Smaller code text',
      icon: <AArrowDown size={17} />,
      disabled: locked || size <= CODE_FONT_MIN,
      run: () => {
        const next = stepCodeFont(size, -1);
        setCodeOptions(item, ctx, { fontSize: next });
        ctx.display(`Code text size ${next}.`);
      },
    },
    {
      label: 'Larger code text',
      icon: <AArrowUp size={17} />,
      disabled: locked || size >= CODE_FONT_MAX,
      run: () => {
        const next = stepCodeFont(size, 1);
        setCodeOptions(item, ctx, { fontSize: next });
        ctx.display(`Code text size ${next}.`);
      },
    },
  ];
}

/**
 * Source editor dialog. Keys typed here never reach whiteboard shortcuts; Tab indents and
 * Shift+Tab outdents. Done applies one undoable change; Cancel or Esc discards edits.
 */
export function CodeEditorDialog({
  item,
  onApply,
  onClose,
}: {
  item: Item;
  onApply: (text: string, language: string, options: { fontSize: number; lineNumbers: boolean }) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(item.text),
    [language, setLanguage] = useState(item.language ?? 'plaintext'),
    [fontSize, setFontSize] = useState(codeFontSize(item)),
    [lineNumbers, setLineNumbers] = useState(codeLineNumbers(item)),
    wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    wrap.current?.querySelector('textarea')?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  const lines = code.split('\n').length;
  return (
    <div
      className="format-overlay"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (code.length <= 6000) onApply(code, language, { fontSize, lineNumbers });
        }
      }}
    >
      <div className="format-editor code-editor" role="dialog" aria-modal="true" aria-label="Edit code block">
        <header>
          <div>
            <h2>Code block</h2>
            <p>Tab indents · Ctrl+Enter applies · Esc cancels</p>
          </div>
          <button className="icon-button" aria-label="Cancel editing code" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="code-toolbar">
          <label>
            Language
            <select aria-label="Code language" value={language} onChange={e => setLanguage(e.target.value)}>
              {codeLanguages.map(l => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Text size
            <select aria-label="Code text size" value={fontSize} onChange={e => setFontSize(Number(e.target.value))}>
              {codeFontSizes.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={lineNumbers} onChange={e => setLineNumbers(e.target.checked)} />
            Line numbers
          </label>
          <span>
            {lines} lines · {code.length.toLocaleString()} / 6,000 characters
          </span>
        </div>
        <div ref={wrap} className="code-editor-surface">
          <Editor
            value={code}
            onValueChange={setCode}
            highlight={c => highlight(c, language)}
            padding={14}
            tabSize={2}
            insertSpaces
            textareaId="code-source"
            textareaClassName="code-textarea"
            preClassName={`language-${language}`}
            aria-label="Code source"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
              fontSize: 14,
              lineHeight: 1.5,
              minHeight: '100%',
            }}
          />
        </div>
        {code.length > 6000 && (
          <p className="format-error" role="alert">
            Code blocks hold up to 6,000 characters.
          </p>
        )}
        <footer>
          <span>Saved locally after applying</span>
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={code.length > 6000}
            onClick={() => onApply(code, language, { fontSize, lineNumbers })}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
