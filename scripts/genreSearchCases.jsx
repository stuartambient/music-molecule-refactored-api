/* global window, document, Event */
import { act, useState, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import MediaMenu from '../src/renderer/src/components/MediaMenu.jsx';
import { MainAudioContext } from '../src/renderer/src/mainAudioContext.js';
import Home from '../src/renderer/src/components/Home.jsx';
import reducer from '../src/renderer/src/audioPlayerReducer.js';
import { useTracks } from '../src/renderer/src/hooks/useDb.jsx';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const host = document.createElement('div');
host.style.cssText = 'max-width:900px;margin:60px auto;color:var(--ui-text);';
document.body.append(host);
const root = createRoot(host);
let submissions = [];
export function Menu({ listType = 'files', theme = 'basic' }) {
  const [field, setField] = useState('metadata');
  return (
    <MainAudioContext.Provider
      value={{ state: { listType, mainTheme: theme }, dispatch: () => {} }}
    >
      <h2>Lists / Tracks</h2>
      <MediaMenu
        tracksSearchField={field}
        onTracksSearchFieldChange={setField}
        handleTextSearch={(event) => {
          event.preventDefault();
          submissions.push({ term: event.currentTarget.elements.textsearch.value, field });
        }}
      />
    </MainAudioContext.Provider>
  );
}
export function CoversFixture() {
  const [state, dispatch] = useReducer(reducer, {
    home: true,
    covers: [],
    coversPageNumber: 0,
    coversSearchTerm: '',
    coversSearchField: 'metadata',
    coversMissingReq: 'not-requested',
    coversDateSort: 'DESC'
  });
  return (
    <MainAudioContext.Provider value={{ state, dispatch }}>
      <h2>Covers</h2>
      <Home />
    </MainAudioContext.Provider>
  );
}
window.genreTests = (async () => {
  const results = [];
  await act(async () => {
    root.render(<Menu />);
  });
  const select = document.querySelector('select[aria-label="Search tracks by"]');
  assert(select && select.value === 'metadata', 'Track search default changed');
  await act(async () => {
    select.value = 'genre';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert(
    document.querySelector('input').getAttribute('placeholder') === 'e.g. prog rock',
    'Genre hint missing'
  );
  await act(async () => {
    document.querySelector('input').value = 'rock prog';
    document.querySelector('button[type="submit"]').click();
  });
  assert(
    submissions[0].field === 'genre' && submissions[0].term === 'rock prog',
    'Genre query was not submitted'
  );
  results.push('PASS explicit genre selection and query submission');
  await act(async () => {
    root.render(<Menu listType="albums" />);
  });
  assert(!document.querySelector('select'), 'Genre selector leaked into Albums');
  results.push('PASS Albums search remains separate');
  await act(async () => {
    root.render(null);
  });
  const requests = [],
    actions = [];
  window.ipcApi = {
    getTracks: (...args) =>
      new Promise((resolve) => {
        requests.push({ args, resolve });
      })
  };
  const dispatch = (action) => actions.push(action);
  function Query({ field }) {
    useTracks(0, 'rock', 'DESC', 'same', {}, dispatch, false, field);
    return null;
  }
  await act(async () => {
    root.render(<Query field="metadata" />);
  });
  await act(async () => {
    root.render(<Query field="genre" />);
  });
  assert(
    requests.length === 2 && requests[1].args[3] === 'genre' && requests[1].args[0] === null,
    'Genre mode reused an old cursor/session'
  );
  await act(async () => {
    requests[0].resolve({ items: [{ track_id: 'old' }], nextCursor: null });
  });
  assert(actions.length === 0, 'Old search mode response replaced genre results');
  await act(async () => {
    requests[1].resolve({ items: [{ track_id: 'genre' }], nextCursor: null });
  });
  assert(actions.length === 1 && actions[0].tracks[0].track_id === 'genre', 'Genre result missing');
  results.push('PASS genre mode rejects obsolete responses and resets cursor');
  await act(async () => {
    root.render(null);
  });
  const coverRequests = [];
  window.ipcApi = {
    on: () => () => {},
    getCovers: async (...args) => {
      coverRequests.push(args);
      return { items: [], nextCursor: null };
    }
  };
  await act(async () => {
    root.render(<CoversFixture />);
  });
  const coverSelect = document.querySelector('select[aria-label="Search covers by"]');
  assert(coverSelect.value === 'metadata', 'Covers did not default to folder search');
  await act(async () => {
    coverSelect.value = 'genre';
    coverSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => {
    document.querySelector('input[type="search"]').value = 'rock prog';
    document.querySelector('button[type="submit"]').click();
  });
  assert(
    coverRequests.at(-1)[1] === 'rock prog' && coverRequests.at(-1)[4] === 'genre',
    'Covers genre selector did not reach the query'
  );
  await act(async () => {
    document.getElementById('missing-covers').click();
  });
  assert(
    coverRequests.at(-1)[3] === 'missing-covers' && coverRequests.at(-1)[4] === 'genre',
    'Missing covers lost genre mode'
  );
  await act(async () => {
    document.getElementById('refresh-covers').click();
  });
  assert(
    coverSelect.value === 'metadata' &&
      coverRequests.at(-1)[4] === 'metadata' &&
      coverRequests.at(-1)[1] === '',
    'Refresh did not reset folder mode'
  );
  results.push('PASS Covers Folder/Genre submission, missing filter and refresh reset');
  await act(async () => {
    root.render(<Menu />);
  });
  const preview = document.querySelector('select');
  await act(async () => {
    preview.value = 'genre';
    preview.dispatchEvent(new Event('change', { bubbles: true }));
  });
  window.showGenreTheme = async (theme) => {
    document.documentElement.className = theme;
    await act(async () => {
      root.render(
        <>
          <Menu theme={theme} />
          <CoversFixture />
        </>
      );
    });
  };
  return results;
})();
