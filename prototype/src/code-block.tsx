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
import { X } from 'lucide-react';
import type { Item } from './model';
import { codeLanguages } from './code-languages';

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function highlight(code: string, language = 'plaintext'): string {
  const grammar = language !== 'plaintext' ? Prism.languages[language] : undefined;
  return grammar ? Prism.highlight(code, grammar, language) : escape(code);
}
export const languageLabel = (id?: string) =>
  codeLanguages.find(l => l.id === (id ?? 'plaintext'))?.label ?? 'Plain text';

/** Read-only, highlighted rendering on the canvas. */
export function CodePreview({ item }: { item: Item }) {
  const lines = item.text.split('\n').length;
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{languageLabel(item.language)}</span>
        <small>
          {lines} {lines === 1 ? 'line' : 'lines'} · double-click to edit
        </small>
      </div>
      <pre className="code-body">
        <code className="code-gutter" aria-hidden="true">
          {Array.from({ length: Math.min(lines, 400) }, (_, i) => i + 1).join('\n')}
        </code>
        <code
          className={`language-${item.language ?? 'plaintext'}`}
          dangerouslySetInnerHTML={{ __html: highlight(item.text, item.language) || ' ' }}
        />
      </pre>
    </div>
  );
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
  onApply: (text: string, language: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(item.text),
    [language, setLanguage] = useState(item.language ?? 'plaintext'),
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
          if (code.length <= 6000) onApply(code, language);
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
          <button className="primary" disabled={code.length > 6000} onClick={() => onApply(code, language)}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
