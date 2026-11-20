// @vitest-environment node
// Shared rules (the server-side checks) and the completed PDF.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { completedPdf } from './index';
import {
  cleanAnswers,
  fileIds,
  perRowOf,
  type FieldDef,
  fieldStates,
  validateAnswers,
  validateFields,
  validateLayout,
} from '../index';

const field = (key: string, extra: Partial<FieldDef> = {}): FieldDef => ({
  id: key,
  key,
  type: 'text',
  label: key,
  source: 'manual',
  position: { page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.05 },
  ...extra,
});

test('validateFields: accepts a good mapping', () => {
  assert.deepEqual(validateFields([field('name'), field('age', { type: 'number', min: 0, max: 120 })], 1), []);
});

test('validateFields: duplicate keys, bad position, page out of range, missing options, bad regex', () => {
  const errors = validateFields(
    [
      field('a'),
      { ...field('a'), id: 'a2' },
      field('b', { position: { page: 1, x: 0.9, y: 0.1, width: 0.3, height: 0.05 } }),
      field('c', { position: { page: 3, x: 0, y: 0, width: 0.1, height: 0.1 } }),
      field('d', { type: 'dropdown', options: [] }),
      field('e', { pattern: '(' }),
    ],
    2,
  );
  assert.equal(errors.length, 5, errors.join('\n'));
});

test('validateFields: unknown and circular condition references', () => {
  const when = (fieldKey: string) => ({ logic: 'and' as const, rules: [{ fieldKey, op: 'isNotEmpty' as const }] });
  assert.match(validateFields([field('a', { visibleWhen: when('zzz') })], 1).join(), /unknown field "zzz"/);
  const cyc = validateFields(
    [
      field('a', { visibleWhen: when('b') }),
      field('b', { requiredWhen: when('c') }),
      field('c', { visibleWhen: when('a') }),
    ],
    1,
  );
  assert.match(cyc.join(), /Circular condition: a → b → c → a/);
});

test('conditions: nested AND/OR, hidden fields are not required', () => {
  const fields = [
    field('status', { type: 'dropdown', options: ['Employed', 'Other'] }),
    field('age', { type: 'number' }),
    field('company', {
      required: true,
      visibleWhen: {
        logic: 'or',
        rules: [
          { fieldKey: 'status', op: 'equals', value: 'employed' },
          { logic: 'and', rules: [{ fieldKey: 'age', op: 'between', value: '18', value2: '30' }] },
        ],
      },
    }),
  ];
  assert.equal(fieldStates(fields, { status: 'Other' }).company.visible, false);
  assert.deepEqual(validateAnswers(fields, { status: 'Other' }), {});
  assert.equal(fieldStates(fields, { status: 'Other', age: '25' }).company.visible, true);
  assert.deepEqual(Object.keys(validateAnswers(fields, { status: 'Employed' })), ['company']);
});

test('validateAnswers: types, ranges, options, regex', () => {
  const fields = [
    field('n', { type: 'number', min: 1, max: 5 }),
    field('e', { type: 'email' }),
    field('p', { type: 'phone' }),
    field('d', { type: 'date' }),
    field('r', { type: 'radio', options: ['Yes', 'No'] }),
    field('code', { pattern: '[A-Z]{3}' }),
    field('sig', { type: 'signature' }),
  ];
  const errs = validateAnswers(fields, {
    n: '9',
    e: 'x@',
    p: 'abc',
    d: '2026-13-45',
    r: 'Maybe',
    code: 'ab',
    sig: 'javascript:alert(1)',
  });
  assert.deepEqual(Object.keys(errs).sort(), ['code', 'd', 'e', 'n', 'p', 'r', 'sig']);
  const ok = validateAnswers(fields, {
    n: '3',
    e: 'a@b.co',
    p: '+91 98765 43210',
    d: '2026-11-10',
    r: 'Yes',
    code: 'ABC',
  });
  assert.deepEqual(ok, {});
});

test('cleanAnswers: drops unknown keys and wrong value types', () => {
  const fields = [field('t'), field('c', { type: 'checkbox' })];
  assert.deepEqual(cleanAnswers(fields, { t: 'x', c: 'yes', evil: 'y', __proto__: { a: 1 } }), { t: 'x', c: false });
});

test('completedPdf: writes answers into a copy, original bytes unchanged', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const original = Buffer.from(await doc.save());
  const copy = Buffer.from(original);
  const out = await completedPdf(
    original,
    [field('name'), field('ok', { type: 'checkbox' }), field('note', { type: 'textarea' })],
    { name: 'Ravi Kumar ✓', ok: true, note: 'line one\nline two' },
    {},
  );
  assert.ok(original.equals(copy));
  const reread = await PDFDocument.load(out);
  assert.equal(reread.getPageCount(), 1);
  assert.ok(out.length > original.length);
});

test('completedPdf: a long textarea pushes what is below it down, onto an added page when needed', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const original = await doc.save();
  const note = field('note', { type: 'textarea', position: { page: 1, x: 0.1, y: 0.5, width: 0.3, height: 0.05 } });
  const pagesFor = async (text: string) =>
    (await PDFDocument.load(await completedPdf(original, [note], { note: text }))).getPageCount();
  assert.equal(await pagesFor('short'), 1);
  assert.equal(await pagesFor('word '.repeat(40)), 2); // page bottom moved onto an added page, nothing cut off
  assert.ok((await pagesFor('word '.repeat(3000))) > 2);
  const line = field('line', { position: { page: 1, x: 0.1, y: 0.5, width: 0.3, height: 0.02 } });
  const linePages = async (text: string) =>
    (await PDFDocument.load(await completedPdf(original, [line], { line: text }))).getPageCount();
  assert.equal(await linePages('fits on one line'), 1);
  assert.equal(await linePages('word '.repeat(40)), 2); // a text field wraps and grows too
});

test('validateLayout: page sources, sizes, element bounds, colours', () => {
  const pages = [
    { source: 2, width: 595, height: 842 },
    { source: null, width: 595, height: 842 },
  ];
  const ok = {
    pages,
    elements: [
      {
        id: 'e',
        type: 'text',
        page: 2,
        position: { x: 0, y: 0, width: 0.5, height: 0.1 },
        text: 'Hi',
        fill: '#ffffff',
      },
    ],
  };
  assert.deepEqual(validateLayout(ok, 2), []);
  assert.equal(validateLayout({ pages: [], elements: [] }, 2).length, 1);
  const bad = validateLayout(
    {
      pages: [{ source: 3, width: 595, height: 842 }],
      elements: [{ id: 'a', type: 'text', page: 2, position: { x: 0.9, y: 0, width: 0.5, height: 0.1 }, color: 'red' }],
    },
    2,
  );
  assert.equal(bad.length, 4, bad.join('\n'));
});

test('completedPdf with a layout: reordered + blank pages, replaced text, original unchanged', async () => {
  const src = await PDFDocument.create();
  src.addPage([600, 800]);
  src.addPage([800, 600]);
  const original = Buffer.from(await src.save());
  const copy = Buffer.from(original);
  const layout = {
    pages: [
      { source: 2, width: 800, height: 600 },
      { source: null, width: 595, height: 842 },
      { source: 1, width: 600, height: 800 },
    ],
    elements: [
      {
        id: 't',
        type: 'text' as const,
        page: 3,
        position: { x: 0.1, y: 0.1, width: 0.5, height: 0.05 },
        text: 'New heading text that wraps',
        fill: '#ffffff',
        bold: true,
        fontSize: 14,
        align: 'center' as const,
      },
      {
        id: 'b',
        type: 'box' as const,
        page: 2,
        position: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
        stroke: '#000000',
      },
      {
        id: 'l',
        type: 'line' as const,
        page: 1,
        position: { x: 0.1, y: 0.5, width: 0.8, height: 0 },
        stroke: '#ff0000',
        strokeWidth: 2,
      },
    ],
  };
  const out = await completedPdf(
    original,
    [field('name', { position: { page: 2, x: 0.1, y: 0.5, width: 0.3, height: 0.05 } })],
    { name: 'X' },
    {},
    layout,
  );
  const reread = await PDFDocument.load(out);
  assert.deepEqual(
    reread.getPages().map((p) => [p.getWidth(), p.getHeight()]),
    [
      [800, 600],
      [595, 842],
      [600, 800],
    ],
  );
  assert.ok(original.equals(copy));
});

test('completedPdf: the new types print as people read them', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const at = (i: number) => ({ page: 1, x: 0.1, y: 0.05 + i * 0.07, width: 0.6, height: 0.05 });
  const fields: FieldDef[] = [
    field('multi', { type: 'multiselect', options: ['Fire', 'Flood'], position: at(0) }),
    field('list', { type: 'checklist', options: ['A', 'B'], position: at(1) }),
    field('money', { type: 'currency', currency: '$', decimals: 2, position: at(2) }),
    field('stars', { type: 'rating', position: at(3) }),
    field('when', { type: 'datetime', position: at(4) }),
    field('on', { type: 'toggle', position: at(5) }),
  ];
  const out = await completedPdf(
    await doc.save(),
    fields,
    { multi: '["Fire","Flood"]', list: '["B"]', money: '12.5', stars: '4', when: '2026-11-12T14:05', on: true },
    {},
  );
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: out }).promise;
  const page = await pdf.getPage(1);
  const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('|');
  for (const want of ['Fire, Flood', 'B', '$12.50', '4 / 5', '2026-11-12 14:05', 'Yes']) assert.ok(text.includes(want), `${want} in ${text}`);
});

test('completedPdf: follow-up answers and comments go on pages at the end', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const fields: FieldDef[] = [
    field('ok', {
      type: 'radio',
      label: 'Certificates OK',
      options: ['Yes', 'No'],
      comments: true,
      followUp: { when: { logic: 'and', rules: [{ fieldKey: 'ok', op: 'equals', value: 'No' }] }, fields: ['why'] },
    }),
    field('why', { type: 'textarea', label: 'Why not', dialogOnly: true }),
  ];
  const long = 'Survey overdue '.repeat(40);
  const out = await completedPdf(await doc.save(), fields, { ok: 'No', why: long }, {}, null, {
    comments: { ok: [{ id: 'c1', text: 'Checked with class', by: 'Asha', at: '2026-11-12T10:05:00Z' }] },
  });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: out }).promise;
  const pageText = async (n: number) =>
    (await (await pdf.getPage(n)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ');
  assert.equal(pdf.numPages, 3); // the form, additional answers, comments
  assert.ok(!(await pageText(1)).includes('Survey overdue')); // the dialog answer has no box on the page
  const extra = await pageText(2);
  assert.ok(extra.includes('Additional answers') && extra.includes('Certificates OK (page 1)') && extra.includes('Why not: Survey overdue'));
  const notes = await pageText(3);
  assert.ok(notes.includes('Comments') && notes.includes('Asha, 2026-11-12 10:05: Checked with class'), notes);
});

test("the original's own fillable fields are printed as they look and removed from the completed PDF", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  doc.getForm().createTextField('name').addToPage(page, { x: 40, y: 760, width: 240, height: 22 });
  const fields = [field('name', { position: { page: 1, x: 40 / 595, y: 60 / 842, width: 240 / 595, height: 22 / 842 } })];
  const out = await completedPdf(await doc.save(), fields, { name: 'Asha Verma' });
  const back = await PDFDocument.load(out);
  assert.equal(back.getForm().getFields().length, 0);
  assert.equal(back.getPage(0).node.Annots()?.size() ?? 0, 0);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const text = await (await (await getDocument({ data: out }).promise).getPage(1)).getTextContent();
  assert.ok(text.items.some((i) => 'str' in i && i.str === 'Asha Verma'));
});

test('completedPdf: an attached photo is drawn in its box at the chosen ratio, a non-photo only attached', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const original = await doc.save();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const files = { p1: { bytes: png, fileName: 'site.png', fileType: 'image/png' }, t1: { bytes: Buffer.from('hi'), fileName: 'a.txt', fileType: 'text/plain' } };
  const run = (photosPerRow: number | undefined, id: string) =>
    completedPdf(original, [field('p', { type: 'file', photosPerRow })], { p: id }, files);
  const plain = await run(undefined, 'p1');
  const drawn = await run(1, 'p1');
  assert.ok(drawn.length > plain.length); // the picture is drawn as well as attached
  assert.equal((await PDFDocument.load(await run(1, 't1'))).getPageCount(), 1); // a text file: just attached
  assert.equal(perRowOf(field('p', { type: 'file', photosPerRow: 3 })), 1); // one file: one photo
  assert.equal(perRowOf(field('p', { type: 'file', photosPerRow: 9, multiple: true })), 6);
  assert.equal(perRowOf(field('p', { type: 'file' })), 0);
});

test('completedPdf: a field with several files attaches each and prints their names', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const original = await doc.save();
  const files = {
    a: { bytes: Buffer.from('one'), fileName: 'a.txt', fileType: 'text/plain' },
    b: { bytes: Buffer.from('two'), fileName: 'b.txt', fileType: 'text/plain' },
  };
  const f = [field('docs', { type: 'file', multiple: true })];
  const one = await completedPdf(original, f, { docs: '["a"]' }, files);
  const two = await completedPdf(original, f, { docs: '["a","b"]' }, files);
  assert.ok(two.length > one.length);
  assert.deepEqual(fileIds('["a","b"]'), ['a', 'b']);
  assert.deepEqual(fileIds('a'), ['a']);
  assert.deepEqual(fileIds(null), []);
  assert.deepEqual(validateAnswers(f, { docs: '["a","b"]' }), {});
});

test('completedPdf: many photos grow their box row by row, onto a new page when needed', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  const original = await doc.save();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const ids = Array.from({ length: 20 }, (_, i) => `p${i}`);
  const files = Object.fromEntries(ids.map((id) => [id, { bytes: png, fileName: `${id}.png`, fileType: 'image/png' }]));
  // a box 1/8 page tall (100pt), 2 photos a row → 10 rows of 100pt
  const f = [field('ph', { type: 'file', multiple: true, photosPerRow: 2, position: { page: 1, x: 0.1, y: 0.5, width: 0.5, height: 0.125 } })];
  const out = await completedPdf(original, f, { ph: JSON.stringify(ids) }, files);
  assert.ok((await PDFDocument.load(out)).getPageCount() > 1);
});
