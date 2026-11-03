// Shape packs (item 80): Flowchart, Callouts, UML, BPMN, ERD and extra basic shapes.
// Evidence: the More shapes library lists Basic Shapes, Flowchart, Callouts, UML, BPMN and ERD packs.
// Geometry is independently authored. Every shape has a closed outline used for hit-testing and connector
// attachment; curved outlines are sampled. Interior strokes (`detail`) are drawn on top without fill.
import type { Point } from './model.ts';

type Box = { x: number; y: number; w: number; h: number };
export type PackName = 'Basic' | 'Flowchart' | 'Callouts' | 'UML' | 'BPMN' | 'ERD';
type Def = {
  label: string;
  pack: PackName;
  size: [number, number];
  outline: (w: number, h: number) => Point[];
  /** Rendered path when it differs from the outline (for example a stick figure). */
  path?: (w: number, h: number) => string;
  detail?: (w: number, h: number) => string;
  text?: (w: number, h: number) => Box;
};

const P = (x: number, y: number): Point => ({ x, y });
const inset = (w: number, h: number, l: number, t: number, r = l, b = t): Box => ({
  x: l,
  y: t,
  w: Math.max(20, w - l - r),
  h: Math.max(20, h - t - b),
});
const centered = (w: number, h: number, fx: number, fy: number, cy = 0.5): Box => ({
  x: (w * (1 - fx)) / 2,
  y: h * cy - (h * fy) / 2,
  w: w * fx,
  h: h * fy,
});
/** Sampled elliptical arc from angle a to b (radians, y-down). */
function arc(cx: number, cy: number, rx: number, ry: number, a: number, b: number, steps = 16): Point[] {
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = a + ((b - a) * k) / steps;
    return P(cx + rx * Math.cos(t), cy + ry * Math.sin(t));
  });
}
const ellipse = (w: number, h: number) => arc(w / 2, h / 2, w / 2, h / 2, 0, Math.PI * 2, 48).slice(0, -1);
const diamond = (w: number, h: number) => [P(w / 2, 0), P(w, h / 2), P(w / 2, h), P(0, h / 2)];
const rect = (w: number, h: number) => [P(0, 0), P(w, 0), P(w, h), P(0, h)];
/** Wavy bottom edge from right to left. */
function wave(w: number, h: number, depth: number): Point[] {
  return Array.from({ length: 25 }, (_, k) => {
    const x = w - (w * k) / 24;
    return P(x, h - depth - depth * Math.sin(((w - x) / w) * Math.PI * 2));
  });
}
const pathOf = (points: Point[]) => `M${points.map(p => `${p.x},${p.y}`).join(' L')} Z`;
const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx},${cy} A${rx},${ry} 0 1 0 ${cx + rx},${cy} A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
const fold = (w: number, h: number) => Math.min(w, h) * 0.22;
const docText = (w: number, h: number) => inset(w, h, 12, 10, 12, h * 0.2);

const defs = {
  // Basic shapes and arrows
  pentagon: {
    label: 'Pentagon',
    pack: 'Basic',
    size: [200, 190],
    outline: (w, h) => [P(w / 2, 0), P(w, h * 0.38), P(w * 0.81, h), P(w * 0.19, h), P(0, h * 0.38)],
    text: (w, h) => centered(w, h, 0.6, 0.45, 0.58),
  },
  octagon: {
    label: 'Octagon',
    pack: 'Basic',
    size: [200, 200],
    outline: (w, h) => {
      const c = Math.min(w, h) * 0.29;
      return [P(c, 0), P(w - c, 0), P(w, c), P(w, h - c), P(w - c, h), P(c, h), P(0, h - c), P(0, c)];
    },
    text: (w, h) => centered(w, h, 0.72, 0.6),
  },
  star: {
    label: 'Star',
    pack: 'Basic',
    size: [200, 190],
    outline: (w, h) =>
      Array.from({ length: 10 }, (_, k) => {
        const t = -Math.PI / 2 + (k * Math.PI) / 5,
          r = k % 2 ? 0.4 : 1;
        return P(w / 2 + (w / 2) * r * Math.cos(t), h * 0.55 + h * 0.55 * r * Math.sin(t));
      }).map(p => P(p.x, Math.min(h, Math.max(0, p.y)))),
    text: (w, h) => centered(w, h, 0.36, 0.3, 0.56),
  },
  cross: {
    label: 'Cross',
    pack: 'Basic',
    size: [180, 180],
    outline: (w, h) => {
      const a = Math.min(w, h) / 3,
        x1 = (w - a) / 2,
        x2 = (w + a) / 2,
        y1 = (h - a) / 2,
        y2 = (h + a) / 2;
      return [
        P(x1, 0),
        P(x2, 0),
        P(x2, y1),
        P(w, y1),
        P(w, y2),
        P(x2, y2),
        P(x2, h),
        P(x1, h),
        P(x1, y2),
        P(0, y2),
        P(0, y1),
        P(x1, y1),
      ];
    },
    text: (w, h) => {
      const a = Math.min(w, h) / 3;
      return { x: (w - a) / 2, y: (h - a) / 2, w: a, h: a };
    },
  },
  trapezoid: {
    label: 'Trapezoid',
    pack: 'Basic',
    size: [230, 130],
    outline: (w, h) => [P(w * 0.2, 0), P(w * 0.8, 0), P(w, h), P(0, h)],
    text: (w, h) => inset(w, h, w * 0.2, 10),
  },
  chevron: {
    label: 'Chevron',
    pack: 'Basic',
    size: [230, 110],
    outline: (w, h) => {
      const s = Math.min(w * 0.3, h * 0.6);
      return [P(0, 0), P(w - s, 0), P(w, h / 2), P(w - s, h), P(0, h), P(s, h / 2)];
    },
    text: (w, h) => inset(w, h, Math.min(w * 0.3, h * 0.6) + 4, 10),
  },
  arrowright: {
    label: 'Block arrow',
    pack: 'Basic',
    size: [230, 120],
    outline: (w, h) => {
      const head = Math.min(w * 0.4, h * 0.8);
      return [
        P(0, h * 0.25),
        P(w - head, h * 0.25),
        P(w - head, 0),
        P(w, h / 2),
        P(w - head, h),
        P(w - head, h * 0.75),
        P(0, h * 0.75),
      ];
    },
    text: (w, h) => ({
      x: 6,
      y: h * 0.25 + 2,
      w: Math.max(20, w - Math.min(w * 0.4, h * 0.8) - 6),
      h: Math.max(20, h * 0.5 - 4),
    }),
  },
  arrowboth: {
    label: 'Double arrow',
    pack: 'Basic',
    size: [260, 120],
    outline: (w, h) => {
      const head = Math.min(w * 0.28, h * 0.8);
      return [
        P(0, h / 2),
        P(head, 0),
        P(head, h * 0.25),
        P(w - head, h * 0.25),
        P(w - head, 0),
        P(w, h / 2),
        P(w - head, h),
        P(w - head, h * 0.75),
        P(head, h * 0.75),
        P(head, h),
      ];
    },
    text: (w, h) => {
      const head = Math.min(w * 0.28, h * 0.8);
      return { x: head, y: h * 0.25 + 2, w: Math.max(20, w - head * 2), h: Math.max(20, h * 0.5 - 4) };
    },
  },
  cloud: {
    label: 'Cloud',
    pack: 'Basic',
    size: [240, 160],
    outline: (w, h) =>
      Array.from({ length: 96 }, (_, k) => {
        const t = (k / 96) * Math.PI * 2,
          r = 0.86 + 0.14 * Math.abs(Math.sin(t * 4));
        return P(w / 2 + (w / 2) * r * Math.cos(t), h / 2 + (h / 2) * r * Math.sin(t));
      }),
    text: (w, h) => centered(w, h, 0.62, 0.55),
  },
  // Callouts
  callout: {
    label: 'Speech bubble',
    pack: 'Callouts',
    size: [240, 150],
    outline: (w, h) => {
      const b = h * 0.78;
      return [P(0, 0), P(w, 0), P(w, b), P(w * 0.42, b), P(w * 0.2, h), P(w * 0.24, b), P(0, b)];
    },
    text: (w, h) => inset(w, h, 12, 10, 12, h * 0.22 + 6),
  },
  ovalcallout: {
    label: 'Oval speech bubble',
    pack: 'Callouts',
    size: [240, 160],
    outline: (w, h) => {
      const b = h * 0.8,
        from = (100 / 180) * Math.PI,
        to = (125 / 180) * Math.PI;
      return [...arc(w / 2, b / 2, w / 2, b / 2, to, from + Math.PI * 2, 44), P(w * 0.16, h)];
    },
    text: (w, h) => centered(w, h * 0.8, 0.68, 0.6),
  },
  thought: {
    label: 'Thought bubble',
    pack: 'Callouts',
    size: [240, 170],
    outline: (w, h) =>
      Array.from({ length: 96 }, (_, k) => {
        const t = (k / 96) * Math.PI * 2,
          r = 0.86 + 0.14 * Math.abs(Math.sin(t * 5));
        return P(w / 2 + (w / 2) * r * Math.cos(t), h * 0.4 + h * 0.4 * r * Math.sin(t));
      }),
    path: (w, h) =>
      pathOf(
        Array.from({ length: 96 }, (_, k) => {
          const t = (k / 96) * Math.PI * 2,
            r = 0.86 + 0.14 * Math.abs(Math.sin(t * 5));
          return P(w / 2 + (w / 2) * r * Math.cos(t), h * 0.4 + h * 0.4 * r * Math.sin(t));
        }),
      ) +
      ellipsePath(w * 0.26, h * 0.86, Math.min(w, h) * 0.06, Math.min(w, h) * 0.05) +
      ellipsePath(w * 0.17, h * 0.96, Math.min(w, h) * 0.035, Math.min(w, h) * 0.03),
    text: (w, h) => centered(w, h * 0.8, 0.62, 0.55),
  },
  // Flowchart
  document: {
    label: 'Document',
    pack: 'Flowchart',
    size: [230, 140],
    outline: (w, h) => [P(0, 0), P(w, 0), ...wave(w, h, h * 0.08)],
    text: docText,
  },
  multidoc: {
    label: 'Multiple documents',
    pack: 'Flowchart',
    size: [240, 150],
    outline: (w, h) => {
      const o = Math.min(w, h) * 0.08;
      return [
        P(o * 2, 0),
        P(w, 0),
        P(w, h - o * 2),
        P(w - o, h - o * 2),
        P(w - o, h - o),
        P(w - o * 2, h - o),
        ...wave(w - o * 2, h, h * 0.08),
        P(0, o * 2),
        P(o, o * 2),
        P(o, o),
        P(o * 2, o),
      ];
    },
    detail: (w, h) => {
      const o = Math.min(w, h) * 0.08;
      return `M0,${o * 2} H${w - o * 2} V${h - h * 0.08} M${o},${o} H${w - o} V${h - o}`;
    },
    text: (w, h) => {
      const o = Math.min(w, h) * 0.08;
      return inset(w, h, 12, o * 2 + 8, o * 2 + 12, h * 0.22);
    },
  },
  manualinput: {
    label: 'Manual input',
    pack: 'Flowchart',
    size: [230, 130],
    outline: (w, h) => [P(0, h * 0.28), P(w, 0), P(w, h), P(0, h)],
    text: (w, h) => inset(w, h, 12, h * 0.3, 12, 10),
  },
  manualop: {
    label: 'Manual operation',
    pack: 'Flowchart',
    size: [230, 130],
    outline: (w, h) => [P(0, 0), P(w, 0), P(w * 0.82, h), P(w * 0.18, h)],
    text: (w, h) => inset(w, h, w * 0.18, 10),
  },
  delay: {
    label: 'Delay',
    pack: 'Flowchart',
    size: [220, 130],
    outline: (w, h) => {
      const r = Math.min(h / 2, w / 2);
      return [P(0, 0), ...arc(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2, 20), P(0, h)];
    },
    text: (w, h) => inset(w, h, 12, 10, Math.min(h / 2, w / 2) * 0.4 + 8, 10),
  },
  display: {
    label: 'Display',
    pack: 'Flowchart',
    size: [240, 130],
    outline: (w, h) => {
      const r = Math.min(h / 2, w / 3);
      return [
        P(0, h / 2),
        P(w * 0.16, 0),
        ...arc(w - r, h / 2, r, h / 2, -Math.PI / 2, Math.PI / 2, 20),
        P(w * 0.16, h),
      ];
    },
    text: (w, h) => inset(w, h, w * 0.16, 10, Math.min(h / 2, w / 3) * 0.4 + 8, 10),
  },
  offpage: {
    label: 'Off-page connector',
    pack: 'Flowchart',
    size: [150, 150],
    outline: (w, h) => [P(0, 0), P(w, 0), P(w, h * 0.65), P(w / 2, h), P(0, h * 0.65)],
    text: (w, h) => inset(w, h, 10, 10, 10, h * 0.4),
  },
  merge: {
    label: 'Merge',
    pack: 'Flowchart',
    size: [200, 170],
    outline: (w, h) => [P(0, 0), P(w, 0), P(w / 2, h)],
    text: (w, h) => ({ x: w * 0.25, y: h * 0.05, w: Math.max(20, w * 0.5), h: Math.max(20, h * 0.45) }),
  },
  storeddata: {
    label: 'Stored data',
    pack: 'Flowchart',
    size: [230, 130],
    outline: (w, h) => {
      const r = Math.min(w * 0.15, h / 2);
      return [
        ...arc(r, h / 2, r, h / 2, -Math.PI / 2, -Math.PI * 1.5, 16),
        ...arc(w, h / 2, r, h / 2, Math.PI / 2, Math.PI * 1.5, 16),
      ];
    },
    text: (w, h) => inset(w, h, Math.min(w * 0.15, h / 2) + 6, 10),
  },
  internalstorage: {
    label: 'Internal storage',
    pack: 'Flowchart',
    size: [200, 140],
    outline: rect,
    detail: (w, h) => {
      const a = Math.min(w, h) * 0.18;
      return `M${a},0 V${h} M0,${a} H${w}`;
    },
    text: (w, h) => {
      const a = Math.min(w, h) * 0.18;
      return inset(w, h, a + 8, a + 6, 10, 10);
    },
  },
  punchcard: {
    label: 'Card',
    pack: 'Flowchart',
    size: [200, 140],
    outline: (w, h) => {
      const c = Math.min(w, h) * 0.25;
      return [P(c, 0), P(w, 0), P(w, h), P(0, h), P(0, c)];
    },
    text: (w, h) => inset(w, h, 12, Math.min(w, h) * 0.25 * 0.6 + 6, 12, 10),
  },
  summing: {
    label: 'Summing junction',
    pack: 'Flowchart',
    size: [120, 120],
    outline: ellipse,
    detail: (w, h) => {
      const dx = (w / 2) * Math.SQRT1_2,
        dy = (h / 2) * Math.SQRT1_2;
      return `M${w / 2 - dx},${h / 2 - dy} L${w / 2 + dx},${h / 2 + dy} M${w / 2 + dx},${h / 2 - dy} L${w / 2 - dx},${h / 2 + dy}`;
    },
    text: (w, h) => centered(w, h, 0.5, 0.3, 0.2),
  },
  orgate: {
    label: 'Or',
    pack: 'Flowchart',
    size: [120, 120],
    outline: ellipse,
    detail: (w, h) => `M${w / 2},0 V${h} M0,${h / 2} H${w}`,
    text: (w, h) => centered(w, h, 0.3, 0.25, 0.25),
  },
  collate: {
    label: 'Collate',
    pack: 'Flowchart',
    size: [160, 180],
    outline: (w, h) => [P(0, 0), P(w, 0), P(w / 2, h / 2), P(w, h), P(0, h), P(w / 2, h / 2)],
    text: (w, h) => ({ x: w * 0.3, y: h * 0.04, w: Math.max(20, w * 0.4), h: Math.max(20, h * 0.22) }),
  },
  sort: {
    label: 'Sort',
    pack: 'Flowchart',
    size: [180, 180],
    outline: diamond,
    detail: (w, h) => `M0,${h / 2} H${w}`,
    text: (w, h) => ({ x: w * 0.3, y: h * 0.22, w: Math.max(20, w * 0.4), h: Math.max(20, h * 0.25) }),
  },
  looplimit: {
    label: 'Loop limit',
    pack: 'Flowchart',
    size: [220, 120],
    outline: (w, h) => {
      const c = Math.min(w * 0.15, h * 0.4);
      return [P(c, 0), P(w - c, 0), P(w, c), P(w, h), P(0, h), P(0, c)];
    },
    text: (w, h) => inset(w, h, 12, Math.min(w * 0.15, h * 0.4) * 0.5 + 6, 12, 10),
  },
  // UML
  umlclass: {
    label: 'Class',
    pack: 'UML',
    size: [220, 200],
    outline: rect,
    detail: (w, h) => `M0,${h * 0.26} H${w} M0,${h * 0.63} H${w}`,
    text: (w, h) => ({ x: 8, y: 4, w: Math.max(20, w - 16), h: Math.max(20, h * 0.26 - 8) }),
  },
  actor: {
    label: 'Actor',
    pack: 'UML',
    size: [90, 170],
    outline: rect,
    path: (w, h) => {
      const fig = h * 0.74,
        r = Math.min(w * 0.22, fig * 0.14),
        cx = w / 2,
        neck = r * 2,
        hip = fig * 0.62;
      return (
        ellipsePath(cx, r, r, r) +
        ` M${cx},${neck} L${cx},${hip} M${w * 0.12},${fig * 0.34} L${w * 0.88},${fig * 0.34}` +
        ` M${cx},${hip} L${w * 0.18},${fig} M${cx},${hip} L${w * 0.82},${fig}`
      );
    },
    text: (w, h) => ({ x: 0, y: h * 0.76, w, h: Math.max(20, h * 0.24) }),
  },
  umlnote: {
    label: 'Note',
    pack: 'UML',
    size: [200, 140],
    outline: (w, h) => {
      const f = fold(w, h);
      return [P(0, 0), P(w - f, 0), P(w, f), P(w, h), P(0, h)];
    },
    detail: (w, h) => {
      const f = fold(w, h);
      return `M${w - f},0 V${f} H${w}`;
    },
    text: (w, h) => inset(w, h, 12, fold(w, h) * 0.6 + 6, 12, 10),
  },
  package: {
    label: 'Package',
    pack: 'UML',
    size: [230, 160],
    outline: (w, h) => {
      const t = Math.min(h * 0.2, 30);
      return [P(0, 0), P(w * 0.4, 0), P(w * 0.4, t), P(w, t), P(w, h), P(0, h)];
    },
    detail: (w, h) => `M0,${Math.min(h * 0.2, 30)} H${w * 0.4}`,
    text: (w, h) => inset(w, h, 12, Math.min(h * 0.2, 30) + 8, 12, 10),
  },
  component: {
    label: 'Component',
    pack: 'UML',
    size: [230, 140],
    outline: rect,
    detail: (w, h) => {
      const bw = Math.min(w * 0.12, 24),
        bh = Math.min(h * 0.13, 16),
        x = -bw / 2;
      return `M${x},${h * 0.25} h${bw} v${bh} h${-bw} Z M${x},${h * 0.62} h${bw} v${bh} h${-bw} Z`;
    },
    text: (w, h) => inset(w, h, Math.min(w * 0.12, 24) / 2 + 10, 10),
  },
  // BPMN
  startevent: {
    label: 'Start event',
    pack: 'BPMN',
    size: [90, 90],
    outline: ellipse,
    text: (w, h) => centered(w, h, 0.6, 0.5),
  },
  intermediateevent: {
    label: 'Intermediate event',
    pack: 'BPMN',
    size: [90, 90],
    outline: ellipse,
    detail: (w, h) => ellipsePath(w / 2, h / 2, w / 2 - Math.min(w, h) * 0.08, h / 2 - Math.min(w, h) * 0.08),
    text: (w, h) => centered(w, h, 0.55, 0.45),
  },
  endevent: {
    label: 'End event',
    pack: 'BPMN',
    size: [90, 90],
    outline: ellipse,
    detail: (w, h) =>
      [0.03, 0.05, 0.07]
        .map(k => ellipsePath(w / 2, h / 2, w / 2 - Math.min(w, h) * k, h / 2 - Math.min(w, h) * k))
        .join(' '),
    text: (w, h) => centered(w, h, 0.55, 0.45),
  },
  exclusivegateway: {
    label: 'Exclusive gateway',
    pack: 'BPMN',
    size: [110, 110],
    outline: diamond,
    detail: (w, h) =>
      `M${w * 0.36},${h * 0.36} L${w * 0.64},${h * 0.64} M${w * 0.64},${h * 0.36} L${w * 0.36},${h * 0.64}`,
    text: (w, h) => ({ x: w * 0.3, y: h * 0.66, w: Math.max(20, w * 0.4), h: Math.max(20, h * 0.12) }),
  },
  parallelgateway: {
    label: 'Parallel gateway',
    pack: 'BPMN',
    size: [110, 110],
    outline: diamond,
    detail: (w, h) => `M${w / 2},${h * 0.3} V${h * 0.7} M${w * 0.3},${h / 2} H${w * 0.7}`,
    text: (w, h) => ({ x: w * 0.3, y: h * 0.66, w: Math.max(20, w * 0.4), h: Math.max(20, h * 0.12) }),
  },
  dataobject: {
    label: 'Data object',
    pack: 'BPMN',
    size: [110, 140],
    outline: (w, h) => {
      const f = fold(w, h);
      return [P(0, 0), P(w - f, 0), P(w, f), P(w, h), P(0, h)];
    },
    detail: (w, h) => {
      const f = fold(w, h);
      return `M${w - f},0 V${f} H${w}`;
    },
    text: (w, h) => inset(w, h, 8, fold(w, h) + 6, 8, 8),
  },
  subprocess: {
    label: 'Sub-process',
    pack: 'BPMN',
    size: [230, 140],
    outline: (w, h) => {
      const r = Math.min(16, w / 4, h / 4),
        corner = (cx: number, cy: number, a: number) => arc(cx, cy, r, r, a, a + Math.PI / 2, 4);
      return [
        ...corner(w - r, r, -Math.PI / 2),
        ...corner(w - r, h - r, 0),
        ...corner(r, h - r, Math.PI / 2),
        ...corner(r, r, Math.PI),
      ];
    },
    detail: (w, h) => {
      const s = Math.min(18, w * 0.12, h * 0.16),
        x = w / 2 - s / 2,
        y = h - s - 6;
      return `M${x},${y} h${s} v${s} h${-s} Z M${w / 2},${y + 4} V${y + s - 4} M${x + 4},${y + s / 2} H${x + s - 4}`;
    },
    text: (w, h) => inset(w, h, 12, 10, 12, Math.min(18, w * 0.12, h * 0.16) + 12),
  },
  // ERD
  weakentity: {
    label: 'Weak entity',
    pack: 'ERD',
    size: [220, 110],
    outline: rect,
    detail: (w, h) => {
      const g = Math.min(6, w / 8, h / 8);
      return `M${g},${g} H${w - g} V${h - g} H${g} Z`;
    },
    text: (w, h) => inset(w, h, 14, 12),
  },
  multiattribute: {
    label: 'Multivalued attribute',
    pack: 'ERD',
    size: [200, 110],
    outline: ellipse,
    detail: (w, h) => {
      const g = Math.min(6, w / 8, h / 8);
      return ellipsePath(w / 2, h / 2, w / 2 - g, h / 2 - g);
    },
    text: (w, h) => centered(w, h, 0.62, 0.56),
  },
  identifyingrel: {
    label: 'Identifying relationship',
    pack: 'ERD',
    size: [200, 130],
    outline: diamond,
    detail: (w, h) => {
      const g = Math.min(10, w / 6, h / 6);
      return `M${w / 2},${g} L${w - g * 1.6},${h / 2} L${w / 2},${h - g} L${g * 1.6},${h / 2} Z`;
    },
    text: (w, h) => centered(w, h, 0.42, 0.34),
  },
} satisfies Record<string, Def>;

export type PackKind = keyof typeof defs;
export const packKinds = Object.keys(defs) as PackKind[];
export const packDef = (kind: string): Def | undefined => (defs as Record<string, Def>)[kind];
export const packOrder: PackName[] = ['Basic', 'Flowchart', 'Callouts', 'UML', 'BPMN', 'ERD'];
export { pathOf };
