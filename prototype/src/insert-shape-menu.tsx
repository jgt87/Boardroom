// "Insert shape on line" with a choice of basic shape (Q12). The button opens a small menu below it; the
// connector's source shape kind is listed first and focused, so Enter inserts it straight away.
import { useEffect, useRef, useState } from 'react';
import { SquarePlus } from 'lucide-react';
import { basicKinds, shapeLabels } from './shapes';
import { insertKindFor, insertShapeOnConnector } from './diagram-gaps';
import type { BasicKind } from './diagram-gaps';
import { ShapeGlyph } from './shape-tools';
import { useApp } from './board-app';
import { useLatest } from './use-latest';
import './canvas-gaps.css';

export function InsertShapeOnLine({ connectorId, disabled }: { connectorId: string; disabled?: boolean }) {
  const { board, run, setSelected, setEditing } = useApp();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null),
    list = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const preferred = insertKindFor(board, connectorId),
    kinds: BasicKind[] = [preferred, ...basicKinds.filter(k => k !== preferred)];
  const close = useLatest(() => setOpen(false));
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close.current();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, close]);
  const insert = (kind: BasicKind) => {
    setOpen(false);
    let shapeId = '';
    run(
      b => {
        const next = insertShapeOnConnector(b, connectorId, kind);
        shapeId = next.shape.id;
        return next.board;
      },
      () => {
        setSelected([shapeId]);
        setEditing(shapeId);
      },
    );
  };
  const move = (delta: number | 'first' | 'last') => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      delta === 'first' ? 0 : delta === 'last' ? buttons.length - 1 : (i + delta + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return (
    <span className="insert-shape-wrap" ref={wrap}>
      <button
        ref={button}
        className={`icon-button ${open ? 'active' : ''}`}
        aria-label="Insert shape on line"
        title="Insert shape on line"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          // Enter, Space and Down open the menu here, before the board's Enter shortcut (edit the selection).
          if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <SquarePlus size={17} />
      </button>
      {open && (
        <div
          ref={list}
          className="insert-shape-menu floating"
          role="menu"
          aria-label="Shape to insert"
          onPointerDown={e => e.stopPropagation()}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') move(1);
            else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') move(-1);
            else if (e.key === 'Home') move('first');
            else if (e.key === 'End') move('last');
            else if (e.key === 'Escape') {
              setOpen(false);
              button.current?.focus();
            } else if (e.key === 'Tab') setOpen(false);
            else return;
            e.preventDefault();
          }}
        >
          {kinds.map(k => (
            <button key={k} role="menuitem" data-kind={k} onClick={() => insert(k)}>
              <ShapeGlyph kind={k} size={18} />
              <span>{shapeLabels[k]}</span>
              {k === preferred && <span className="insert-shape-hint">Default</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
