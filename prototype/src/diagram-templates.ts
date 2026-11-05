// Diagram starter templates built from native shapes and connectors (track R2-H). Pure: no React, no DOM.
// Every connector attaches to the shapes it links, so moving a shape keeps the diagram connected.
import type { ConnectorFormat, Item, Point } from './model.ts';

export type Make = (type: Item['type'], x: number, y: number, fill?: string) => Item;
export const diagramTemplateNames = [
  'Org chart',
  'Mind map',
  'Sequence diagram',
  'ER diagram',
  'Network diagram',
  'Customer journey flow',
  'Decision tree',
] as const;
export type DiagramTemplateName = (typeof diagramTemplateNames)[number];
export const diagramTemplateInfo: { name: DiagramTemplateName; about: string; keywords: string }[] = [
  {
    name: 'Org chart',
    about: 'Reporting lines from a leader to teams, drawn with shapes',
    keywords: 'organization organisation hierarchy people reporting structure',
  },
  { name: 'Mind map', about: 'A central topic with branches and sub-topics', keywords: 'ideas branches topics radial' },
  {
    name: 'Sequence diagram',
    about: 'Participants, lifelines and the messages between them',
    keywords: 'uml lifeline messages interaction calls',
  },
  {
    name: 'ER diagram',
    about: "Entities with attributes and crow's-foot relationships",
    keywords: 'entity relationship erd database schema tables',
  },
  {
    name: 'Network diagram',
    about: 'Users, load balancer, servers and storage with generic shapes',
    keywords: 'architecture infrastructure cloud system servers topology',
  },
  {
    name: 'Customer journey flow',
    about: 'Journey stages as a connected flow with touchpoints and pain points',
    keywords: 'stages touchpoints experience service flow',
  },
  {
    name: 'Decision tree',
    about: 'Questions that branch on yes or no to outcomes',
    keywords: 'choices branches yes no outcomes logic',
  },
];

const white = '#ffffff',
  blue = '#dbe6ff',
  green = '#dcf5e3',
  yellow = '#fff4c2',
  pink = '#ffe0ea',
  violet = '#ece4ff';

/** Diagram content for one template, laid out from `at`. */
export function diagramTemplateItems(name: DiagramTemplateName, at: Point, make: Make): Item[] {
  const shape = (kind: Item['type'], text: string, x: number, y: number, w: number, h: number, fill = white): Item => ({
    ...make(kind, at.x + x, at.y + y, fill),
    text,
    w,
    h,
  });
  const link = (a: Item, b: Item, connector: ConnectorFormat = {}, text = ''): Item => ({
    ...make('arrow', 0, 0),
    from: a.id,
    to: b.id,
    text,
    connector,
  });
  /** Connector with one or two free ends, from `p` to `q` (offsets from `at`). */
  const line = (p: Point, q: Point, connector: ConnectorFormat = {}, text = ''): Item => ({
    ...make('arrow', at.x + p.x, at.y + p.y),
    w: q.x - p.x,
    h: q.y - p.y,
    text,
    connector,
  });
  const title = (text: string, x = 0, y = -90, w = 520): Item => ({
    ...make('text', at.x + x, at.y + y),
    text,
    w,
    h: 52,
    format: { bold: true, fontSize: 28 },
  });
  const tree: ConnectorFormat = { path: 'elbow', startSide: 'bottom', endSide: 'top', endHead: 'none' };
  switch (name) {
    case 'Org chart': {
      const ceo = shape('roundrect', 'Chief executive\nName', 520, 0, 220, 90, blue);
      const vps = ['Engineering', 'Product', 'Operations'].map((t, k) =>
        shape('roundrect', `Head of ${t}\nName`, 140 + k * 380, 190, 220, 90, green),
      );
      // Two reports under the first and last heads, one under the middle one.
      const xs = [40, 280, 540, 800, 1040],
        roles = ['Team lead', 'Team lead', 'Product manager', 'Team lead', 'Team lead'];
      const reports = [0, 0, 1, 2, 2].map((parent, k) => ({
        parent,
        item: shape('rectangle', roles[k], xs[k], 380, 180, 70),
      }));
      return [
        title('Org chart'),
        ceo,
        ...vps,
        ...reports.map(r => r.item),
        ...vps.map(v => link(ceo, v, tree)),
        ...reports.map(r => link(vps[r.parent], r.item, tree)),
      ];
    }
    case 'Mind map': {
      const centre = shape('ellipse', 'Central topic', 470, 290, 260, 130, violet);
      const angles = [-150, -90, -30, 30, 90, 150],
        names = ['Goals', 'Ideas', 'Questions', 'Risks', 'People', 'Next steps'],
        fills = [blue, green, yellow, pink, violet, blue];
      const items: Item[] = [title('Mind map'), centre];
      angles.forEach((deg, k) => {
        const a = (deg * Math.PI) / 180,
          cx = 600 + Math.cos(a) * 420,
          cy = 355 + Math.sin(a) * 260,
          branch = shape('roundrect', names[k], cx - 85, cy - 32, 170, 64, fills[k]);
        items.push(branch, link(centre, branch, { path: 'curved', endHead: 'none', width: 3 }));
        const out = Math.cos(a) >= 0 ? 1 : -1,
          sub = shape(
            'rectangle',
            'Sub-topic',
            cx - 70 + out * 230,
            cy - 22 + (Math.abs(Math.cos(a)) < 0.2 ? 0 : Math.sin(a) * 40),
            140,
            44,
          );
        sub.style = { borderWidth: 0 };
        items.push(sub, link(branch, sub, { path: 'curved', endHead: 'none' }));
      });
      return items;
    }
    case 'Sequence diagram': {
      const names = ['User', 'Web app', 'API', 'Database'],
        gap = 280,
        bottom = 620;
      const heads = names.map((n, k) => shape('rectangle', n, k * gap, 0, 180, 60, k ? blue : yellow));
      const mid = (k: number) => k * gap + 90;
      // Lifelines start at the participant and end free at the bottom of the diagram.
      const lifelines = heads.map((h, k) => ({
        ...line(
          { x: mid(k), y: 60 },
          { x: mid(k), y: bottom },
          { endHead: 'none', dash: 'dashed', width: 1, startSide: 'bottom' },
        ),
        from: h.id,
      }));
      const messages: [number, number, string, boolean][] = [
        [0, 1, 'Submit form', false],
        [1, 2, 'POST /orders', false],
        [2, 3, 'Insert order', false],
        [3, 2, 'Order id', true],
        [2, 1, '201 Created', true],
        [1, 0, 'Show confirmation', true],
      ];
      const arrows = messages.map(([a, b, text, reply], k) => {
        const y = 130 + k * 75,
          dir = b > a ? 1 : -1;
        return line(
          { x: mid(a) + dir * 8, y },
          { x: mid(b) - dir * 8, y },
          reply ? { dash: 'dashed', endHead: 'open' } : { endHead: 'arrow' },
          text,
        );
      });
      const activations = [1, 2].map(k => shape('rectangle', '', mid(k) - 8, 115, 16, k === 1 ? 340 : 200, white));
      return [title('Sequence diagram', 0, -80), ...heads, ...lifelines, ...activations, ...arrows];
    }
    case 'ER diagram': {
      const entity = (name: string, fields: string[], x: number, y: number, fill: string) => ({
        ...shape(
          'rectangle',
          `${name}\n${fields.map(f => `• ${f}`).join('\n')}`,
          x,
          y,
          240,
          40 + fields.length * 26,
          fill,
        ),
        format: { align: 'left' as const, valign: 'top' as const, fontSize: 14 },
      });
      const customer = entity('Customer', ['id (PK)', 'name', 'email'], 0, 0, blue),
        order = entity('Order', ['id (PK)', 'customer_id (FK)', 'placed_at', 'status'], 420, 0, green),
        line1 = entity('Order line', ['order_id (FK)', 'product_id (FK)', 'quantity'], 420, 280, yellow),
        product = entity('Product', ['id (PK)', 'name', 'price'], 840, 280, pink);
      const rel = (
        a: Item,
        b: Item,
        start: ConnectorFormat['startHead'],
        end: ConnectorFormat['endHead'],
        text: string,
      ) => link(a, b, { path: 'elbow', startHead: start, endHead: end }, text);
      return [
        title('ER diagram'),
        customer,
        order,
        line1,
        product,
        rel(customer, order, 'one', 'zero-many', 'places'),
        rel(order, line1, 'one', 'one-many', 'contains'),
        rel(product, line1, 'one', 'zero-many', 'appears in'),
      ];
    }
    case 'Network diagram': {
      const zone = { ...make('frame', at.x + 560, at.y - 30), text: 'Private network', w: 620, h: 520 };
      const users = shape('actor', 'Users', 0, 150, 90, 170),
        internet = shape('cloud', 'Internet', 150, 160, 200, 130, blue),
        balancer = shape('hexagon', 'Load balancer', 410, 180, 160, 90, violet),
        apps = [0, 1].map(k => shape('rectangle', `App server ${k + 1}`, 640, 60 + k * 240, 180, 80, green)),
        cache = shape('rectangle', 'Cache', 940, 20, 170, 70, yellow),
        db = shape('cylinder', 'Database', 940, 160, 170, 120, pink),
        storage = shape('cylinder', 'File storage', 940, 330, 170, 110, white);
      const both: ConnectorFormat = { path: 'elbow' };
      return [
        title('Network diagram'),
        zone,
        users,
        internet,
        balancer,
        ...apps,
        cache,
        db,
        storage,
        link(users, internet, { endHead: 'none' }),
        link(internet, balancer, { path: 'straight' }, 'HTTPS'),
        ...apps.map(a => link(balancer, a, both)),
        ...apps.flatMap(a => [link(a, cache, both), link(a, db, both)]),
        link(apps[1], storage, both),
      ];
    }
    case 'Customer journey flow': {
      const stages = ['Awareness', 'Consideration', 'Purchase', 'Onboarding', 'Loyalty'];
      const stageItems = stages.map((s, k) =>
        shape(k ? 'chevron' : 'roundrect', s, k * 250, 0, 220, 80, [blue, violet, green, yellow, pink][k]),
      );
      const touch = stages.map((_, k) => shape('rectangle', 'Touchpoint', k * 250 + 20, 160, 180, 70));
      const pain = stages.map((_, k) => ({
        ...make('note', at.x + k * 250 + 30, at.y + 290, '#ffa0a7'),
        text: 'Pain point',
        w: 160,
        h: 120,
      }));
      const labels = [
        { ...make('text', at.x - 200, at.y + 20), text: 'Stage', w: 160, h: 40, format: { bold: true } },
        { ...make('text', at.x - 200, at.y + 175), text: 'Touchpoints', w: 160, h: 40, format: { bold: true } },
        { ...make('text', at.x - 200, at.y + 330), text: 'Pain points', w: 160, h: 40, format: { bold: true } },
      ];
      return [
        title('Customer journey flow'),
        ...labels,
        ...stageItems,
        ...touch,
        ...pain,
        ...stageItems.slice(1).map((s, k) => link(stageItems[k], s, { path: 'straight' })),
        ...stageItems.map((s, k) => link(s, touch[k], { endHead: 'none', dash: 'dashed' })),
        link(
          touch[4],
          touch[0],
          { path: 'elbow', startSide: 'bottom', endSide: 'bottom', dash: 'dashed' },
          'Refer a friend',
        ),
      ];
    }
    case 'Decision tree': {
      const q1 = shape('diamond', 'Is it urgent?', 440, 0, 200, 130, yellow),
        q2 = shape('diamond', 'Is it important?', 120, 220, 200, 130, yellow),
        q3 = shape('diamond', 'Is it important?', 760, 220, 200, 130, yellow);
      const outcome = (text: string, x: number, fill: string) => shape('terminator', text, x, 450, 180, 70, fill);
      const doIt = outcome('Do it now', 0, green),
        delegate = outcome('Delegate', 260, blue),
        plan = outcome('Schedule it', 640, violet),
        drop = outcome('Drop it', 900, pink);
      const branch = (a: Item, b: Item, text: string) =>
        link(a, b, { path: 'elbow', startSide: 'bottom', endSide: 'top' }, text);
      return [
        title('Decision tree'),
        q1,
        q2,
        q3,
        doIt,
        delegate,
        plan,
        drop,
        branch(q1, q2, 'Yes'),
        branch(q1, q3, 'No'),
        branch(q2, doIt, 'Yes'),
        branch(q2, delegate, 'No'),
        branch(q3, plan, 'Yes'),
        branch(q3, drop, 'No'),
      ];
    }
  }
}
