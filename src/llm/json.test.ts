import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from './json.js';

test('extractJson parses a bare array', () => {
  assert.deepEqual(extractJson('[{"a":1}]'), [{ a: 1 }]);
});

test('extractJson strips ```json fences', () => {
  assert.deepEqual(extractJson('```json\n{"x": true}\n```'), { x: true });
});

test('extractJson ignores surrounding prose', () => {
  assert.deepEqual(extractJson('Here you go: {"n": 2} hope that helps'), { n: 2 });
});

test('extractJson handles nested brackets', () => {
  assert.deepEqual(extractJson('[{"k":[1,2,{"z":3}]}]'), [{ k: [1, 2, { z: 3 }] }]);
});

test('extractJson throws when no JSON present', () => {
  assert.throws(() => extractJson('no json here'));
});
