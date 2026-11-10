/**
 * Edits to the flow made in the app, as pure functions of the document (ADR 0015 §4 and amendment 1): a file's own
 * name for a column, the column's meaning there and the labels of its values (`nameColumn`); an accepted band
 * (`applyBand`, ADR 0014 §3); what the page keeps of an edited document across a reload and when it drops it
 * (`keptOf`, `restoreKept`); and the flow as shipped again, with its arrangement left as it is (`asShipped`).
 *
 * Every edit moves the flow hash (the whole ontology is in it) and is recorded as a flow change with its reason in
 * words, which these functions give. A name or a label is for people: `nameColumn` writes the file's own property
 * (`propertyOf` scopes by dataset, Q-140) with every mark of the one it stood under, so what the plan carries for the
 * file (`marksOn`) and what any other file is called and judged by stay as they were. The file's own column name is
 * never changed: the data is untouched.
 */
import { canonicalJSON } from './canonical.js';
import { validateDocument, type FlowDocument, type StepDef } from './document.js';
import { propertyOf, saysMore, type Ontology, type PropertyType } from './ontology.js';
import { ACTION_SAID, newRuleId, ruleSaid, type OntologyRule } from './rules.js';

const lower = (x: string) => x.toLowerCase();

/** What someone changed on a column's card: any of its display name, its meaning, and labels for its values. */
export interface ColumnChange {
  /** What people call the column in this file. Left empty, it is called as the file writes it. */
  title?: string;
  /** What it holds, in words. */
  description?: string;
  /** A label for a value, by the value as the file writes it. Left empty, the value has no label of its own. */
  values?: Record<string, string>;
}

/** "A", "A and B", "A, B and C". */
const listed = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * A column of a file renamed, its meaning reworded or its values labelled, as that file's own (Q-140): the document
 * with the file's own property for the column, and the change in words for the record ("Renamed status to Result in
 * tls"). `said` is null, and the document the one passed, when nothing changed.
 *
 * The file's own property: the one that names only this file, edited in place; else a new one for this file alone,
 * copied from the one it stood under (the flow's dictionary, or one shared with other files, which then stops naming
 * this file), with its unit, note, lookup and marks, and only the bands that apply to this file. A column the
 * ontology doesn't describe gets its first entry. A label taken away leaves a value the ontology lists with the
 * value itself for a label (the list of values stays what it was, and a label that only repeats the value is shown
 * nowhere, `saysMore`), and an unlisted one as it was; an empty label for a value whose label already says no more
 * than the value ("Yes" for yes) is no change.
 */
export function nameColumn(doc: FlowDocument, file: string, column: string, change: ColumnChange): { doc: FlowDocument; said: string | null } {
  const o: Ontology = doc.ontology ?? { objectTypes: [], linkTypes: [], actionTypes: [] };
  const props = o.properties ?? [];
  const was = propertyOf(o, file, column);
  const done: string[] = [];
  const next: { title?: string; description?: string; values?: Record<string, string> } = {};
  if (change.title !== undefined) {
    const title = change.title.trim() || column;
    if (title !== (was?.title ?? column)) {
      next.title = title;
      done.push(`renamed ${column} to ${title}`);
    }
  }
  if (change.description !== undefined) {
    const description = change.description.trim();
    if (description !== (was?.description ?? '')) {
      next.description = description;
      done.push(`reworded what ${column} means`);
    }
  }
  const values = { ...(was?.values ?? {}) };
  let labelled = false;
  for (const [value, text] of Object.entries(change.values ?? {})) {
    const label = text.trim();
    const had = Object.prototype.hasOwnProperty.call(values, value) ? values[value]! : undefined;
    // Left empty where the value has no label that says more than itself ("Yes" for yes): nothing to take away.
    if (label === (had ?? '') || (label === '' && !saysMore(had, value))) continue;
    values[value] = label || value;
    labelled = true;
    done.push(label ? `labelled ${column}’s ${value} as ${label}` : `took the label off ${column}’s ${value}`);
  }
  if (labelled) next.values = values;
  if (!done.length) return { doc, said: null };
  const sentence = listed(done);
  const said = `${sentence[0]!.toUpperCase()}${sentence.slice(1)} in ${file}`;

  const own = (p: PropertyType) => p.datasets?.length === 1 && lower(p.datasets[0]!) === lower(file);
  let properties: PropertyType[];
  if (was && own(was)) properties = props.map((p) => (p === was ? { ...p, ...next } : p));
  else if (was) {
    // The bands that apply to this file come along; one for other files only says nothing here.
    const bands = was.expect?.filter((b) => !b.datasets || b.datasets.some((d) => lower(d) === lower(file)));
    const { expect: _expect, ...rest } = was;
    const mine: PropertyType = { ...rest, ...(bands?.length ? { expect: bands } : {}), ...next, datasets: [file] };
    // A property shared by several named files stops naming this one; the flow's dictionary stands as it was.
    const left = (p: PropertyType): PropertyType => (p.datasets ? { ...p, datasets: p.datasets.filter((d) => lower(d) !== lower(file)) } : p);
    properties = props.flatMap((p) => (p === was ? [left(p), mine] : [p]));
  } else properties = [...props, { column, title: next.title ?? column, description: next.description ?? '', ...(next.values ? { values: next.values } : {}), datasets: [file] }];
  return { doc: { ...doc, ontology: { ...o, properties } }, said };
}

/** A band accepted for a value of a source's column (ADR 0014 §3, Accept the new band). */
export interface AcceptedBand {
  column: string;
  value: string;
  share: [number, number];
}

/**
 * The ontology edited from an accepted band (ADR 0014 §3): the property of the column, for this source, gets the band
 * as its expect entry for the value (a general entry stays for the other datasets). Null where the ontology doesn't
 * describe the column. `said` is the change in words for the record, the column by its title and the value by what
 * it means there.
 */
export function applyBand(doc: FlowDocument, source: string, band: AcceptedBand): { doc: FlowDocument; said: string } | null {
  const o = doc.ontology;
  if (!o) return null;
  const props = o.properties ?? [];
  const own = propertyOf(o, source, band.column);
  if (!own) return null;
  const list = [...(own.expect ?? [])];
  const mine = list.findIndex((b) => b.value === band.value && (b.datasets ? b.datasets.some((d) => lower(d) === lower(source)) : false));
  const general = list.findIndex((b) => b.value === band.value && !b.datasets);
  if (mine >= 0) list[mine] = { ...list[mine]!, share: band.share };
  else if (general >= 0 && own.datasets?.some((d) => lower(d) === lower(source))) list[general] = { ...list[general]!, share: band.share };
  else list.push({ value: band.value, share: band.share, datasets: [source] });
  const edited = { ...own, expect: list };
  const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const value = own.values && Object.prototype.hasOwnProperty.call(own.values, band.value) ? own.values[band.value]! : band.value;
  return {
    doc: { ...doc, ontology: { ...o, properties: props.map((p) => (p === own ? edited : p)) } },
    said: `Accepted a new band in ${source}: ${own.title} ${value} between ${percent(band.share[0])} and ${percent(band.share[1])}`,
  };
}

// ------------------------------------------------------------------ rules set on a file's columns (rules.ts)

/** A rule as the form gives it: the ontology's entry without its name (a new rule is given one) or its switch. */
export type RuleInput = Omit<OntologyRule, 'id' | 'off'> & { id?: string };

/** The ontology to edit, made where the flow has none. */
const ontologyOf = (doc: FlowDocument): Ontology => doc.ontology ?? { objectTypes: [], linkTypes: [], actionTypes: [] };

/** The rule's entry, in the canonical shape the document keeps: its settings in one order, only what its kind has. */
function ruleEntry(r: RuleInput & { id: string; off?: true }): OntologyRule {
  return {
    id: r.id,
    file: r.file,
    column: r.column,
    kind: r.kind,
    ...(r.kind === 'oneOf' || r.kind === 'when' ? { values: [...new Set((r.values ?? []).map((v) => v.trim()).filter((v) => v !== ''))] } : {}),
    ...(r.kind === 'range' && r.min !== undefined ? { min: r.min } : {}),
    ...(r.kind === 'range' && r.max !== undefined ? { max: r.max } : {}),
    ...(r.kind === 'when' && r.when ? { when: { column: r.when.column, values: [...new Set(r.when.values.map((v) => v.trim()).filter((v) => v !== ''))] } } : {}),
    action: r.action,
    ...(r.off ? { off: true as const } : {}),
  };
}

/** Why a document with the rule isn't one: the first problem validateDocument finds with the ontology's rules. */
function ruleProblem(doc: FlowDocument): string | null {
  const issue = validateDocument(doc).find((i) => i.path.startsWith('$.ontology.rules'));
  return issue ? issue.message : null;
}

/**
 * A rule added to its file, or one of its rules changed (by `id`, its switch kept): the document with it, and the
 * change in words, or the reason the rule can't be kept. It runs from the next run (Q-141): a rule is on once set.
 */
export function setRule(doc: FlowDocument, input: RuleInput): { doc: FlowDocument; said: string } | { problem: string } {
  const o = ontologyOf(doc);
  const rules = o.rules ?? [];
  const at = input.id === undefined ? -1 : rules.findIndex((r) => lower(r.file) === lower(input.file) && r.id === input.id);
  if (input.id !== undefined && at < 0) return { problem: `${input.file} has no rule ${input.id}` };
  const was = at >= 0 ? rules[at]! : null;
  const entry = ruleEntry({ ...input, id: was?.id ?? newRuleId(doc, input.file, input.column, input.kind), ...(was?.off ? { off: true as const } : {}) });
  const next: FlowDocument = { ...doc, ontology: { ...o, rules: was ? rules.map((r, k) => (k === at ? entry : r)) : [...rules, entry] } };
  const problem = ruleProblem(next);
  if (problem) return { problem };
  const words = `${ruleSaid(next.ontology, entry)}, else ${ACTION_SAID[entry.action]}`;
  return { doc: next, said: was ? `Changed a rule in ${entry.file}: ${words} (it was: ${ruleSaid(o, was)}, else ${ACTION_SAID[was.action]})` : `Added a rule to ${entry.file}: ${words}` };
}

/** A file's rule taken away: the document without it, and the change in words; null when there is no such rule. */
export function removeRule(doc: FlowDocument, file: string, id: string): { doc: FlowDocument; said: string } | null {
  const o = doc.ontology;
  const was = o?.rules?.find((r) => lower(r.file) === lower(file) && r.id === id);
  if (!o || !was) return null;
  const rules = o.rules!.filter((r) => r !== was);
  const { rules: _rules, ...rest } = o;
  return { doc: { ...doc, ontology: rules.length ? { ...rest, rules } : rest }, said: `Removed a rule from ${was.file}: ${ruleSaid(o, was)}` };
}

/**
 * A file's rule switched on or off on its import card (Q-141): kept and said either way, enforced only while on. Null
 * when there is no such rule, or it is already so.
 */
export function switchRule(doc: FlowDocument, file: string, id: string, on: boolean): { doc: FlowDocument; said: string } | null {
  const o = doc.ontology;
  const was = o?.rules?.find((r) => lower(r.file) === lower(file) && r.id === id);
  if (!o || !was || !was.off === on) return null;
  const entry = ruleEntry({ ...was, ...(on ? {} : { off: true as const }) });
  if (on) delete entry.off;
  return { doc: { ...doc, ontology: { ...o, rules: o.rules!.map((r) => (r === was ? entry : r)) } }, said: `Switched ${on ? 'on' : 'off'} a rule of ${was.file}: ${ruleSaid(o, was)}` };
}

// ------------------------------------------------------------------ what the page keeps of an edited flow

/** One edit made here, as the page lists it: when, and what was done, in the words it was recorded with. */
export interface FlowEdit {
  at: string;
  said: string;
}

/**
 * What the page keeps of an edited flow (ADR 0015 §4): the document as edited, without its arrangement (sections and
 * places are kept apart), the edits made, and `base`, the flow hash of the document it was shipped with. Its
 * notebooks, gates and ontology are in it, and the cell refs and outline a toggle needs, which the page can't derive
 * again (it has no parser).
 */
export interface KeptFlow {
  v: 2;
  base: string;
  doc: FlowDocument;
  edits: FlowEdit[];
}

/** The fingerprint the first kept form went by (`{ v: 1, base, steps }`): FNV-1a of the shipped steps. */
export function stepsPrint(steps: readonly StepDef[]): string {
  let hash = 0x811c9dc5;
  for (const ch of canonicalJSON(steps as unknown as Parameters<typeof canonicalJSON>[0])) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return hash.toString(16);
}

/** What to keep of a document edited here: `base` is the shipped document's flow hash. */
export function keptOf(doc: FlowDocument, base: string, edits: readonly FlowEdit[]): KeptFlow {
  const { groups: _groups, layout: _layout, ...rest } = doc;
  return { v: 2, base, doc: rest as FlowDocument, edits: edits.map((e) => ({ at: e.at, said: e.said })) };
}

/** What became of what the page kept: nothing was kept; the edited document, to go on from; or what was kept was
 * dropped, with the edits that went with it and why. */
export type Restored =
  | { state: 'none' }
  | { state: 'kept'; doc: FlowDocument; edits: FlowEdit[] }
  | { state: 'dropped'; edits: FlowEdit[]; why: string };

const isEdits = (v: unknown): v is FlowEdit[] => Array.isArray(v) && v.every((e) => typeof e === 'object' && e !== null && typeof (e as FlowEdit).at === 'string' && typeof (e as FlowEdit).said === 'string');

/**
 * The edited document the page kept, restored over the shipped one, whose arrangement it takes (the browser's own is
 * put on after). What was kept against another shipped document is dropped (`base` is the shipped flow's hash now):
 * the edits were made to a flow that is no longer the one shipped. So is anything that isn't a flow this version
 * reads. The first kept form (the steps alone, by `stepsPrint`) is still read.
 */
export function restoreKept(shipped: FlowDocument, base: string, saved: unknown): Restored {
  if (typeof saved !== 'object' || saved === null) return { state: 'none' };
  const s = saved as { v?: unknown; base?: unknown; doc?: unknown; steps?: unknown; edits?: unknown };
  const edits = isEdits(s.edits) ? s.edits : [];
  const arranged = (doc: FlowDocument): FlowDocument => {
    const { groups: _groups, layout: _layout, ...rest } = doc;
    return { ...rest, ...(shipped.groups ? { groups: shipped.groups } : {}), ...(shipped.layout ? { layout: shipped.layout } : {}) } as FlowDocument;
  };
  if (s.v === 1) {
    if (s.base !== stepsPrint(shipped.steps) || !Array.isArray(s.steps)) return { state: 'dropped', edits, why: 'the flow as shipped changed' };
    const doc = { ...shipped, steps: s.steps as StepDef[] };
    return validateDocument(doc).length === 0 ? { state: 'kept', doc, edits } : { state: 'dropped', edits, why: 'what was kept isn’t a flow this version reads' };
  }
  if (s.v !== 2) return { state: 'dropped', edits, why: 'what was kept isn’t in a form this version reads' };
  if (s.base !== base) return { state: 'dropped', edits, why: 'the flow as shipped changed' };
  if (typeof s.doc !== 'object' || s.doc === null || (s.doc as FlowDocument).id !== shipped.id) return { state: 'dropped', edits, why: 'what was kept isn’t this flow' };
  const doc = arranged(s.doc as FlowDocument);
  return validateDocument(doc).length === 0 ? { state: 'kept', doc, edits } : { state: 'dropped', edits, why: 'what was kept isn’t a flow this version reads' };
}

/**
 * The flow as shipped again, every edit taken away: the shipped document, with the arrangement the document on
 * screen has (its sections, places and profile boxes are the browser's own, and no edit of the flow), less what the
 * shipped flow has no step for.
 */
export function asShipped(doc: FlowDocument, shipped: FlowDocument): FlowDocument {
  const known = new Set([...shipped.sources, ...shipped.steps].map((x) => lower(x.id)));
  const { groups: _groups, layout: _layout, profiles: _profiles, ...rest } = structuredClone(shipped);
  const groups = (doc.groups ?? shipped.groups)?.map((g) => ({ ...g, steps: g.steps.filter((x) => known.has(lower(x))) }));
  const profiles = (doc.profiles ?? shipped.profiles)?.filter((p) => known.has(lower(p.of)));
  const layout = doc.layout ?? shipped.layout;
  return { ...rest, ...(groups ? { groups } : {}), ...(layout ? { layout } : {}), ...(profiles ? { profiles } : {}) } as FlowDocument;
}
