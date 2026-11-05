import type { WidgetSpec } from './widget-types.ts';
import { drawioEndpoint } from './drawio-endpoint.ts';
import { validateItemStatus } from './board-settings.ts';

declare const __DRAWIO_EDITOR_URL__: string | undefined;
const editor = drawioEndpoint(typeof __DRAWIO_EDITOR_URL__ === 'string' ? __DRAWIO_EDITOR_URL__ : undefined);
export const DRAWIO_ORIGIN = editor.origin;
export const DRAWIO_URL = `${editor.url}?embed=1&proto=json&ui=atlas&spin=1&libraries=1&noSaveBtn=1&saveAndExit=0&suppressNewWindows=1&lang=en`;
export const DRAWIO_XML_LIMIT = 2_000_000;
export const DRAWIO_PNG_LIMIT = 12_000_000;
export const EMPTY_DRAWIO =
  '<mxfile><diagram id="page-1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

/** Source stays inert on the host. Only the isolated editor interprets graph XML. */
export function assertDrawioXml(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > DRAWIO_XML_LIMIT)
    throw new Error('Choose a Draw.io XML diagram up to 2 MB.');
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(value))
    throw new Error('Diagram XML cannot contain document types or entity declarations.');
  const xml = value.trim().replace(/^<\?xml\s[^?]*\?>\s*/i, '');
  const root = /^<(mxfile|mxGraphModel)(?:\s|>)/.exec(xml)?.[1];
  if (!root || !xml.endsWith(`</${root}>`)) throw new Error('This file is not a Draw.io XML diagram.');
}

export function assertDrawioPng(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length > DRAWIO_PNG_LIMIT ||
    !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error('The diagram preview was not a valid PNG. Try saving again.');
}

export type DrawioMessage = {
  event: 'init' | 'load' | 'autosave' | 'save' | 'export' | 'exit';
  xml?: string;
  data?: string;
  format?: string;
  error?: string | null;
  modified?: boolean;
  exit?: boolean;
};
export function parseDrawioMessage(value: unknown): DrawioMessage | null {
  if (typeof value !== 'string' || value.length > DRAWIO_XML_LIMIT + DRAWIO_PNG_LIMIT + 100_000) return null;
  try {
    const msg = JSON.parse(value);
    if (
      !msg ||
      typeof msg !== 'object' ||
      Array.isArray(msg) ||
      !['init', 'load', 'autosave', 'save', 'export', 'exit'].includes(msg.event)
    )
      return null;
    if (msg.xml !== undefined) assertDrawioXml(msg.xml);
    if (msg.error != null && typeof msg.error !== 'string') return null;
    return msg as DrawioMessage;
  } catch {
    return null;
  }
}
export const isDrawioSender = (origin: string, source: unknown, frame: unknown) =>
  origin === DRAWIO_ORIGIN && frame != null && source === frame;
export const drawioFilename = (title: string) =>
  (Array.from(title)
    .filter(ch => ch.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .slice(0, 120) || 'diagram') + '.drawio';

export const drawioSpec: WidgetSpec = {
  kind: 'drawio',
  label: 'Draw.io Diagrams',
  description: 'Create technical diagrams and import .drawio files',
  category: 'Diagramming',
  size: [560, 360],
  init: item => ({ ...item, text: 'Draw.io diagram', fill: '#ffffff', data: { xml: EMPTY_DRAWIO } }),
  validate: item => {
    assertDrawioXml(item.data?.xml);
    validateItemStatus(item.data);
  },
};
