// @vitest-environment node
// Shared rules (the server-side checks) and the completed PDF.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { completedPdf } from './index';
import {
  cleanAnswers,
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
