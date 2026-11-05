// Image crop masks (track G): the outline an image is clipped to, drawn inside the image's own box so exports
// that clone the canvas carry it. Pure: no React, no DOM, and no runtime imports (model-ext validates with it).

export const imageMasks = ['circle', 'rounded', 'triangle', 'hexagon', 'star', 'heart'] as const;
export type ImageMask = (typeof imageMasks)[number];
export const isImageMask = (v: unknown): v is ImageMask => (imageMasks as readonly unknown[]).includes(v);
export const maskLabels: Record<ImageMask, string> = {
  circle: 'Circle',
  rounded: 'Rounded rectangle',
  triangle: 'Triangle',
  hexagon: 'Hexagon',
  star: 'Star',
  heart: 'Heart',
};

const n = (v: number) => Math.round(v * 100) / 100;
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')} Z`;

/** SVG path of a mask outline in a w×h box (the circle is the inscribed ellipse). */
export function maskPath(mask: ImageMask, w: number, h: number): string {
  switch (mask) {
    case 'circle': {
      const rx = w / 2,
        ry = h / 2;
      return `M0,${n(ry)} A${n(rx)},${n(ry)} 0 1 0 ${n(w)},${n(ry)} A${n(rx)},${n(ry)} 0 1 0 0,${n(ry)} Z`;
    }
    case 'rounded': {
      const r = n(Math.min(w, h) * 0.2);
      return (
        `M${r},0 H${n(w - r)} A${r},${r} 0 0 1 ${n(w)},${r} V${n(h - r)} A${r},${r} 0 0 1 ${n(w - r)},${n(h)}` +
        ` H${r} A${r},${r} 0 0 1 0,${n(h - r)} V${r} A${r},${r} 0 0 1 ${r},0 Z`
      );
    }
    case 'triangle':
      return poly([
        [w / 2, 0],
        [w, h],
        [0, h],
      ]);
    case 'hexagon':
      return poly([
        [w * 0.25, 0],
        [w * 0.75, 0],
        [w, h / 2],
        [w * 0.75, h],
        [w * 0.25, h],
        [0, h / 2],
      ]);
    case 'star': {
      // Five points; scaled vertically so the star fills the box from top to bottom.
      const pts: [number, number][] = [],
        top = 1,
        bottom = Math.sin((54 * Math.PI) / 180);
      for (let k = 0; k < 10; k++) {
        const a = ((-90 + 36 * k) * Math.PI) / 180,
          r = k % 2 ? 0.4 : 1;
        pts.push([w / 2 + (r * w * Math.cos(a)) / 2, ((r * Math.sin(a) + top) / (top + bottom)) * h]);
      }
      return poly(pts);
    }
    case 'heart': {
      const X = (v: number) => n(v * w),
        Y = (v: number) => n(v * h);
      return (
        `M${X(0.5)},${Y(0.22)} C${X(0.5)},${Y(0.06)} ${X(0.34)},${Y(0)} ${X(0.24)},${Y(0)}` +
        ` C${X(0.1)},${Y(0)} ${X(0)},${Y(0.12)} ${X(0)},${Y(0.3)}` +
        ` C${X(0)},${Y(0.56)} ${X(0.3)},${Y(0.76)} ${X(0.5)},${Y(1)}` +
        ` C${X(0.7)},${Y(0.76)} ${X(1)},${Y(0.56)} ${X(1)},${Y(0.3)}` +
        ` C${X(1)},${Y(0.12)} ${X(0.9)},${Y(0)} ${X(0.76)},${Y(0)}` +
        ` C${X(0.66)},${Y(0)} ${X(0.5)},${Y(0.06)} ${X(0.5)},${Y(0.22)} Z`
      );
    }
  }
}
