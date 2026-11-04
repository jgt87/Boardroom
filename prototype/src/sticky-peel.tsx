// Frame-by-frame animation of pulling a note off a sticky stack (item 133). Rendered above the board while a
// peel runs and for the moments after it:
// - bend: the top sheet stays glued along its top strip and bends towards the pointer;
// - free: once the gesture tears it off (PeelState.live.detached), the outline springs flat into the note,
//   which tilts with the drag speed and is lifted (shadow, slight scale);
// - settle: on drop it eases onto the committed note's position and its shadow sinks;
// - return: released before tearing off, the sheet springs back and nothing is taken;
// - reveal: the pad's new top sheet curls up into its resting curl.
// Motion runs on requestAnimationFrame with a fixed-step spring (peel-motion.ts), so it looks the same at any
// frame rate. State lives in this component, so only the overlay re-renders per frame.
import { useEffect, useRef, useState } from 'react';
import type { Point } from './model';
import { useApp } from './board-app';
import { useLatest } from './use-latest';
import { STACK_CLIP, curlShapes, padScale, tintOf, undersideOf } from './specs-stickypad';
import {
  atRest,
  bentPoints,
  centreOf,
  flatPoints,
  lerpPoints,
  liftOf,
  outlinePath,
  springStep,
  tiltFor,
} from './peel-motion';
import type { PeelState, Spring } from './peel-motion';

type Phase = 'bend' | 'free' | 'settle' | 'return' | 'done';
type Run = {
  peel: PeelState;
  phase: Phase;
  pointer: Point;
  last: number;
  started: number;
  /** Smoothed pull (world units) while the sheet is still glued. */
  px: Spring;
  py: Spring;
  morph: Spring;
  tilt: Spring;
  lift: Spring;
  /** Note position while settling. */
  nx: Spring;
  ny: Spring;
  vx: number;
  reveal: Spring | null;
  settleStart: number;
};
type Frame = {
  sheet: string | null;
  transform: string;
  shadow: number;
  shift: Point;
  crease: number;
  glueY: number;
  s: number;
  fill: string;
  /** Still the pad's top sheet (bend, return): drawn with the pad's sheen; a free note is plain. */
  sheen: boolean;
  reveal: { transform: string; amount: number } | null;
  hideNote: string | null;
  hideCurl: string | null;
};

const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const spring = (x = 0): Spring => ({ x, v: 0 });

export function StickyPeel() {
  const { peeling, camera, toWorld, shown } = useApp();
  const app = useLatest({ toWorld, shown });
  const run = useRef<Run | null>(null),
    raf = useRef(0),
    [frame, setFrame] = useState<Frame | null>(null);

  // Start a run when a peel begins; when the gesture ends, let the run play its exit.
  useEffect(() => {
    const r = run.current;
    if (peeling && r?.peel !== peeling) {
      const now = performance.now();
      run.current = {
        peel: peeling,
        phase: 'bend',
        pointer: peeling.grab,
        last: now,
        started: now,
        px: spring(),
        py: spring(),
        morph: spring(),
        tilt: spring(),
        lift: spring(),
        nx: spring(),
        ny: spring(),
        vx: 0,
        reveal: null,
        settleStart: 0,
      };
      start();
    } else if (!peeling && r && (r.phase === 'bend' || r.phase === 'free')) {
      r.phase = r.peel.live.detached ? 'settle' : 'return';
      r.settleStart = performance.now();
      if (r.phase === 'settle') {
        // Continue from where the free note is drawn now.
        r.nx = spring(r.peel.sheet.x + r.pointer.x - r.peel.grab.x);
        r.ny = spring(r.peel.sheet.y + r.pointer.y - r.peel.grab.y);
      }
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peeling]);

  // Track the pointer while a peel runs (the canvas captures it, so window still sees the events bubble).
  useEffect(() => {
    if (!peeling) return;
    const move = (e: PointerEvent) => {
      const r = run.current;
      if (r && (r.phase === 'bend' || r.phase === 'free')) r.pointer = app.current.toWorld(e.clientX, e.clientY);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [peeling, app]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function start() {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    const r = run.current;
    if (!r) return;
    const dt = Math.min(0.05, Math.max(0, (now - r.last) / 1000)),
      reduced = reducedMotion(),
      { peel } = r,
      step = (sp: Spring, target: number, k?: number, c?: number) =>
        reduced ? spring(target) : springStep(sp, target, dt, k, c);
    r.last = now;
    const d = { x: r.pointer.x - peel.grab.x, y: r.pointer.y - peel.grab.y };
    if (r.phase === 'bend' && peel.live.detached) {
      r.phase = 'free';
      r.reveal = spring();
    }
    // The pull follows the pointer closely but with a little physical lag; release springs it home.
    const home = r.phase === 'return';
    r.px = step(r.px, home ? 0 : d.x, home ? 520 : 1400, home ? 22 : 75);
    r.py = step(r.py, home ? 0 : d.y, home ? 520 : 1400, home ? 22 : 75);
    // Horizontal speed of the carried note, smoothed, for its tilt.
    const vx = dt > 0 ? (r.px.v + r.vx * 4) / 5 : r.vx;
    r.vx = vx;
    const free = r.phase === 'free' || r.phase === 'settle';
    // Critically damped: the outline flattens without overshooting past the paper's real shape.
    if (free) r.morph = step(r.morph, 1, 420, 41);
    r.tilt = step(r.tilt, r.phase === 'free' ? tiltFor(vx) : 0, 260, 16);
    r.lift = step(r.lift, r.phase === 'free' ? 1 : 0, 300, 26);
    // The next sheet curls up without overshooting (an overshoot would be clamped and look like a stall).
    if (r.reveal) r.reveal = step(r.reveal, 1, 300, 35);

    const pad = app.current.shown.items.find(i => i.id === peel.pad),
      sheetRect = peel.sheet,
      pull = { x: r.px.x, y: r.py.x },
      flatAt = { x: sheetRect.x + d.x, y: sheetRect.y + d.y };
    let note = { x: flatAt.x, y: flatAt.y, ...peel.noteSize };
    if (r.phase === 'settle') {
      const committed = app.current.shown.items.find(i => i.id === peel.note);
      const target = committed ?? { x: r.nx.x, y: r.ny.x };
      r.nx = step(r.nx, target.x, 380, 30);
      r.ny = step(r.ny, target.y, 380, 30);
      note = { ...note, x: r.nx.x, y: r.ny.x };
      const rested =
        atRest(r.nx, target.x, 0.2) &&
        atRest(r.ny, target.y, 0.2) &&
        atRest(r.tilt, 0, 0.05) &&
        atRest(r.lift, 0, 0.01) &&
        atRest(r.morph, 1, 0.01);
      if (rested || now - r.settleStart > 900 || !committed) r.phase = 'done';
    }
    if (r.phase === 'return') {
      if ((atRest(r.px, 0, 0.3) && atRest(r.py, 0, 0.3)) || now - r.settleStart > 900) {
        r.phase = 'done';
        r.reveal ??= spring(0);
      }
    }

    // Outline: the glued, bent sheet, blending into the flat note once it is free.
    let points = bentPoints(sheetRect, pull, peel.grabX);
    if (r.phase !== 'bend' && r.phase !== 'return' && r.phase !== 'done') {
      const blend = r.phase === 'settle' ? 1 : r.morph.x;
      points = lerpPoints(points, flatPoints(note), Math.max(0, Math.min(1, blend)));
    }
    const lift = r.phase === 'free' || r.phase === 'settle' ? r.lift.x : liftOf(sheetRect, pull),
      c = centreOf(points),
      // Paper keeps its size: lift shows through the shadow only, never by scaling the sheet up.
      scale = 1,
      revealDone = !r.reveal || atRest(r.reveal, 1, 0.01);
    const k = pad ? padScale(pad) : 1;
    const next: Frame = {
      sheet: r.phase === 'done' ? null : outlinePath(points),
      transform: `rotate(${r.tilt.x.toFixed(3)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}) translate(${c.x.toFixed(2)} ${c.y.toFixed(2)}) scale(${scale.toFixed(4)}) translate(${(-c.x).toFixed(2)} ${(-c.y).toFixed(2)})`,
      // No shadow under a sheet at rest: it lies flat on the pad, as the pad itself draws it.
      shadow: 0.3 * Math.max(0, Math.min(1, lift)),
      shift: { x: 3 * lift, y: 4 + 10 * lift },
      crease: r.phase === 'bend' || r.phase === 'return' ? 0.16 * liftOf(sheetRect, pull) : 0,
      glueY: sheetRect.y + 0.22 * sheetRect.s,
      s: sheetRect.s,
      fill: peel.fill,
      sheen: r.phase === 'bend' || r.phase === 'return',
      reveal:
        pad && r.reveal && !revealDone
          ? { transform: `translate(${pad.x} ${pad.y}) scale(${k})`, amount: Math.max(0, Math.min(1, r.reveal.x)) }
          : null,
      hideNote: r.phase === 'free' || r.phase === 'settle' ? peel.note : null,
      // The pad's own curl stays hidden while the sheet is off it or curling back up.
      hideCurl: r.phase !== 'done' || !revealDone ? peel.pad : null,
    };
    if (r.phase === 'done' && revealDone) {
      run.current = null;
      setFrame(null);
      return;
    }
    setFrame(next);
    raf.current = requestAnimationFrame(tick);
  }

  if (!frame) return null;
  const curl = frame.reveal ? curlShapes(frame.reveal.amount) : null;
  return (
    <g className="sticky-peel" pointerEvents="none" aria-hidden="true">
      <style>
        {[
          frame.hideNote ? `[data-item="${frame.hideNote}"]{opacity:0}` : '',
          frame.hideCurl ? `[data-pad="${frame.hideCurl}"] .stickypad-curl{opacity:0}` : '',
        ].join('')}
      </style>
      <defs>
        <filter id="sticky-peel-lift" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id="sticky-peel-stack">
          <rect x={STACK_CLIP.x} y={STACK_CLIP.y} width={STACK_CLIP.w} height={STACK_CLIP.h} />
        </clipPath>
        <linearGradient id="sticky-peel-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.6" stopColor={frame.fill} />
          <stop offset="1" stopColor={tintOf(frame.fill)} />
        </linearGradient>
        <linearGradient
          id="sticky-peel-crease"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1={frame.glueY}
          x2="0"
          y2={frame.glueY + frame.s * 0.55}
        >
          <stop offset="0" stopColor="#000000" stopOpacity={frame.crease} />
          <stop offset="1" stopColor="#000000" stopOpacity={0} />
        </linearGradient>
      </defs>
      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
        {curl && frame.reveal && (
          <g className="sticky-peel-reveal" transform={frame.reveal.transform}>
            <g clipPath="url(#sticky-peel-stack)">
              <defs>
                <linearGradient id="sticky-peel-shade" gradientUnits="userSpaceOnUse" {...curl.shade}>
                  <stop offset="0" stopColor="#000000" stopOpacity={0.34} />
                  <stop offset="1" stopColor="#000000" stopOpacity={0} />
                </linearGradient>
              </defs>
              <path d={curl.shadow} fill="url(#sticky-peel-shade)" />
            </g>
            <path d={curl.sheet} fill="url(#sticky-peel-sheen)" />
            <path d={curl.edge} fill="none" stroke={undersideOf(frame.fill)} strokeOpacity={0.55} strokeWidth={1.2} />
          </g>
        )}
        {frame.sheet && (
          <g className="sticky-peel-sheet" transform={frame.transform}>
            <path
              d={frame.sheet}
              transform={`translate(${frame.shift.x.toFixed(2)} ${frame.shift.y.toFixed(2)})`}
              fill="#000000"
              fillOpacity={frame.shadow}
              filter="url(#sticky-peel-lift)"
            />
            <path
              className="sticky-peel-paper"
              d={frame.sheet}
              fill={frame.sheen ? 'url(#sticky-peel-sheen)' : frame.fill}
            />
            {frame.crease > 0 && <path d={frame.sheet} fill="url(#sticky-peel-crease)" />}
          </g>
        )}
      </g>
    </g>
  );
}
