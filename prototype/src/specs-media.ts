// Media, document, embed, wireframe and prototype-screen widget specs (items 30–34, 37, 38).
// Evidence: VideoWidget, ComputedDocumentWidget (RTB_PDFJS_VIEWER), ComputeEmbedWidget (BOOKMARK,
// LIVE_EMBED), ComputedPreviewWidget (BIG_IMAGE/SMALL_IMAGE/WITHOUT_IMAGE), StructDocWidget,
// ComputeMockupWidget (WIREFRAMES_*), PrototypingScreenWidget (DEVICE_SKIN, ORIENTATION, PREVIEW).
// Pure module: only type imports from the model, so it is safe inside the model's import cycle.
import type { Board, Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import { presetSize } from './frame-presets.ts';
import { validateItemStatus } from './board-settings.ts';
import { validCuts, validRate } from './media-playback.ts';
import { docSearchText, validateDocThreads, type DocThread } from './doc-rich.ts';

// ---- URLs ------------------------------------------------------------------------------------
/** Normalise a user-entered web address to an https URL, or throw a readable error. */
export function normalizeHttpsUrl(value: string): string {
  const text = value.trim();
  if (!text) throw new Error('Enter a link.');
  if (text.length > 2048) throw new Error('Use a link shorter than 2,048 characters.');
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : 'https://' + text);
  } catch {
    throw new Error('Enter a valid web address.');
  }
  if (url.protocol !== 'https:') throw new Error('Only secure https links can be used.');
  if (!url.hostname || !url.hostname.includes('.') || url.username || url.password)
    throw new Error('Use a public https link without embedded credentials.');
  return url.href;
}
export const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export type EmbedProvider =
  'youtube' | 'vimeo' | 'maps' | 'figma' | 'codepen' | 'gdocs' | 'gsheets' | 'gslides' | 'loom' | 'office' | 'powerbi';
export const providerLabels: Record<EmbedProvider, string> = {
  youtube: 'YouTube video',
  vimeo: 'Vimeo video',
  maps: 'Map',
  figma: 'Figma file',
  codepen: 'CodePen',
  gdocs: 'Google Docs document',
  gsheets: 'Google Sheets spreadsheet',
  gslides: 'Google Slides presentation',
  loom: 'Loom video',
  office: 'Office document',
  powerbi: 'Power BI report',
};
const googleKinds: Record<string, { provider: EmbedProvider; published: string; shared: string }> = {
  document: { provider: 'gdocs', published: 'pub?embedded=true', shared: 'preview' },
  spreadsheets: { provider: 'gsheets', published: 'pubhtml?widget=true&headers=false', shared: 'preview' },
  presentation: { provider: 'gslides', published: 'embed?start=false&loop=false', shared: 'preview' },
};
export const isVideoProvider = (p: string) => p === 'youtube' || p === 'vimeo' || p === 'loom';
/**
 * Resolve an allow-listed link to its embeddable address. Anything else is rejected, so arbitrary
 * pages can never be framed. Nothing is fetched here.
 */
export function embedSource(value: string): { provider: EmbedProvider; url: string; src: string } {
  const url = new URL(normalizeHttpsUrl(value)),
    host = url.hostname.replace(/^www\./, '').replace(/^m\./, ''),
    parts = url.pathname.split('/').filter(Boolean);
  const yt = (id: string | null | undefined) => {
    if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('That YouTube link does not contain a video id.');
    return { provider: 'youtube' as const, url: url.href, src: `https://www.youtube-nocookie.com/embed/${id}` };
  };
  if (host === 'youtu.be') return yt(parts[0]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') return yt(url.searchParams.get('v'));
    if (['embed', 'shorts', 'live'].includes(parts[0])) return yt(parts[1]);
    throw new Error('Use a link to a single YouTube video.');
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id =
      host === 'player.vimeo.com' ? (parts[0] === 'video' ? parts[1] : undefined) : parts.find(p => /^\d+$/.test(p));
    if (!id || !/^\d{1,12}$/.test(id)) throw new Error('That Vimeo link does not contain a video id.');
    return { provider: 'vimeo', url: url.href, src: `https://player.vimeo.com/video/${id}` };
  }
  if (host === 'google.com' && url.pathname === '/maps/embed')
    return { provider: 'maps', url: url.href, src: url.href };
  if (host === 'figma.com' && ['file', 'design', 'proto', 'board'].includes(parts[0]) && parts[1])
    return {
      provider: 'figma',
      url: url.href,
      src: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url.href)}`,
    };
  if (
    host === 'codepen.io' &&
    parts.length >= 3 &&
    ['pen', 'embed'].includes(parts[1]) &&
    /^[\w-]+$/.test(parts[0]) &&
    /^[\w-]+$/.test(parts[2])
  )
    return {
      provider: 'codepen',
      url: url.href,
      src: `https://codepen.io/${parts[0]}/embed/${parts[2]}?default-tab=result`,
    };
  // Google documents, spreadsheets and presentations (gap b6-7 #3): published links (/d/e/<id>/pub...) and
  // shared links (/d/<id>/edit) that anyone with the link can view.
  if (host === 'docs.google.com' && googleKinds[parts[0]] && parts[1] === 'd') {
    const kind = googleKinds[parts[0]],
      published = parts[2] === 'e',
      id = published ? parts[3] : parts[2];
    if (!id || !/^[\w-]{20,200}$/.test(id)) throw new Error('That Google link does not contain a document id.');
    return {
      provider: kind.provider,
      url: url.href,
      src: `https://docs.google.com/${parts[0]}/d/${published ? `e/${id}/${kind.published}` : `${id}/${kind.shared}`}`,
    };
  }
  if (host === 'loom.com' && ['share', 'embed'].includes(parts[0])) {
    if (!parts[1] || !/^[0-9a-f]{20,64}$/i.test(parts[1]))
      throw new Error('That Loom link does not contain a video id.');
    return { provider: 'loom', url: url.href, src: `https://www.loom.com/embed/${parts[1]}` };
  }
  // Office documents shared from OneDrive or SharePoint (track J): only their embed links, which the
  // services publish for framing. Ordinary view or edit links are refused with a hint.
  if (host === 'onedrive.live.com') {
    if (parts[0] !== 'embed') throw new Error('Use the embed link from OneDrive (Share, then Embed).');
    return { provider: 'office', url: url.href, src: url.href };
  }
  if (/^[a-z0-9-]{1,63}\.sharepoint\.com$/.test(host)) {
    if (url.searchParams.get('action') !== 'embedview')
      throw new Error('Use the embed link from SharePoint (its address contains action=embedview).');
    return { provider: 'office', url: url.href, src: url.href };
  }
  // Power BI reports published to the web (/view?r=…) or embedded for an organisation (/reportEmbed?…).
  if (host === 'app.powerbi.com') {
    if (!['view', 'reportembed'].includes(parts[0]?.toLowerCase()) || parts.length !== 1)
      throw new Error('Use a Power BI publish-to-web (/view) or report embed (/reportEmbed) link.');
    return { provider: 'powerbi', url: url.href, src: url.href };
  }
  throw new Error(
    'This site cannot be embedded. Supported: YouTube, Vimeo, Loom, map embed links, Figma, CodePen, Google documents, spreadsheets and presentations, OneDrive and SharePoint Office embed links and Power BI reports. Use a bookmark for other links.',
  );
}

// ---- Wireframes and screens --------------------------------------------------------------------
export const wireframeKinds = [
  'window',
  'button',
  'input',
  'select',
  'textarea',
  'tabs',
  'toggle',
  'checkbox',
  'slider',
  'card',
  'navbar',
  'image',
  'avatar',
  'list',
] as const;
export type WireframeKind = (typeof wireframeKinds)[number];
/** Button styles and icons from the wireframe library (item 81). */
export const buttonVariants = ['solid', 'outline', 'rounded', 'link'] as const;
export type ButtonVariant = (typeof buttonVariants)[number];
export const buttonIcons = ['arrow', 'plus', 'check', 'search', 'download', 'heart'] as const;
export type ButtonIcon = (typeof buttonIcons)[number];
export const wireframeComponents: {
  /** Library key: the component, optionally followed by :variant and :icon. */
  id: string;
  component: WireframeKind;
  variant?: ButtonVariant;
  icon?: ButtonIcon;
  label: string;
  size: [number, number];
  text: string;
  options?: string[];
  state?: string | number | boolean;
}[] = [
  { id: 'window', component: 'window', label: 'Window', size: [480, 320], text: 'Window title' },
  {
    id: 'navbar',
    component: 'navbar',
    label: 'Navigation bar',
    size: [480, 56],
    text: 'Product',
    options: ['Home', 'Features', 'Pricing'],
  },
  { id: 'button', component: 'button', label: 'Button', size: [140, 44], text: 'Continue' },
  {
    id: 'button:outline',
    component: 'button',
    variant: 'outline',
    label: 'Outline button',
    size: [140, 44],
    text: 'Cancel',
  },
  {
    id: 'button:rounded',
    component: 'button',
    variant: 'rounded',
    label: 'Rounded button',
    size: [140, 44],
    text: 'Get started',
  },
  {
    id: 'button:link',
    component: 'button',
    variant: 'link',
    label: 'Link button',
    size: [120, 36],
    text: 'Learn more',
  },
  {
    id: 'button:solid:arrow',
    component: 'button',
    variant: 'solid',
    icon: 'arrow',
    label: 'Button with icon',
    size: [160, 44],
    text: 'Next',
  },
  {
    id: 'button:outline:plus',
    component: 'button',
    variant: 'outline',
    icon: 'plus',
    label: 'Outline button with icon',
    size: [160, 44],
    text: 'Add item',
  },
  { id: 'input', component: 'input', label: 'Text field', size: [240, 44], text: 'Email address' },
  {
    id: 'select',
    component: 'select',
    label: 'Dropdown',
    size: [220, 44],
    text: 'Choose…',
    options: ['Option A', 'Option B', 'Option C'],
  },
  { id: 'textarea', component: 'textarea', label: 'Text area', size: [280, 120], text: 'Write a message' },
  {
    id: 'tabs',
    component: 'tabs',
    label: 'Tabs',
    size: [360, 48],
    text: '',
    options: ['Overview', 'Details', 'Reviews'],
    state: 0,
  },
  { id: 'toggle', component: 'toggle', label: 'Toggle', size: [180, 36], text: 'Notifications', state: true },
  { id: 'checkbox', component: 'checkbox', label: 'Checkbox', size: [200, 32], text: 'Remember me', state: false },
  { id: 'slider', component: 'slider', label: 'Slider', size: [240, 36], text: 'Volume', state: 40 },
  { id: 'card', component: 'card', label: 'Card', size: [260, 180], text: 'Card title' },
  { id: 'image', component: 'image', label: 'Image placeholder', size: [240, 160], text: 'Image' },
  { id: 'avatar', component: 'avatar', label: 'Avatar', size: [64, 64], text: 'AB' },
  {
    id: 'list',
    component: 'list',
    label: 'List',
    size: [240, 180],
    text: '',
    options: ['First item', 'Second item', 'Third item'],
  },
];
/** Create a wireframe component item centred on a point. */
export function wireframeItem(
  component: WireframeKind | string,
  center: { x: number; y: number },
  make: (type: 'wireframe', x: number, y: number) => Item,
): Item {
  const def =
      wireframeComponents.find(c => c.id === component) ??
      wireframeComponents.find(c => c.component === component) ??
      wireframeComponents[2],
    item = make('wireframe', center.x - def.size[0] / 2, center.y - def.size[1] / 2);
  const data: Record<string, any> = { component: def.component };
  if (def.options) data.options = [...def.options];
  if (def.state !== undefined) data.state = def.state;
  if (def.variant && def.variant !== 'solid') data.variant = def.variant;
  if (def.icon) data.icon = def.icon;
  return { ...item, w: def.size[0], h: def.size[1], text: def.text, fill: '#ffffff', data };
}

export type ScreenDevice = 'phone' | 'tablet' | 'desktop';
export const screenDevices: { id: ScreenDevice; label: string }[] = [
  { id: 'phone', label: 'Phone' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'desktop', label: 'Desktop' },
];
export function screenSize(device: ScreenDevice, orientation: 'portrait' | 'landscape'): { w: number; h: number } {
  return presetSize(device, orientation) ?? { w: 390, h: 844 };
}
/** Change a screen's device or orientation, keeping its top-left corner. */
export function applyScreenFormat(
  board: Board,
  id: string,
  device: ScreenDevice,
  orientation: 'portrait' | 'landscape',
  background?: string,
): Board {
  return {
    ...board,
    items: board.items.map(i => {
      if (i.id !== id || i.type !== 'screen') return i;
      const size = screenSize(device, orientation);
      return {
        ...i,
        ...size,
        data: { ...i.data, device, orientation, background: background ?? i.data?.background ?? '#ffffff' },
      };
    }),
  };
}
/** Objects whose centre lies inside a screen (excluding screens and connectors), in board order. */
export function screenContents(board: Board, screenId: string): Item[] {
  const s = board.items.find(i => i.id === screenId && i.type === 'screen');
  if (!s) return [];
  return board.items.filter(
    i =>
      i.id !== s.id &&
      i.type !== 'screen' &&
      i.type !== 'arrow' &&
      !i.hidden &&
      i.x + i.w / 2 >= s.x &&
      i.x + i.w / 2 <= s.x + s.w &&
      i.y + i.h / 2 >= s.y &&
      i.y + i.h / 2 <= s.y + s.h,
  );
}
/** Screen containing an object, if any (used to resolve where a preview starts). */
export const screenOf = (board: Board, itemId: string): Item | undefined =>
  board.items.find(s => s.type === 'screen' && screenContents(board, s.id).some(i => i.id === itemId));
/** Target screen for a link, or undefined when the link points to a deleted/non-screen object. */
export const linkTarget = (board: Board, link: unknown): Item | undefined =>
  typeof link === 'string' ? board.items.find(i => i.id === link && i.type === 'screen') : undefined;

// ---- Validation helpers ------------------------------------------------------------------------
const finite = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && finite(v, min, max);
const dataImage = (v: unknown, max = 3_000_000) =>
  typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]*$/.test(v) && v.length <= max;
const fail = (message: string): never => {
  throw new Error(message);
};
const needAsset = (i: Item, what: string) => {
  if (typeof i.assetId !== 'string' || !i.assetId || i.assetId.length > 100)
    fail(`${what} is missing its file reference.`);
};
const dataOf = (i: Item) => i.data ?? {};

export const mediaSpecs: WidgetSpec[] = [
  {
    kind: 'video',
    label: 'Video',
    description: 'Add a video file to play on the board',
    category: 'Media',
    size: [480, 300],
    validate: i => {
      needAsset(i, 'A video');
      const d = dataOf(i);
      if ((d.poster !== undefined && !dataImage(d.poster)) || (d.duration !== undefined && !finite(d.duration, 0, 1e6)))
        fail('Invalid video settings.');
      // Trim (gap G14): play only from start to end, in seconds.
      if (
        d.trim !== undefined &&
        (!d.trim || !finite(d.trim.start, 0, 1e6) || !finite(d.trim.end, 0, 1e6) || d.trim.start >= d.trim.end)
      )
        fail('Invalid video trim.');
      // Cut-out ranges (track G): sorted, non-overlapping ranges skipped during playback.
      if (d.cuts !== undefined && !validCuts(d.cuts)) fail('Invalid video cuts.');
      // Remembered playback speed (P2-Q1): one of the offered speeds.
      if (d.rate !== undefined && !validRate(d.rate)) fail('Invalid video speed.');
    },
  },
  {
    kind: 'pdf',
    label: 'PDF',
    description: 'Add a PDF document with a page viewer',
    category: 'Media',
    size: [320, 440],
    validate: i => {
      needAsset(i, 'A PDF');
      const d = dataOf(i);
      if (
        !isInt(d.pages, 1, 10000) ||
        !isInt(d.page, 1, d.pages ?? 1) ||
        (d.thumb !== undefined && !dataImage(d.thumb))
      )
        fail('Invalid PDF settings.');
    },
  },
  {
    kind: 'bookmark',
    label: 'Link bookmark',
    description: 'Save a web link as a card',
    category: 'Media',
    size: [340, 220],
    init: i => ({ ...i, data: { url: '', title: '', description: '', layout: 'big' } }),
    validate: i => {
      const d = dataOf(i);
      if (typeof d.url !== 'string' || (d.url && normalizeHttpsUrl(d.url) !== d.url)) fail('Invalid bookmark link.');
      if (
        typeof d.title !== 'string' ||
        d.title.length > 300 ||
        typeof d.description !== 'string' ||
        d.description.length > 1000 ||
        !['big', 'small', 'none'].includes(d.layout)
      )
        fail('Invalid bookmark details.');
    },
    searchText: i => `${i.data?.title ?? ''} ${i.data?.description ?? ''} ${i.data?.url ?? ''}`,
  },
  {
    kind: 'embed',
    label: 'Embed',
    description: 'Embed a video, map, design file, code pen, Office document or Power BI report',
    category: 'Media',
    size: [480, 300],
    init: i => ({ ...i, data: { url: '', provider: '' } }),
    validate: i => {
      const d = dataOf(i);
      if (typeof d.url !== 'string' || typeof d.provider !== 'string') fail('Invalid embed.');
      if (d.url) {
        let source;
        try {
          source = embedSource(d.url);
        } catch {
          fail('This embed link is not supported.');
        }
        if (source!.url !== d.url || source!.provider !== d.provider) fail('Invalid embed provider.');
      } else if (d.provider) fail('Invalid embed provider.');
    },
    searchText: i => i.data?.url ?? '',
  },
  {
    kind: 'doc',
    label: 'Doc',
    description: 'Write a structured document with headings, lists and checklists',
    category: 'Essentials',
    size: [420, 520],
    init: i => ({
      ...i,
      data: { markdown: '# Untitled doc\n\nStart writing here.\n\n- [ ] First task\n- [ ] Second task\n' },
    }),
    validate: i => {
      const d = dataOf(i);
      if (typeof d.markdown !== 'string' || d.markdown.length > 60000) fail('Invalid doc content.');
      validateItemStatus(d);
      // Comment threads anchored to Doc text (R4-Q4).
      try {
        validateDocThreads(d.comments);
      } catch (e) {
        fail((e as Error).message);
      }
    },
    // Date chips read as dates and comment markers are left out; the comments themselves are searchable too.
    searchText: i =>
      [
        docSearchText(String(i.data?.markdown ?? '')),
        ...((Array.isArray(i.data?.comments) ? i.data.comments : []) as DocThread[]).flatMap(t =>
          t.messages.map(m => m.text),
        ),
      ].join('\n'),
  },
  {
    kind: 'wireframe',
    label: 'Wireframe component',
    description: 'Drag, drop and customise UI elements',
    category: 'Wireframes',
    size: [140, 44],
    hiddenInGallery: true,
    init: i => ({ ...i, fill: '#ffffff', text: 'Continue', data: { component: 'button' } }),
    validate: i => {
      const d = dataOf(i);
      if (!wireframeKinds.includes(d.component)) fail('Unknown wireframe component.');
      if (
        d.state !== undefined &&
        !(
          typeof d.state === 'boolean' ||
          (typeof d.state === 'string' && d.state.length <= 200) ||
          finite(d.state, -1e6, 1e6)
        )
      )
        fail('Invalid wireframe state.');
      if (d.link !== undefined && (typeof d.link !== 'string' || !d.link || d.link.length > 100))
        fail('Invalid wireframe link.');
      if (
        d.options !== undefined &&
        (!Array.isArray(d.options) ||
          d.options.length > 20 ||
          d.options.some((o: unknown) => typeof o !== 'string' || o.length > 100))
      )
        fail('Invalid wireframe options.');
      if (d.variant !== undefined && (d.component !== 'button' || !buttonVariants.includes(d.variant)))
        fail('Invalid button style.');
      if (d.icon !== undefined && (d.component !== 'button' || !buttonIcons.includes(d.icon)))
        fail('Invalid button icon.');
    },
    searchText: i => (i.data?.options ?? []).join(' '),
  },
  {
    kind: 'screen',
    label: 'Prototype screen',
    description: 'Visualise concepts and build interactive flows',
    category: 'Prototyping',
    size: [390, 844],
    init: i => ({
      ...i,
      fill: '#ffffff',
      text: 'Screen',
      data: { device: 'phone', orientation: 'portrait', background: '#ffffff' },
    }),
    validate: i => {
      const d = dataOf(i);
      if (
        !screenDevices.some(s => s.id === d.device) ||
        !['portrait', 'landscape'].includes(d.orientation) ||
        typeof d.background !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(d.background)
      )
        fail('Invalid prototype screen.');
    },
  },
];
