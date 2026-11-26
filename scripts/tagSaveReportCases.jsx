import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TagUpdateState from '../src/renderer/src/components/table/TagUpdateStatus';
import { EditorThemeContext } from '../src/renderer/src/editorThemeContext';
import statusStyles from '../src/renderer/src/components/table/styles/TagSaveStatus.css';
import toolbarStyles from '../src/renderer/src/components/table/styles/CustomToolPanel.css';
import reportStyles from '../src/renderer/src/components/table/styles/TagSaveReport.css';
import themeStyles from '../src/renderer/src/themes.css';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
let listener;
window.tagEditApi = {
  on: (_, handler) => {
    listener = handler;
    return () => {
      listener = null;
    };
  }
};
function App() {
  const [status, setStatus] = useState('');
  const [, setReport] = useState({});
  return (
    <EditorThemeContext.Provider value={{ theme: 'dark' }}>
      <TagUpdateState updateStatus={status} setUpdateStatus={setStatus} setTagReport={setReport} />
    </EditorThemeContext.Provider>
  );
}
const emit = (msg) => act(async () => listener(msg));
const click = (text) =>
  act(async () => {
    const button = [...document.querySelectorAll('button')].find(
      (node) => node.textContent === text
    );
    assert(button, `Missing ${text}`);
    button.click();
  });
window.tagSaveReportTests = (async () => {
  const style = document.createElement('style');
  style.textContent = themeStyles + reportStyles + toolbarStyles + statusStyles;
  document.head.append(style);
  document.documentElement.dataset.editorTheme = 'dark';
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<App />));
  await emit({
    status: 'success',
    passed: [{ track_id: '1', track: 'I:/Music/Album/Track One.flac' }],
    res: { files: [{ track_id: '1' }] }
  });
  await click('View result');
  assert(document.querySelector('dialog[open]'), 'View opens a modal report');
  assert(document.querySelector('li span').textContent === 'Track One.flac', 'Filename only');
  assert(
    document.querySelector('li span').title === 'I:/Music/Album/Track One.flac',
    'Full path tooltip'
  );
  assert(document.querySelector('li strong').textContent === 'Updated', 'Success displayed');
  await click('Close');
  assert(!document.querySelector('dialog'), 'Close removes report');
  await click('View result');
  await act(async () =>
    document
      .querySelector('dialog')
      .dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
  );
  assert(!document.querySelector('dialog'), 'Escape closes report');
  await emit({
    status: 'partial_status',
    passed: [{ track_id: '1', track: 'I:/Music/Good.flac' }],
    failed: [{ track_id: '2', id: 'I:\\Music\\Bad.flac', error: 'Permission denied' }],
    res: { files: [] }
  });
  await click('View result');
  assert(
    document.querySelector('li span').textContent === 'Bad.flac',
    'Failures first, Windows filename works'
  );
  assert(
    document.querySelector('small').textContent === 'Permission denied',
    'Failure detail displayed'
  );
  assert(document.querySelector('dialog').textContent.includes('1 updated'), 'Counts displayed');
  await click('Close');
  await emit({
    status: 'error',
    error: 'Catalog refresh failed. Run Update Meta to retry.',
    affected: [{ track_id: '3', id: 'I:/Music/Retry.flac' }]
  });
  await click('View result');
  assert(
    document.querySelector('[role="alert"]').textContent.includes('retry'),
    'Retry message visible'
  );
  assert(
    document.querySelector('li strong').textContent === 'Not confirmed',
    'Unconfirmed saves are not called successful'
  );
  await click('Close');
  await click('Dismiss result');
  assert(!document.querySelector('.tag-save-latest'), 'Dismiss clears status');
  await emit({
    status: 'success',
    passed: Array.from({ length: 105 }, (_, i) => ({
      track_id: String(i),
      track: `I:/Music/Track ${i}.flac`
    })),
    res: { files: [] }
  });
  await click('View result');
  assert(document.querySelectorAll('li').length === 100, 'Large saves keep report bounded');
  assert(
    document.querySelector('dialog').textContent.includes('first 100 of 105'),
    'Truncation explained'
  );
  assert(document.querySelector('dialog').getBoundingClientRect().width <= 522, 'Compact width');
  await emit({ status: 'starting' });
  assert(!document.querySelector('dialog'), 'New save clears old report');
  const unfinished = [
    {
      track_id: 'pending',
      id: 'I:/Music/Pending.flac',
      error: 'Database locked',
      revision: 'a'.repeat(64)
    }
  ];
  await emit({
    status: 'failed',
    passed: [],
    failed: unfinished,
    pending: unfinished,
    outcomes: [
      {
        ...unfinished[0],
        outcome: 'Tags saved; catalog refresh failed',
        success: false,
        verification: { status: 'confirmed' },
        catalog: { status: 'failed' }
      }
    ],
    res: { files: [] }
  });
  assert(!document.querySelector('.tag-save-attention'), 'Unfinished details start collapsed');
  const toggleAttention = () =>
    act(async () => document.querySelector('.tag-save-attention-toggle').click());
  assert(
    document.querySelector('.tag-save-attention-toggle').textContent.includes('1'),
    'Count remains visible while collapsed'
  );
  await toggleAttention();
  assert(
    document.querySelector('.tag-save-attention-toggle').getAttribute('aria-expanded') === 'true',
    'Expanded state is accessible'
  );
  assert(document.querySelector('.tag-save-attention'), 'Unfinished details can be expanded');
  await toggleAttention();
  assert(
    !document.querySelector('.tag-save-attention'),
    'Details can be hidden without losing the count'
  );
  await toggleAttention();
  await click('View result');
  assert(
    document.querySelector('dialog').textContent.includes('Tags saved; catalog refresh failed'),
    'Separate file and database outcome'
  );
  assert(
    document.querySelector('.tag-save-stages').textContent.includes('Tags: verified'),
    'Verification stage shown'
  );
  await click('Close');
  let retries = 0;
  window.tagEditApi.retryTagSaves = async () => {
    retries++;
    listener({ status: 'starting' });
    await Promise.resolve();
    listener({
      status: 'success',
      recovery: true,
      pending: [],
      passed: [{ track_id: 'pending', track: unfinished[0].id }],
      failed: [],
      outcomes: [
        {
          track_id: 'pending',
          id: unfinished[0].id,
          success: true,
          outcome: 'Saved and catalog updated',
          verification: { status: 'confirmed' },
          catalog: { status: 'updated' }
        }
      ],
      res: { files: [{ track_id: 'pending' }] }
    });
  };
  await click('Recheck files');
  assert(retries === 1, 'Recovery action calls the read-only recheck operation');
  assert(
    !document.querySelector('.tag-save-attention'),
    'Confirmed recovery clears pending notice'
  );
  await click('View result');
  assert(
    document.querySelector('dialog').textContent.includes('Saved and catalog updated'),
    'Recovery confirmation shown'
  );
  await click('Close');
  await act(async () => root.unmount());
  assert(!listener, 'IPC subscription cleaned up');
  window.tagEditApi.getPendingTagSaves = async () => unfinished;
  const reopened = createRoot(host);
  await act(async () => reopened.render(<App />));
  assert(!document.querySelector('.tag-save-attention'), 'Reopened editor keeps details collapsed');
  await toggleAttention();
  assert(
    document
      .querySelector('.tag-save-attention')
      .textContent.includes('1 file awaiting confirmation'),
    'Reopening editor discovers durable unfinished saves'
  );
  await click('Review files');
  assert(
    document.querySelector('dialog').textContent.includes('Pending.flac'),
    'Recovered file names can be reviewed'
  );
  await click('Close');
  await emit({
    status: 'success',
    passed: [{ track_id: 'new', track: 'I:/Music/New batch.flac' }],
    failed: [],
    pending: unfinished,
    res: { files: [] }
  });
  assert(document.querySelectorAll('.tag-save-panel').length === 1, 'Both states share one panel');
  assert(
    document.querySelector('.tag-save-latest').textContent.includes('Saved and checked'),
    'Latest success is distinct from older unresolved saves'
  );
  await click('Review files');
  assert(
    document.querySelector('dialog').textContent.includes('Pending.flac'),
    'Review shows pending files'
  );
  await click('Close');
  await click('View result');
  assert(
    document.querySelector('dialog').textContent.includes('New batch.flac'),
    'Pending review never overwrites the latest save result'
  );
  assert(
    !document.querySelector('dialog').textContent.includes('Pending.flac'),
    'Latest result remains scoped to its batch'
  );
  await click('Close');
  await click('Dismiss result');
  assert(
    document.querySelector('.tag-save-attention'),
    'Dismissing latest result preserves unresolved files'
  );
  assert(!document.querySelector('.tag-save-latest'), 'Dismiss applies only to the latest row');
  let forgetCalls = 0;
  window.tagEditApi.forgetTagSave = async (request) => {
    forgetCalls++;
    assert(
      request.track_id === 'pending' && request.revision === 'a'.repeat(64),
      'Only the reviewed record is requested'
    );
    return { status: 'error', error: 'Simulated removal failure' };
  };
  await click('Review files');
  await click('Forget unfinished save');
  assert(
    document
      .querySelector('dialog')
      .textContent.includes('audio file and catalog entry will not be changed'),
    'Scope warning shown'
  );
  assert(forgetCalls === 0, 'Opening warning does not remove records');
  await click('Keep record');
  assert(forgetCalls === 0, 'Cancel leaves recovery record untouched');
  await click('Forget unfinished save');
  await click('Forget record');
  assert(
    document.querySelector('[role="alert"]').textContent.includes('Simulated removal failure'),
    'Removal failure remains visible'
  );
  assert(document.querySelector('.tag-save-attention-toggle'), 'Failure keeps attention badge');
  window.tagEditApi.forgetTagSave = async () => ({ status: 'success', removed: true, pending: [] });
  await click('Forget record');
  assert(!document.querySelector('dialog'), 'Forgetting the last record closes the pending view');
  assert(
    !document.querySelector('.tag-save-attention-toggle'),
    'Last forgotten record clears the attention badge'
  );
  await act(async () => reopened.unmount());

  let previewRoot;
  window.previewTagSaveStatus = async (theme) => {
    document.documentElement.dataset.editorTheme = theme;
    document.documentElement.dataset.themeSurface = 'editor';
    document.body.style.fontFamily = 'Segoe UI, sans-serif';
    document.body.style.padding = '16px';
    if (!previewRoot) {
      const surface = document.createElement('div');
      surface.className = 'column-panel';
      document.body.append(surface);
      previewRoot = createRoot(surface);
      await act(async () =>
        previewRoot.render(
          <fieldset>
            <button className="panel-button">Save all</button>
            <button className="panel-button">Undo</button>
            <App />
          </fieldset>
        )
      );
    }
    await emit({
      status: 'success',
      passed: [{ track_id: 'new', track: 'I:/Music/New batch.flac' }],
      failed: [],
      pending: unfinished,
      res: { files: [] }
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const button = document.querySelector('.tag-save-actions button');
    return {
      theme,
      background: getComputedStyle(button).backgroundColor,
      text: getComputedStyle(button).color
    };
  };
  return [
    'PASS: View lists saved filenames, outcomes, paths and errors; Close, Escape, Dismiss and new saves clear the report; large reports stay compact'
  ];
})();
