/**
 * The columns the two models read (src/core/modelcols.ts, ADR 0015 §6): an id, a file's key, free text, times and
 * columns with too many values are left out by default; the ontology's `models` says otherwise. A column left out can't
 * make either model speak.
 */
import { describe, expect, it } from 'vitest';
import { apartColumns, apartEvidence, appendSample, emptySample } from '../src/core/apart.js';
import { validateDocument, type FlowDocument } from '../src/core/document.js';
import { dataLeftOut, ID_LIKE, modelLeftOut } from '../src/core/modelcols.js';
import { judgeOf } from '../src/core/news.js';
import type { Ontology } from '../src/core/ontology.js';
import { random } from '../src/core/quality.js';
import { loadFlowDir, signinsDir } from './helpers/notebooks.js';

const O: Ontology = {
  objectTypes: [{ id: 'application', name: 'Application', dataset: 'apps', key: ['app_id'], title: 'name' }],
  linkTypes: [],
  actionTypes: [],
  properties: [
    { column: 'vendor_id', title: 'Vendor', description: 'Who sent it', values: { '1': 'Creative', '2': 'Curb' } },
    { column: 'session_key', title: 'Session', description: 'A session', models: 'include' },
    { column: 'status', title: 'Status', description: 'How it ended', models: 'exclude' },
  ],
};

describe('what the models leave out by default, and what the ontology says', () => {
  it('leaves out an id and a file’s key, never a code whose values the ontology lists, and follows include and exclude', () => {
    expect(modelLeftOut(O, 'apps', 'app_id')).toBe('the file’s key');
    expect(modelLeftOut(O, 'events', 'event_id')).toBe('an id');
    expect(modelLeftOut(O, 'events', 'id')).toBe('an id');
    expect(modelLeftOut(O, 'events', 'request_uuid')).toBe('an id');
    expect(modelLeftOut(O, 'events', 'vendor_id')).toBeNull();
    expect(modelLeftOut(O, 'events', 'session_key')).toBeNull();
    expect(modelLeftOut(O, 'events', 'status')).toBe('left out in the ontology');
    expect(modelLeftOut(O, 'events', 'method')).toBeNull();
    // Names that only end in the letters: VendorID, PULocationID are codes in the taxi example.
    expect(['VendorID', 'PULocationID', 'paid', 'monkey'].filter((c) => ID_LIKE.test(c))).toEqual([]);
  });

  it('says what the rows are where they leave a column out', () => {
    const rows = Array.from({ length: 300 }, (_, i) => [`u${i}`, i % 3 === 0 ? 'a' : 'b', '2024-03-01', i, null]);
    expect(dataLeftOut(rows, 0, 'category')).toBe('300 values: too many for a code');
    expect(dataLeftOut(rows, 1, 'code')).toBeNull();
    expect(dataLeftOut(rows, 2, 'code')).toBe('dates');
    expect(dataLeftOut(rows, 3, 'measure')).toBeNull();
    expect(dataLeftOut(rows, 4, 'empty')).toBe('empty');
    expect(dataLeftOut(rows, 3, 'time')).toBe('a time');
    expect(dataLeftOut(rows, 3, 'text')).toBe('free text');
  });

  it('is in the sign-in log’s shared ontology: the user excluded, the rest read', async () => {
    const doc = await loadFlowDir(signinsDir);
    expect(validateDocument(doc)).toEqual([]);
    const judge = judgeOf(doc, 'auth');
    expect(['event_time', 'result', 'method', 'country', 'ua_family', 'latency_ms', 'user'].map((c) => judge.models?.(c) ?? null)).toEqual([null, null, null, null, null, null, 'left out in the ontology']);
    const bad = { ...doc, ontology: { ...doc.ontology!, properties: [...doc.ontology!.properties!, { column: 'hour', title: 'H', description: 'x', models: 'maybe' }] } } as unknown as FlowDocument;
    expect(validateDocument(bad).map((i) => i.message)).toContain('include or exclude: whether the two models read the column');
  });
});

describe('a column left out can’t make the classifier speak', () => {
  const COLUMNS = ['status', 'ticket'];
  const KINDS = ['code', 'code'] as const;
  /** Rows of a status and a ticket from a few: `tickets` picks which tickets a day has. */
  const rows = (n: number, seed: number, tickets: string[]) => {
    const rnd = random(seed);
    return Array.from({ length: n }, () => [rnd() < 0.1 ? 'fail' : 'pass', tickets[Math.floor(rnd() * tickets.length)]!]);
  };
  let sample = emptySample({ flow: 'f', source: 's', columns: COLUMNS, kinds: [...KINDS] });
  for (let i = 1; i <= 28; i++) sample = appendSample(sample, `2023-09-${String(i).padStart(2, '0')}`, rows(60, i, ['t1', 't2', 't3']));
  // Today's tickets are new ones: only the ticket tells today apart.
  const today = rows(200, 99, ['t7', 't8', 't9']);

  it('speaks when it reads the ticket, and not when the ticket is left out, and says why it left it out', () => {
    const read = apartEvidence(sample, today, '2023-10-11', 'none');
    const left = apartEvidence(sample, today, '2023-10-11', 'none', () => true, (c) => c === 'ticket');
    expect('speaks' in read && read.speaks).toBe(true);
    expect('speaks' in left && left.speaks).toBe(false);
    expect(apartColumns(sample, '2023-10-11', 'none', () => true, (c) => (c === 'ticket' ? 'an id' : null))).toEqual([{ column: 'status', why: null }, { column: 'ticket', why: 'an id' }]);
  });
});
