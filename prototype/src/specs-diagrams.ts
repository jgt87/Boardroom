// Pure specs for structured diagram widgets: org charts (35), story maps (36), auto-layout containers (39).
import type { WidgetSpec } from './widget-types.ts';
import type { Item } from './model.ts';
import { validateOrgNodes, starterOrg } from './orgchart.ts';
import type { OrgNode } from './orgchart.ts';
import { validateStoryMap, starterStoryMap } from './storymap.ts';
import type { StoryMap } from './storymap.ts';
import { validateAutoLayout, defaultAutoLayout } from './autolayout.ts';

export const diagramSpecs: WidgetSpec[] = [
  {
    kind: 'orgchart',
    label: 'Org chart',
    description: 'Visualize organizational structures',
    category: 'Diagramming',
    size: [640, 380],
    init: (item: Item) => ({ ...item, fill: '#ffffff', text: item.text || 'Org chart', data: { nodes: starterOrg() } }),
    validate: (item: Item) => validateOrgNodes(item.data?.nodes),
    searchText: (item: Item) => ((item.data?.nodes ?? []) as OrgNode[]).map(n => `${n.name} ${n.role}`).join('\n'),
  },
  {
    kind: 'storymap',
    label: 'User story map',
    description: 'Create and edit story maps',
    category: 'Planning',
    size: [820, 420],
    init: (item: Item) => ({ ...item, fill: '#ffffff', text: item.text || 'Story map', data: starterStoryMap() }),
    validate: (item: Item) => validateStoryMap(item.data),
    searchText: (item: Item) => {
      const m = item.data as StoryMap | undefined;
      return m ? [...m.activities, ...m.releases, ...m.cards].map(x => x.title).join('\n') : '';
    },
  },
  {
    kind: 'autolayout',
    label: 'Auto-layout container',
    description: 'Arrange objects in rows or columns automatically',
    category: 'Diagramming',
    size: [520, 220],
    init: (item: Item) => ({ ...item, fill: '#ffffff', text: item.text || 'Auto layout', data: defaultAutoLayout() }),
    validate: (item: Item) => validateAutoLayout(item.data),
  },
];
