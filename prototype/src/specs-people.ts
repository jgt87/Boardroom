// People and User card widgets (item 95). Pure specs: local profiles only, no accounts or network.
import type { Item } from './model.ts';
import type { WidgetSpec } from './widget-types.ts';
import { cleanAuthor, isValidAuthor } from './authors.ts';

export type Person = { id: string; name: string; role?: string; email?: string; color: string };
export type PeopleData = { title: string; members: Person[] };
export type UserCardData = { name: string; role: string; email: string; team: string; color: string };

export const PEOPLE_MAX = 50;
export const personColors = ['#4262ff', '#2c9f5b', '#e2a01b', '#d6455d', '#8e5cd9', '#1aa3b8', '#52525b', '#c2410c'];
const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const short = (v: unknown, max: number) =>
  v === undefined || (typeof v === 'string' && v.length <= max && !/[<>]/.test(v));
const email = (v: unknown) =>
  v === undefined || v === '' || (typeof v === 'string' && v.length <= 254 && /^[^\s@<>]+@[^\s@<>]+$/.test(v));
const fail = (message: string): never => {
  throw new Error(message);
};

/** A stable colour for a name, so the same person keeps the same avatar colour. */
export function colorFor(name: string): string {
  let h = 0;
  for (const ch of cleanAuthor(name)) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return personColors[h % personColors.length]!;
}

/** Add a member by name (ignored when empty or already present, case-insensitively). */
export function addMember(data: PeopleData, name: string, id: string, role = ''): PeopleData {
  const clean = cleanAuthor(name);
  if (!clean || data.members.length >= PEOPLE_MAX) return data;
  if (data.members.some(m => m.name.toLowerCase() === clean.toLowerCase())) return data;
  const member: Person = { id, name: clean, color: colorFor(clean) };
  const r = cleanAuthor(role);
  if (r) member.role = r;
  return { ...data, members: [...data.members, member] };
}

export const removeMember = (data: PeopleData, id: string): PeopleData => ({
  ...data,
  members: data.members.filter(m => m.id !== id),
});

export const peopleSpecs: WidgetSpec[] = [
  {
    kind: 'people',
    label: 'People',
    description: 'Show who is working on this board',
    category: 'Collaboration',
    size: [320, 132],
    init: (i: Item) => ({ ...i, fill: '#ffffff', data: { title: 'Team', members: [] } satisfies PeopleData }),
    validate: (i: Item) => {
      const d = (i.data ?? {}) as PeopleData;
      if (!short(d.title, 80) || typeof d.title !== 'string') fail('Invalid people title.');
      if (!Array.isArray(d.members) || d.members.length > PEOPLE_MAX)
        fail(`A people list holds up to ${PEOPLE_MAX} people.`);
      for (const m of d.members)
        if (
          !m ||
          typeof m.id !== 'string' ||
          !isValidAuthor(m.name) ||
          !short(m.role, 80) ||
          !email(m.email) ||
          !hex(m.color)
        )
          fail('Invalid person in people list.');
    },
    searchText: (i: Item) =>
      ((i.data as PeopleData | undefined)?.members ?? []).map(m => `${m.name} ${m.role ?? ''}`).join(' '),
  },
  {
    kind: 'usercard',
    label: 'User card',
    description: 'Show a person with their role, team and contact',
    category: 'Collaboration',
    size: [300, 112],
    init: (i: Item) => ({
      ...i,
      fill: '#ffffff',
      data: { name: 'New person', role: '', email: '', team: '', color: personColors[0]! } satisfies UserCardData,
    }),
    validate: (i: Item) => {
      const d = (i.data ?? {}) as UserCardData;
      if (!isValidAuthor(d.name)) fail('A user card needs a name.');
      if (![d.role, d.team].every(v => typeof v === 'string' && short(v, 80)) || !email(d.email) || !hex(d.color))
        fail('Invalid user card.');
    },
    searchText: (i: Item) => {
      const d = (i.data ?? {}) as UserCardData;
      return [d.name, d.role, d.team, d.email].join(' ');
    },
  },
];
