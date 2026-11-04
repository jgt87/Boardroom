// People and User card views and editors (item 95). Uses the local display name; there are no accounts.
import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import './widgets-people.css';
import type { Item } from './model';
import type { WidgetCtx, WidgetView } from './widget-types';
import { Dialog, data, setData } from './widget-kit';
import { AUTHOR_KEY, cleanAuthor, initials } from './authors';
import { addMember, colorFor, personColors, removeMember, PEOPLE_MAX } from './specs-people';
import type { PeopleData, UserCardData } from './specs-people';

/** The display name set on this device (Profile), or ''. Storage may be unavailable. */
function myName(): string {
  try {
    return cleanAuthor(localStorage.getItem(AUTHOR_KEY) ?? '');
  } catch {
    return '';
  }
}

function Avatar({ name, color, size = 36 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="w-avatar"
      style={{ background: color, width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials(name) || '?'}
    </span>
  );
}

function PeopleRender({ item }: { item: Item }) {
  const d = data<PeopleData>(item);
  return (
    <div className="w-people">
      <strong>
        {d.title} <span>{d.members.length}</span>
      </strong>
      {d.members.length ? (
        <ul aria-label={`${d.title} members`}>
          {d.members.map(m => (
            <li key={m.id} title={[m.name, m.role].filter(Boolean).join(' · ')}>
              <Avatar name={m.name} color={m.color} />
              <span>{m.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Double-click to add people</p>
      )}
    </div>
  );
}

function PeopleEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [d, setD] = useState(data<PeopleData>(item)),
    [name, setName] = useState(''),
    [role, setRole] = useState('');
  const me = myName();
  const add = (n: string, r = '') => {
    setD(prev => addMember(prev, n, crypto.randomUUID(), r));
    setName('');
    setRole('');
  };
  return (
    <Dialog
      title="People"
      hint="Names stay on this board. Set your own name under Profile to add yourself in one click."
      onClose={onClose}
      onApply={() => {
        setData(ctx, item.id, d);
        onClose();
      }}
    >
      <div className="w-form">
        <label className="span2">
          Title
          <input
            aria-label="People title"
            value={d.title}
            maxLength={80}
            onChange={e => setD({ ...d, title: e.target.value })}
          />
        </label>
        <label>
          Name
          <input
            aria-label="Person name"
            value={name}
            maxLength={80}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                add(name, role);
              }
            }}
          />
        </label>
        <label>
          Role
          <input aria-label="Person role" value={role} maxLength={80} onChange={e => setRole(e.target.value)} />
        </label>
        <div className="span2 w-people-actions">
          <button disabled={!cleanAuthor(name) || d.members.length >= PEOPLE_MAX} onClick={() => add(name, role)}>
            <UserPlus size={15} /> Add person
          </button>
          {me && !d.members.some(m => m.name.toLowerCase() === me.toLowerCase()) && (
            <button onClick={() => add(me)}>Add me ({me})</button>
          )}
        </div>
        <ul className="span2 w-people-list" aria-label="Members">
          {d.members.map(m => (
            <li key={m.id}>
              <Avatar name={m.name} color={m.color} size={26} />
              <span>
                {m.name}
                {m.role && <small> · {m.role}</small>}
              </span>
              <button
                className="icon-button"
                aria-label={`Remove ${m.name}`}
                onClick={() => setD(prev => removeMember(prev, m.id))}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

function UserCardRender({ item }: { item: Item }) {
  const d = data<UserCardData>(item);
  return (
    <div className="w-usercard">
      <Avatar name={d.name} color={d.color} size={52} />
      <div>
        <strong>{d.name}</strong>
        {d.role && <span>{d.role}</span>}
        {d.team && <span className="w-usercard-team">{d.team}</span>}
        {d.email && <span className="w-usercard-email">{d.email}</span>}
      </div>
    </div>
  );
}

function UserCardEditor({ item, ctx, onClose }: { item: Item; ctx: WidgetCtx; onClose: () => void }) {
  const [d, setD] = useState(data<UserCardData>(item));
  const me = myName();
  const emailOk = !d.email || /^[^\s@<>]+@[^\s@<>]+$/.test(d.email);
  const error = !cleanAuthor(d.name)
    ? 'Enter a name.'
    : !emailOk
      ? 'Enter a valid email address or leave it empty.'
      : '';
  const field = (key: 'name' | 'role' | 'team' | 'email', label: string) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={d[key]}
        maxLength={key === 'email' ? 254 : 80}
        onChange={e => setD({ ...d, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <Dialog
      title="User card"
      onClose={onClose}
      error={error}
      applyDisabled={!!error}
      onApply={() => {
        if (error) return;
        setData(ctx, item.id, {
          ...d,
          name: cleanAuthor(d.name),
          role: cleanAuthor(d.role),
          team: cleanAuthor(d.team),
          email: d.email.trim(),
        });
        onClose();
      }}
    >
      <div className="w-form">
        {field('name', 'Name')}
        {field('role', 'Role')}
        {field('team', 'Team')}
        {field('email', 'Email')}
        <fieldset className="span2 w-swatches">
          <legend>Avatar colour</legend>
          {personColors.map(c => (
            <button
              key={c}
              aria-label={`Avatar colour ${c}`}
              aria-pressed={d.color === c}
              style={{ background: c }}
              onClick={() => setD({ ...d, color: c })}
            />
          ))}
        </fieldset>
        {me && (
          <button className="span2" onClick={() => setD({ ...d, name: me, color: colorFor(me) })}>
            Use my profile name ({me})
          </button>
        )}
      </div>
    </Dialog>
  );
}

export const peopleViews: WidgetView[] = [
  { kind: 'people', mode: 'html', Render: PeopleRender, Editor: PeopleEditor },
  { kind: 'usercard', mode: 'html', Render: UserCardRender, Editor: UserCardEditor },
];
