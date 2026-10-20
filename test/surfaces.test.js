import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURFACES, findSurfaces } from '../src/surfaces.js';

test('one entry per researched surface', () => {
  assert.equal(SURFACES.length, 28);
  assert.equal(new Set(SURFACES.map((s) => s.id)).size, 28);
});

test('only sign-in identity is available now', () => {
  assert.deepEqual(findSurfaces({ status: 'available' }).map((s) => s.id), ['sign-in-identity']);
});

test('status counts match the table', () => {
  assert.equal(findSurfaces({ status: 'pending' }).length, 5);
  assert.equal(findSurfaces({ status: 'excluded' }).length, 2);
  assert.equal(findSurfaces({ status: 'blocked' }).length, 14);
  assert.equal(findSurfaces({ status: 'not-researched' }).length, 6);
});

test('an unknown status or group is an error, not an empty list', () => {
  assert.throws(() => findSurfaces({ status: 'maybe' }), RangeError);
  assert.throws(() => findSurfaces({ group: 'bots' }), RangeError);
});
