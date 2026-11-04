// Aggregates the pure widget specs. Each family owns its own specs-*.ts file.
import type { WidgetKind, Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import { basicSpecs } from './specs-basic.ts';
import { mediaSpecs } from './specs-media.ts';
import { diagramSpecs } from './specs-diagrams.ts';
import { engageSpecs } from './specs-engage.ts';
import { drawioSpec } from './drawio.ts';
import { activitySpecs } from './specs-activities.ts';
import { peopleSpecs } from './specs-people.ts';
import { shortcutSpec } from './specs-shortcut.ts';

export const widgetSpecs: WidgetSpec[] = [
  ...basicSpecs,
  ...mediaSpecs,
  ...diagramSpecs,
  ...engageSpecs,
  drawioSpec,
  ...activitySpecs,
  ...peopleSpecs,
  shortcutSpec,
];
const byKind = new Map(widgetSpecs.map(s => [s.kind, s]));
export const specFor = (kind: string) => byKind.get(kind as WidgetKind);
export const widgetSizes = Object.fromEntries(widgetSpecs.map(s => [s.kind, s.size])) as Record<
  WidgetKind,
  [number, number]
>;
/** Validate every widget item on import. */
export function validateWidget(item: Item): void {
  const spec = specFor(item.type);
  if (!spec) return;
  if (item.data !== undefined && (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)))
    throw new Error(`Invalid ${spec.label.toLowerCase()} data.`);
  spec.validate(item);
}
export const widgetSearchText = (item: Item) => specFor(item.type)?.searchText?.(item) ?? '';
