/**
 * The Ontology page as data (ADR 0015 amendment 1, piece a): one section a file the flow reads, each with what the
 * file is, the file's own rules, a card a column (its meaning and its rules) and a place for what the app discovers.
 * Everything is read from the document as it stands: the ontology's `rows` and the gate cell's own rules through
 * `writtenRules` (so the page names the rules the plan counts), a column's marks through `marksOn` (so a band is the
 * one the plan carries for that file). Nothing is added to the document, nothing here is judged, and nothing is
 * shared between files: a band the ontology gives wherever a column appears is listed in each file's section as that
 * file's rule. Pure: no DOM, no engine. The page puts the drawings and the load's counts beside it.
 *
 * A rule's sentence uses the ontology's titles and the words for its values, never a raw column or code where a
 * title exists. A condition its author wrote for the engine in a gate cell is quoted as written.
 */
import { sourceOf, type FlowDocument } from './document.js';
import { gateChecksOf, writtenRules, type CheckName } from './gates.js';
import { marksOn, meaningOf, nounOf, propertyOf, rowsOf, type Noun, type ObjectType, type Ontology, type PropertyType } from './ontology.js';

/**
 * How a rule came to be. Today every rule is set by hand, in the ontology or in the notebook's gate cell. The two
 * other ways are the next pieces' to fill (ADR 0015 amendment 1, Q-142): a range derived from the last days of the
 * history, fixed once set or rolling over those days, and a rule the app discovered in the data.
 */
export type RuleOrigin =
  | { how: 'set'; in: 'ontology' | 'notebook' }
  | { how: 'derived'; days: number; kept: 'fixed' | 'rolling' }
  | { how: 'discovered' };

/**
 * What a rule is about. A file's own: `rows` (what a row is), `covers` (the objects it has rows for), `key` (its key
 * on one row each, never blank), `same` (its keys equal another dataset's), `needs` (a value another value forbids).
 * A column's: `values` (a value never seen is wrong), `bad` (a value that means something went wrong), `band` (a
 * value's share of the rows), `due` (a due date and what makes a row late), `after` (a time that runs behind another).
 */
export type RuleKind = 'rows' | 'covers' | 'key' | 'same' | 'needs' | 'values' | 'bad' | 'band' | 'due' | 'after';

/** One rule of a file or of a column, as the page lists it. */
export interface Rule {
  /** Stable while the rule stands: `<file>/<kind>` for a file's rule, `<file>/<column>/<kind>` for a column's (the
   * column in lower case), with `=<value>` for a rule about one value and `#<n>` for the n-th dependency. */
  id: string;
  kind: RuleKind;
  /** The rule in plain words. */
  said: string;
  /** The numbers behind it, where it has any: a band's ends as shares (0 to 1), a window in days, a lag in minutes. */
  numbers?: { low?: number; high?: number; days?: number; minutes?: number };
  /** The values it is about, as the file writes them: the banded or bad value, the values a column is known to hold. */
  values?: string[];
  /** The dataset it is checked against (the inventory a scope reads, the dataset whose keys these must equal). */
  against?: string;
  origin: RuleOrigin;
  /** Why nothing judges it as the flow stands, in a few words; absent while it is judged. */
  unchecked?: string;
}

/** A column of a file: what it is called, what it means, and its rules. */
export interface ColumnCard {
  /** The column as the file writes it. */
  name: string;
  /** What people call it: the ontology's title, or the name where the ontology doesn't describe it. */
  title: string;
  /** What it holds, in the ontology's words. */
  description?: string;
  /** The words for its coded values, in the ontology's order. */
  values: [code: string, meaning: string][];
  /** The ontology's entry for it in this file (`propertyOf`): its unit, its note, where its meaning comes from. */
  property?: PropertyType;
  rules: Rule[];
}

/** A file the flow reads. */
export interface FileSection {
  /** The source's id: the file's name in the flow. */
  id: string;
  description?: string;
  /** The description's opening, for the list of files: up to its first colon or full stop. */
  summary: string;
  /** What a row of it is called, one and many. */
  noun: Noun;
  /** Set where other files are checked against this one (their scope reads it): what it lists, and which files. */
  inventory?: { noun: Noun; files: string[]; said: string };
  /** Whether a watch judges the file's loads. */
  watched: boolean;
  /** The file's own rules. */
  rules: Rule[];
  /** A card a column, in the file's order; null while the file's columns aren't known (no load read yet). */
  columns: ColumnCard[] | null;
  /** What the app discovered in the data, to accept: nothing writes here yet. */
  discovered: Rule[];
  /** How many rules the file has: its own and its columns'. */
  count: number;
}

/** The page: a section a file, and the object types still drawn after them. */
export interface OntologyPage {
  files: FileSection[];
  /** The object types with a link or an action, or that no file's rows are tied to. A type that only says what
   * files' rows are isn't drawn as a box: that is the files' own rules now. */
  types: ObjectType[];
}

type PageDoc = Pick<FlowDocument, 'sources'> & Partial<Pick<FlowDocument, 'steps' | 'ontology' | 'gates' | 'publish'>>;

const lower = (x: string) => x.toLowerCase();
/** "A", "A or B", "A, B or C". */
const either = (xs: readonly string[], word = 'or') => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${word} ${xs.at(-1)}`);
/** "a zone", "an application", "a unit". */
const withArticle = (word: string) => `${/^(?:[aeio]|u(?!ni|se|sa|ti))/i.test(word) ? 'an' : 'a'} ${word}`;
/** A share as a percentage to a tenth of a point: 15%, 2.5%. */
const percent = (x: number) => `${Math.round(x * 1000) / 10}%`;
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** How a rule came to be, in a few words: "Set by hand", "From the last 90 days, rolling", "Discovered in the data". */
export function originSaid(o: RuleOrigin): string {
  if (o.how === 'set') return 'Set by hand';
  if (o.how === 'derived') return `From the last ${days(o.days)}, ${o.kept}`;
  return 'Discovered in the data';
}

/** The object types the page still draws (`OntologyPage.types`). */
export function typesShown(ontology: Ontology | undefined): ObjectType[] {
  const o = ontology;
  if (!o) return [];
  const tied = new Set((o.rows ?? []).map((r) => r.of));
  return o.objectTypes.filter((t) => !tied.has(t.id) || o.linkTypes.some((l) => l.from === t.id || l.to === t.id) || o.actionTypes.some((a) => a.on === t.id));
}

/**
 * The page for a document. `columns` gives each file's columns as its load has them, in the file's order (the app
 * gives the ones the viewer may read, so a hidden column has no card and its rules aren't listed); a file it returns
 * nothing for has no cards yet.
 */
export function ontologyPage(doc: PageDoc, columns: (file: string) => readonly string[] | undefined = () => undefined): OntologyPage {
  const o = doc.ontology;
  const steps = doc.steps ?? [];
  const title = (dataset: string, column: string) => propertyOf(o, dataset, column)?.title ?? column;
  const word = (dataset: string, column: string, value: string) => meaningOf(propertyOf(o, dataset, column), value) ?? value;
  /** A condition in words, its columns read in `dataset`: "Internet-facing is Yes and Criticality is Critical or High". */
  const where = (dataset: string, cond: readonly (readonly [string, readonly string[]])[]) => cond.map(([c, vs]) => `${title(dataset, c)} is ${either(vs.map((v) => word(dataset, c, v)))}`).join(' and ');
  const listed = (m: Record<string, string | string[]>) => Object.entries(m).map(([c, v]): [string, string[]] => [c, Array.isArray(v) ? v : [v]]);
  const nounFor = (id: string) => nounOf(o, id, steps.filter((s) => s.inputs.some((i) => lower(sourceOf({ steps }, i) ?? '') === lower(id))).map((s) => s.id));
  const watchedIds = Object.keys(doc.publish?.watch ?? {}).map(lower);

  const section = (src: PageDoc['sources'][number]): FileSection => {
    const id = src.id;
    const noun = nounFor(id);
    const watched = watchedIds.includes(lower(id));
    const checks = gateChecksOf(doc, id);
    /** Why a rule of this check isn't judged as the flow stands: the file's reason first, then the rule's own. */
    const quiet = (check: CheckName | null, own?: string): { unchecked: string } | Record<string, never> => {
      const why = !watched ? 'nothing watches this file' : (own ?? (check && checks && checks[check] === 'off' ? 'switched off in the notebook' : undefined));
      return why ? { unchecked: why } : {};
    };
    const written = writtenRules(doc, id);
    const tied = rowsOf(o, id);
    const rules: Rule[] = [];
    // What a row is, and the objects the file has rows for: the ontology's `rows` (ADR 0015 §1).
    if (tied) {
      const one = lower(tied.type.name);
      rules.push({ id: `${id}/rows`, kind: 'rows', said: `One row ${withArticle(one)}`, origin: { how: 'set', in: 'ontology' }, ...quiet(null, tied.key === null ? 'a key of several columns isn’t checked yet' : undefined) });
    }
    if (written.scope) {
      const sc = written.scope;
      const many = nounFor(sc.of).many;
      const said = sc.from === 'gate' ? `Covers the ${many} where ${sc.where}, and no others`
        : sc.match.length ? `Covers the ${many} where ${where(sc.of, sc.match)}, and no others`
        : `Covers every ${nounFor(sc.of).one}, and no others`;
      rules.push({ id: `${id}/covers`, kind: 'covers', said, against: sc.of, origin: { how: 'set', in: sc.from === 'gate' ? 'notebook' : 'ontology' }, ...quiet('scope') });
    }
    if (written.reconcile) {
      const rc = written.reconcile;
      const keys = either(rc.key.map((c) => title(id, c)), 'and');
      const origin: RuleOrigin = { how: 'set', in: rc.from === 'gate' ? 'notebook' : 'ontology' };
      rules.push({ id: `${id}/key`, kind: 'key', said: `No ${keys} blank or repeated`, origin, ...quiet('reconcile') });
      if (rc.of !== undefined) rules.push({ id: `${id}/same`, kind: 'same', said: `The same ${keys} values as ${rc.of}: none missing, none extra`, against: rc.of, origin, ...quiet('reconcile') });
    }
    written.needs.forEach((n, k) => {
      const from = n.from ?? id;
      const then = listed(n.then).map(([c, vs]) => `${title(id, c)} must be ${either(vs.map((v) => word(id, c, v)))}`).join(' and ');
      rules.push({ id: `${id}/needs#${k + 1}`, kind: 'needs', said: `Where ${where(from, listed(n.when))}${n.from ? ` in ${n.from}` : ''}, ${then}`, ...(n.from ? { against: n.from } : {}), origin: { how: 'set', in: 'notebook' }, ...quiet('needs') });
    });

    // A card a column the load has, each with the rules its marks give in this file (`marksOn`, as the plan reads them).
    const has = columns(id);
    const marks = marksOn(o, id);
    const cards = has
      ? has.map((name): ColumnCard => {
          const p = propertyOf(o, id, name);
          const mine = <T extends unknown[]>(xs: T[]) => xs.filter((x) => lower(String(x[0])) === lower(name));
          const at = `${id}/${lower(name)}`;
          const origin: RuleOrigin = { how: 'set', in: 'ontology' };
          const own: Rule[] = [];
          if (mine(marks.newValues).length) {
            const known = Object.entries(p?.values ?? {});
            const holds = known.length === 0 ? '' : known.length <= 6 ? `Holds ${either(known.map(([, m]) => m))}: ` : `Holds one of ${known.length} known values: `;
            own.push({ id: `${at}/values`, kind: 'values', said: `${holds}${holds ? 'a' : 'A'} value never seen before is flagged as wrong`, ...(known.length ? { values: known.map(([code]) => code) } : {}), origin, ...quiet('values') });
          }
          // A value with a band in this file is judged by the band alone (ADR 0014 §3): its jump isn't, and says so.
          const banded = new Set(mine(marks.expect).map(([, value]) => value));
          for (const [, ...codes] of mine(marks.bad)) for (const code of codes) own.push({ id: `${at}/bad=${code}`, kind: 'bad', said: `${word(id, name, code)} is a bad value: a jump above its usual share is flagged as wrong`, values: [code], origin, ...quiet('shares', banded.has(code) ? `this file’s band on ${word(id, name, code)} is checked instead` : undefined) });
          for (const [, value, low, high] of mine(marks.expect)) own.push({ id: `${at}/band=${value}`, kind: 'band', said: `${word(id, name, value)} between ${percent(low)} and ${percent(high)} of ${noun.many}`, numbers: { low, high }, values: [value], origin, ...quiet('values') });
          for (const [, status, miss, within] of mine(marks.due)) own.push({ id: `${at}/due`, kind: 'due', said: `A due date: late when ${title(id, status)} is still ${word(id, status, miss)} the day after, checked against the usual late share`, numbers: { days: within }, values: [miss], origin, ...quiet('due') });
          for (const [, of, minutes] of mine(marks.after)) own.push({ id: `${at}/after`, kind: 'after', said: `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} after ${title(id, of)}`, numbers: { minutes }, origin, ...quiet('shape') });
          return { name, title: p?.title ?? name, ...(p?.description ? { description: p.description } : {}), values: Object.entries(p?.values ?? {}), ...(p ? { property: p } : {}), rules: own };
        })
      : null;

    // The files whose scope reads this one: it is the list they are checked against.
    const against = doc.sources.filter((x) => lower(x.id) !== lower(id) && lower(writtenRules(doc, x.id).scope?.of ?? '') === lower(id)).map((x) => x.id);
    const first = /^(.*?)(?:: |\. |\.$|$)/s.exec(src.description ?? '')?.[1]?.trim();
    return {
      id,
      ...(src.description ? { description: src.description } : {}),
      summary: first ?? '',
      noun,
      ...(against.length ? { inventory: { noun, files: against, said: `The list of ${noun.many}: ${against.length} other ${against.length === 1 ? 'file is' : 'files are'} checked against it` } } : {}),
      watched,
      rules,
      columns: cards,
      discovered: [],
      count: rules.length + (cards ?? []).reduce((n, c) => n + c.rules.length, 0),
    };
  };
  return { files: doc.sources.map(section), types: typesShown(o) };
}
