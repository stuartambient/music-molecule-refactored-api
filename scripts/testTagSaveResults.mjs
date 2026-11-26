import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileTagSaveResult } from '../src/renderer/src/utility/tagSaveResults.js';

test('a completed save preserves a newer edit to the same field and its visible grid value', () => {
  const submitted = { rowId: 'one', field: 'title', newValue: 'Saved title' };
  const newer = { rowId: 'one', field: 'title', newValue: 'New unsaved title' };
  const result = reconcileTagSaveResult([submitted, newer], new Set([submitted]), {
    passed: [{ track_id: 'one' }],
    res: { files: [{ track_id: 'one', title: 'Saved title', album: 'Catalog album' }] }
  });
  assert.deepEqual(result.remaining, [newer]);
  assert.equal(result.rows[0].title, 'New unsaved title');
  assert.equal(result.rows[0].album, 'Catalog album');
});

test('partial saves clear confirmed edits while failed requests remain editable', () => {
  const good = { rowId: 'good', field: 'title', newValue: 'Good' },
    bad = { rowId: 'bad', field: 'title', newValue: 'Retry this' };
  const result = reconcileTagSaveResult([good, bad], new Set([good, bad]), {
    passed: [{ track_id: 'good' }],
    res: { files: [{ track_id: 'bad', title: 'Actual on disk' }] }
  });
  assert.deepEqual(result.remaining, [bad]);
  assert.equal(result.rows[0].title, 'Retry this');
});

test('recovery clears its submitted request but preserves unrelated and newer edits', () => {
  const old = { rowId: 'one', field: 'title', newValue: 'Already saved' },
    other = { rowId: 'two', field: 'year', newValue: 2026 };
  const result = reconcileTagSaveResult([old, other], new Set([old]), {
    recovery: true,
    passed: [{ track_id: 'one' }],
    res: { files: [{ track_id: 'one', title: 'Already saved' }] }
  });
  assert.deepEqual(result.remaining, [other]);
  const reopened = reconcileTagSaveResult([other], new Set(), {
    recovery: true,
    passed: [{ track_id: 'two' }],
    res: { files: [{ track_id: 'two', year: 2025 }] }
  });
  assert.deepEqual(reopened.remaining, [other]);
  assert.equal(reopened.rows[0].year, 2026);
});
