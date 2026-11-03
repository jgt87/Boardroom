// Aggregates widget views. Each family owns its own widgets-*.tsx file.
import type { WidgetView } from './widget-types';
import { basicViews } from './widgets-basic';
import { mediaViews } from './widgets-media';
import { diagramViews } from './widgets-diagrams';
import { engageViews } from './widgets-engage';
import { drawioView } from './widgets-drawio';
import { activityViews } from './widgets-activities';
export const widgetViews: WidgetView[] = [
  ...basicViews,
  ...mediaViews,
  ...diagramViews,
  ...engageViews,
  drawioView,
  ...activityViews,
];
const byKind = new Map(widgetViews.map(v => [v.kind as string, v]));
export const viewFor = (kind: string) => byKind.get(kind);
