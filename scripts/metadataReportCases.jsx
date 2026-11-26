import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import MainNav from '../src/renderer/src/components/MainNav';
import { MainAudioContext } from '../src/renderer/src/mainAudioContext';
import navStyles from '../src/renderer/src/style/MainNav.css';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const listeners = new Map();
window.ipcApi = {
  on: (channel, callback) => {
    listeners.set(channel, callback);
    return () => listeners.delete(channel);
  }
};
const emit = (channel, ...args) => act(async () => listeners.get(channel)(...args));
window.metadataReportTests = (async () => {
  const style = document.createElement('style');
  style.textContent = navStyles;
  document.head.append(style);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  window.ipcApi.getPendingTagSaves = async () => [{ track_id: 'pending', id: 'pending.flac' }];
  const timer = window.setTimeout;
  let timeouts = 0;
  window.setTimeout = (...args) => {
    if (args[1] === 15000) timeouts++;
    return timer(...args);
  };
  await act(async () =>
    root.render(
      <MainAudioContext.Provider
        value={{
          state: { mainTheme: 'basic', minimalmode: false, player: false },
          dispatch: () => {}
        }}
      >
        <MainNav onClick={() => {}} />
      </MainAudioContext.Provider>
    )
  );
  assert(
    !document.querySelector('.scan-result'),
    'Startup does not show tag-save recovery notifications'
  );
  const report = {
    modified: 1,
    failed: 2,
    nochange: false,
    details: {
      missing: [{ id: 'I:/Music/Old/missing.flac', error: 'File not found' }],
      bad: [{ id: 'D:\\Music\\broken.flac', error: 'Invalid FLAC stream info', source: 'catalog' }],
      modified: [
        {
          id: 'I:/Music/New/updated.flac',
          reason: 'Refreshed because the file modification time is newer than the catalog',
          previousModified: 1000,
          modified: 2000,
          changes: [{ field: 'title', before: 'Old title', after: 'New title' }]
        }
      ]
    }
  };
  await emit('update-complete', 'metadata', report);
  assert(document.querySelectorAll('.metadata-report-section').length === 3, 'Three sections');
  assert(
    !document.body.textContent.includes('files with errors'),
    'No repeated error total beneath title'
  );
  assert(
    document.querySelector('.metadata-report-section').getAttribute('aria-label') ===
      'Catalog entries updated',
    'Updated filenames and paths appear first'
  );
  assert(
    document.querySelector('[aria-label="Catalog entries updated"] .metadata-report-location')
      .textContent === 'I:/Music/New/updated.flac',
    'Updated file path is visible'
  );
  assert(document.body.textContent.includes('Missing files (1)'), 'Missing count');
  assert(document.body.textContent.includes('Bad / unreadable files (1)'), 'Bad count');
  assert(document.body.textContent.includes('Catalog entries updated (1)'), 'Modified count');
  assert(
    document.querySelector('[aria-label="Missing files"] .metadata-report-file').title ===
      'I:/Music/Old/missing.flac',
    'Full path available on hover'
  );
  assert(document.body.textContent.includes('Invalid FLAC stream info'), 'Reason visible');
  assert(
    document.querySelector('[title^="Previously recorded Track Error:"]'),
    'Stored errors are identified'
  );
  await emit('update-complete', 'metadata', {
    ...report,
    details: Object.fromEntries(
      Object.entries(report.details).map(([kind, files]) => [
        kind,
        [...files, { ...files[0], id: `I:/Music/Second ${kind}.flac` }]
      ])
    )
  });
  for (const section of document.querySelectorAll('.metadata-report-section')) {
    const [first, second] = section.querySelectorAll('li');
    assert(
      second.getBoundingClientRect().top >= first.getBoundingClientRect().bottom,
      'Files stack in rows in every section'
    );
    assert(first.children.length === 3, 'Each row contains file, location and reason');
    const [name, location, reason] = first.children;
    assert(name.textContent.trim().startsWith('1 -'), 'Rows are numbered');
    assert(location.title === location.textContent, 'Location tooltip has the full path');
    assert(
      Math.abs(name.getBoundingClientRect().top - location.getBoundingClientRect().top) <= 2 &&
        Math.abs(location.getBoundingClientRect().top - reason.getBoundingClientRect().top) <= 2,
      'File, location and reason share one line'
    );
    assert(getComputedStyle(location).textOverflow === 'ellipsis', 'Long locations are shortened');
  }
  assert(
    !document.querySelector('[title*="Old title → New title"]'),
    'No edited-field claims in the report'
  );
  assert(
    document.querySelector('[title*="Previous catalog timestamp:"]'),
    'Updated row explains timestamp trigger'
  );
  assert(timeouts === 0, 'Detailed results do not expire');
  await act(async () => document.querySelector('[aria-label="Dismiss scan result"]').click());
  assert(!document.querySelector('.scan-result'), 'Dismiss works');
  const large = {
    ...report,
    details: {
      ...report.details,
      missing: Array.from({ length: 117 }, (_, i) => ({ id: `I:/Music/${i}.flac` }))
    }
  };
  await emit('update-complete', 'metadata', large);
  const section = document.querySelector('[aria-label="Missing files"]');
  assert(section.querySelectorAll('li').length === 100, 'Large list initially bounded');
  await act(async () => section.querySelector('button').click());
  assert(section.querySelectorAll('li').length === 117, 'All paths accessible');
  await emit('update-error', 'meta-error', {
    result: 'Database locked',
    report: {
      ...report,
      modified: 0,
      error: 'Database locked',
      details: { ...report.details, modified: [] }
    }
  });
  assert(
    document.querySelector('[role="alert"]').textContent === 'Database locked',
    'Database failure detail survives IPC'
  );
  assert(
    document.body.textContent.includes('Catalog entries updated (0)'),
    'No false successful saves'
  );
  await emit('update-complete', 'metadata', {
    modified: 0,
    failed: 0,
    nochange: true,
    details: { missing: [], bad: [], modified: [] }
  });
  assert(
    document.querySelectorAll('.metadata-report-section').length === 3,
    'Empty report retains three sections'
  );
  assert(document.body.textContent.includes('No changes found.'), 'Empty report explained');
  await act(async () => root.unmount());
  window.setTimeout = timer;
  assert(listeners.size === 0, 'Listeners cleaned up');
  return [
    'PASS: Update Meta shows all three sections, full paths and reasons; details remain until dismissed; all large-list entries are accessible; database errors preserve the report'
  ];
})();
