// Contract between the board and widget families (items 21–50).
// Pure specs (no React) live in specs-*.ts so the model and tests can use them; views live in widgets-*.tsx.
import type { Board, Item, WidgetKind, ImageAsset } from './model.ts';

export type WidgetCategory =
  'Essentials' | 'Media' | 'Diagramming' | 'Planning' | 'Collaboration' | 'Wireframes' | 'Prototyping';

/** Pure description of a widget kind. `validate` throws an Error with a user-readable message. */
export type WidgetSpec = {
  kind: WidgetKind;
  label: string;
  description: string;
  category: WidgetCategory;
  /** Default width and height for createItem. */
  size: [number, number];
  /** Fill in default `data` (and text) for a newly created item. Must be deterministic apart from ids. */
  init?: (item: Item) => Item;
  /** Validate `item.data` (and any kind-specific fields) on import. */
  validate: (item: Item) => void;
  /** Extra text that board search should match (e.g. back face, grid cells, node names). */
  searchText?: (item: Item) => string;
  /** Hidden from the tool gallery (created another way, e.g. wireframe components are listed individually). */
  hiddenInGallery?: boolean;
};

/** State of the prototype click-through preview (item 38); undefined when editing. */
export type PreviewState = {
  screenId: string;
  values: Record<string, string | number | boolean>;
  setValue: (id: string, v: string | number | boolean) => void;
  go: (screenId: string) => void;
};

export type WidgetCtx = {
  board: Board;
  assets: Record<string, ImageAsset>;
  /** Store a new immutable media asset; callers commit the returned id with their change. */
  storeAsset: (asset: ImageAsset) => Promise<string>;
  zoom: number;
  selected: boolean;
  /** Apply a board change as one undo step. */
  update: (change: (b: Board) => Board) => void;
  /** Show a transient status message. */
  display: (message: string) => void;
  preview?: PreviewState;
};

export type WidgetAction = {
  label: string;
  icon?: React.ReactNode;
  run: () => void;
  pressed?: boolean;
  disabled?: boolean;
};

/** React side of a widget kind. */
export type WidgetView = {
  kind: WidgetKind;
  /** 'html' renders inside a foreignObject sized to the item; 'svg' renders raw SVG in item-local coordinates. */
  mode: 'html' | 'svg';
  Render: (props: { item: Item; ctx: WidgetCtx }) => React.ReactNode;
  /** Focus editor opened on double-click / Enter. Apply changes with ctx.update once (one undo step). */
  Editor?: (props: { item: Item; ctx: WidgetCtx; onClose: () => void }) => React.ReactNode;
  /** Buttons shown in the selection bar when exactly this item is selected. */
  actions?: (item: Item, ctx: WidgetCtx) => WidgetAction[];
  /** Render receives pointer events (elements must stop pointerdown propagation themselves). */
  interactive?: boolean;
  /** Double-click edits item.text inline with the standard text editor instead of opening Editor. */
  textEdit?: boolean;
  /** Creation from a local file (media kinds). The board stores `asset` in IndexedDB under a new assetId. */
  fromFile?: {
    accept: string;
    load: (
      file: File,
    ) => Promise<{ asset: ImageAsset; data: Record<string, any>; size: [number, number]; text?: string }>;
  };
};
