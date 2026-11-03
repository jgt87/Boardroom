import { assertDrawioXml, DRAWIO_XML_LIMIT, assertDrawioPng, drawioFilename } from './drawio';
import type { ImageAsset } from './model';

export async function readDrawioFile(file: File): Promise<string> {
  if (!/\.(drawio|xml)$/i.test(file.name) || file.size > DRAWIO_XML_LIMIT)
    throw new Error('Choose a .drawio or .xml file up to 2 MB.');
  const xml = await file.text();
  assertDrawioXml(xml);
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('The diagram contains malformed XML.');
  return xml;
}
export function downloadDrawio(xml: string, title: string) {
  assertDrawioXml(xml);
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = drawioFilename(title);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function drawioPreview(data: string, title: string): Promise<ImageAsset> {
  assertDrawioPng(data);
  const image = new Image();
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The diagram preview took too long to load.')), 10_000);
    image.onload = () => {
      clearTimeout(timer);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('The diagram preview could not be read.'));
    };
    image.src = data;
  });
  if (!size.width || !size.height || size.width * size.height > 32_000_000)
    throw new Error('The preview is too large. Reduce the diagram size before saving.');
  return { ...size, mime: 'image/png', data, name: title + '.png' };
}
