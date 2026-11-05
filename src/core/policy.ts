/**
 * Policies (ARCHITECTURE.md §7): who may read which rows and columns, and who may run which action on which rows.
 * They compile to SQL here, in the core, so every path that reads applies the same rules: the app's previews and
 * results, the ontology's objects, an action's check, and later shares and a server.
 *
 * A row rule names the column it filters on (or several names for it, as it is called in different datasets) and
 * the principal's attribute that holds the allowed values. It applies to every dataset that has one of those columns.
 * A dataset that has none is closed to the people the rule is for: its rows can't be filtered, so none are shown.
 * That is the safe reading of inheritance until lineage carries rules exactly (Q-41). A column rule removes columns
 * by name, the ones made from them included, which it lists.
 */
import { literal, quoteIdent } from './sqltext.js';

export interface Principal {
  id: string;
  name: string;
  role?: string;
  /** The flow's owner sees everything, through the same views as everyone else. */
  owner?: boolean;
  attributes?: Record<string, string[]>;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
}

export interface RowRule {
  id: string;
  kind: 'row';
  name: string;
  /** Principal or group ids. */
  for: string[];
  /** The column it filters on, under each name it has: the first one a dataset has is used. */
  columns: string[];
  /** The principal attribute holding the values allowed. */
  attribute: string;
}

export interface ColumnRule {
  id: string;
  kind: 'column';
  name: string;
  for: string[];
  remove: string[];
}

export interface ActionRule {
  id: string;
  kind: 'action';
  name: string;
  action: string;
  for: string[];
  /** Optional: the object's row must have, in this column, one of the actor's values for this attribute. */
  scope?: { columns: string[]; attribute: string };
}

export type Rule = RowRule | ColumnRule | ActionRule;

export interface Policies {
  principals: Principal[];
  groups?: Group[];
  rules: Rule[];
}

/** Whether a rule's `for` list covers a principal, directly or through a group. */
export function covers(p: Policies, ids: readonly string[], principal: string): boolean {
  if (ids.includes(principal) || ids.includes('*')) return true;
  return (p.groups ?? []).some((g) => ids.includes(g.id) && g.members.includes(principal));
}

export interface ReadView {
  open: boolean;
  /** Why the dataset is closed to this viewer. */
  reason?: string;
  /** The names of the row rules that filter it. */
  filters: string[];
  /** The columns removed, and the rules that removed them. */
  removed: { column: string; rule: string }[];
  /** The columns kept, in order. */
  columns: string[];
  /** The rows kept: a SQL condition over the dataset's columns, or null for every row. */
  where: string | null;
}

const find = (columns: readonly string[], names: readonly string[]) => {
  for (const n of names) {
    const hit = columns.find((c) => c.toLowerCase() === n.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
};

/** What one viewer may read of a dataset with these columns. */
export function readView(p: Policies | undefined, viewer: string, columns: readonly string[]): ReadView {
  const all: ReadView = { open: true, filters: [], removed: [], columns: [...columns], where: null };
  if (!p) return all;
  const who = p.principals.find((x) => x.id === viewer);
  if (!who) return { ...all, open: false, columns: [], reason: `${viewer} is not one of the flow's people` };
  if (who.owner) return all;
  const conditions: string[] = [];
  const filters: string[] = [];
  for (const rule of p.rules) {
    if (rule.kind !== 'row' || !covers(p, rule.for, viewer)) continue;
    const column = find(columns, rule.columns);
    if (!column) return { ...all, open: false, columns: [], reason: `the ${rule.name} filters on ${rule.columns.join(' or ')}, which this dataset doesn't have, so its rows can't be filtered` };
    const values = who.attributes?.[rule.attribute] ?? [];
    conditions.push(values.length ? `${quoteIdent(column)} IN (${values.map((v) => literal(v, 'text')).join(', ')})` : '0 = 1');
    filters.push(rule.name);
  }
  const removed: { column: string; rule: string }[] = [];
  for (const rule of p.rules) {
    if (rule.kind !== 'column' || !covers(p, rule.for, viewer)) continue;
    for (const c of columns) if (rule.remove.some((r) => r.toLowerCase() === c.toLowerCase()) && !removed.some((x) => x.column === c)) removed.push({ column: c, rule: rule.name });
  }
  const kept = columns.filter((c) => !removed.some((x) => x.column === c));
  if (kept.length === 0) return { ...all, open: false, columns: [], removed, reason: 'every column is removed for this viewer' };
  return { open: true, filters, removed, columns: kept, where: conditions.length ? conditions.join(' AND ') : null };
}

/**
 * A statement's rows as a viewer may read them, or null when the dataset is closed to them. `keep` names columns the
 * statement adds that aren't the dataset's (flags it computed from columns the viewer can read), kept after theirs.
 */
export function wrapRead(view: ReadView, sql: string, keep: readonly string[] = []): string | null {
  if (!view.open) return null;
  const cols = [...view.columns, ...keep].map(quoteIdent).join(', ');
  return `SELECT ${cols} FROM (\n${sql}\n) AS "_smaltfl_read"${view.where ? ` WHERE ${view.where}` : ''}`;
}

export type ActionCheck = { allowed: true; reason: string; rule?: string } | { allowed: false; reason: string; rule?: string };

/**
 * Whether `actor` may run `action` on an object with this row. The runtime asks this before it writes, and
 * records a refusal as well as an edit.
 */
export function checkAction(p: Policies | undefined, action: string, actor: string, row: Record<string, unknown> | null): ActionCheck {
  if (!p) return { allowed: true, reason: 'the flow has no policies' };
  const who = p.principals.find((x) => x.id === actor);
  if (!who) return { allowed: false, reason: `${actor} is not one of the flow's people` };
  if (who.owner) return { allowed: true, reason: `${who.name} owns the flow` };
  const rules = p.rules.filter((r): r is ActionRule => r.kind === 'action' && r.action === action);
  const mine = rules.filter((r) => covers(p, r.for, actor));
  if (mine.length === 0) {
    const allowed = rules.flatMap((r) => r.for.map((id) => p.groups?.find((g) => g.id === id)?.name ?? p.principals.find((x) => x.id === id)?.name ?? id));
    return { allowed: false, reason: allowed.length ? `only ${allowed.join(' and ')} may do this` : 'no rule allows this action' };
  }
  for (const r of mine) {
    if (!r.scope) return { allowed: true, reason: `${r.name} allows ${who.name}`, rule: r.id };
    if (!row) continue;
    const column = Object.keys(row).find((k) => r.scope!.columns.some((c) => c.toLowerCase() === k.toLowerCase()));
    const value = column === undefined ? undefined : row[column];
    const allowedValues = who.attributes?.[r.scope.attribute] ?? [];
    if (value !== undefined && allowedValues.includes(String(value))) return { allowed: true, reason: `${String(value)} is one of ${who.name}'s ${r.scope.attribute}`, rule: r.id };
    return { allowed: false, reason: `${value === undefined ? 'this object' : String(value)} is outside ${who.name}'s ${r.scope.attribute}`, rule: r.id };
  }
  return { allowed: false, reason: 'no object to check' };
}
