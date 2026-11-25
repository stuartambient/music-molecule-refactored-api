import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TagUpdateState from '../src/renderer/src/components/table/TagUpdateStatus';
import { EditorThemeContext } from '../src/renderer/src/editorThemeContext';
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
  style.textContent = themeStyles + reportStyles;
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
  await click('View');
  assert(document.querySelector('dialog[open]'), 'View opens a modal report');
  assert(document.querySelector('li span').textContent === 'Track One.flac', 'Filename only');
  assert(
    document.querySelector('li span').title === 'I:/Music/Album/Track One.flac',
    'Full path tooltip'
  );
  assert(document.querySelector('li strong').textContent === 'Updated', 'Success displayed');
  await click('Close');
  assert(!document.querySelector('dialog'), 'Close removes report');
  await click('View');
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
  await click('View');
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
  await click('View');
  assert(
    document.querySelector('[role="alert"]').textContent.includes('retry'),
    'Retry message visible'
  );
  assert(
    document.querySelector('li strong').textContent === 'Not confirmed',
    'Unconfirmed saves are not called successful'
  );
  await click('Close');
  await click('Dismiss');
  assert(!document.querySelector('.tag-update-status-notice'), 'Dismiss clears status');
  await emit({
    status: 'success',
    passed: Array.from({ length: 105 }, (_, i) => ({
      track_id: String(i),
      track: `I:/Music/Track ${i}.flac`
    })),
    res: { files: [] }
  });
  await click('View');
  assert(document.querySelectorAll('li').length === 100, 'Large saves keep report bounded');
  assert(
    document.querySelector('dialog').textContent.includes('first 100 of 105'),
    'Truncation explained'
  );
  assert(document.querySelector('dialog').getBoundingClientRect().width <= 522, 'Compact width');
  await emit({ status: 'starting' });
  assert(!document.querySelector('dialog'), 'New save clears old report');
  await act(async () => root.unmount());
  assert(!listener, 'IPC subscription cleaned up');
  return [
    'PASS: View lists saved filenames, outcomes, paths and errors; Close, Escape, Dismiss and new saves clear the report; large reports stay compact'
  ];
})();
