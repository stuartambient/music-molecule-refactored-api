import { buildSync } from 'esbuild';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import searchTrackCover from '../src/main/folderImageCheck.js';
import { appPaths } from '../src/main/appPaths.js';
import { mpvExecutable, mpvRuntimeStatus } from '../src/main/mpvRuntime.js';
import { parsePlaylist, serializePlaylist } from '../src/main/playlistCatalog.js';
import { sameCatalogPath, trackCoverParents } from '../src/main/catalogPaths.js';
import { localFilePath } from '../src/main/localFilePath.js';
import { albumCoverUrl } from '../src/shared/albumCoverUrl.js';
import { streamingUrl } from '../src/shared/streamingUrl.js';
import { ensureWritableWithStatus } from '../src/main/utility/ensureWritableWithStatus.js';
import { findPlayingAlbum } from '../src/renderer/src/utility/albumPlayback.js';
import { load } from 'js-yaml';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js');

const inputs = {
  platform: 'linux',
  env: {},
  home: '/home/listener',
  appData: '/home/listener/.config',
  userData: '/home/listener/.config/music-molecule',
  logs: '/home/listener/.config/music-molecule/logs',
  resources: '/opt/music-molecule/resources'
};

test('Linux data uses XDG_DATA_HOME or the standard user-data fallback', () => {
  assert.equal(appPaths(inputs).db, '/home/listener/.local/share/music-molecule/music.db');
  assert.equal(
    appPaths({ ...inputs, env: { XDG_DATA_HOME: '/data/é space' } }).backups,
    '/data/é space/music-molecule/backups'
  );
  for (const value of ['', 'relative/data'])
    assert.equal(appPaths({ ...inputs, env: { XDG_DATA_HOME: value } }).db, appPaths(inputs).db);
  assert.equal(
    appPaths(inputs).preferences,
    '/home/listener/.config/music-molecule/preferences.json'
  );
});

test('Windows data and preference locations remain compatible with the existing installation', () => {
  const paths = appPaths({
    ...inputs,
    platform: 'win32',
    appData: 'C:\\Users\\sambi\\AppData\\Roaming',
    userData: 'C:\\Users\\sambi\\AppData\\Roaming\\music-molecule'
  });
  assert.equal(paths.db, 'C:\\Users\\sambi\\AppData\\Local\\Music Molecule Data\\music.db');
  assert.equal(
    paths.preferences,
    'C:\\Users\\sambi\\AppData\\Roaming\\music-molecule\\preferences.json'
  );
});

test('mpv uses the Windows bundle and honors an explicit override', () => {
  const options = { platform: 'win32', root: 'C:/dev/app', resources: 'C:/app/resources', env: {} };
  assert.equal(
    mpvExecutable({ ...options, development: true }),
    'C:\\dev\\app\\vendor\\mpv\\windows-x64\\mpv.exe'
  );
  assert.equal(
    mpvExecutable({ ...options, development: false }),
    'C:\\app\\resources\\mpv\\mpv.exe'
  );
  assert.equal(
    mpvExecutable({ ...options, development: false, env: { MPV_EXECUTABLE: 'D:/custom/mpv.exe' } }),
    'D:\\custom\\mpv.exe'
  );
  assert.equal(mpvRuntimeStatus('does-not-exist-molecule-mpv').available, false);
});

test('Linux mpv prefers an executable bundle then a system PATH executable', () => {
  const options = {
    development: false,
    resources: '/opt/app/resources',
    root: '/home/listener/app',
    platform: 'linux',
    arch: 'x64',
    env: { PATH: '/usr/local/bin:/usr/bin' }
  };
  assert.equal(
    mpvExecutable({ ...options, canExecute: (file) => file === '/opt/app/resources/mpv/mpv' }),
    '/opt/app/resources/mpv/mpv'
  );
  assert.equal(
    mpvExecutable({ ...options, canExecute: (file) => file === '/usr/bin/mpv' }),
    '/usr/bin/mpv'
  );
  assert.equal(mpvExecutable({ ...options, canExecute: () => false }), 'mpv');
  assert.equal(
    mpvExecutable({
      ...options,
      env: { MPV_EXECUTABLE: '/custom/player/mpv' },
      canExecute: () => false
    }),
    '/custom/player/mpv'
  );
  assert.equal(
    mpvExecutable({
      ...options,
      env: { MPV_EXECUTABLE: 'custom-mpv', PATH: '/usr/bin' },
      canExecute: (file) => file === '/usr/bin/custom-mpv'
    }),
    '/usr/bin/custom-mpv'
  );
});

test('cover/audio URLs preserve Unix, Windows and UNC paths and decode only once', () => {
  const paths = [
    '/home/listener/Music/é # 50% literal%2F.flac',
    '/mnt/music/Album\\Name/front.png',
    'I:/Music/é # %/front.png',
    '\\\\server\\share\\front.jpg'
  ];
  for (const file of paths) {
    assert.equal(localFilePath(albumCoverUrl(file), 'cover'), file);
    assert.equal(localFilePath(streamingUrl(file, 'new request'), 'streaming'), file);
  }
  assert.equal(
    localFilePath('cover:///home/listener/front.png', 'cover'),
    '/home/listener/front.png'
  );
  assert.equal(localFilePath('cover://i/music/front.png', 'cover'), 'I:/music/front.png');
  for (const value of ['cover://local/relative.png', 'cover://local/%', 'cover://local/%00'])
    assert.throws(() => localFilePath(value, 'cover'));
});

test('Linux playlists preserve Unix paths, relative paths and literal backslashes', () => {
  const filename = '/home/listener/playlists/list.m3u';
  assert.deepEqual(
    parsePlaylist('#EXTM3U\n../Music/é #1.flac\n/mnt/Music/Album\\Name/01.flac', filename),
    ['/home/listener/Music/é #1.flac', '/mnt/Music/Album\\Name/01.flac']
  );
  const tracks = [{ audiotrack: '/mnt/Music/Album\\Name/01.flac' }];
  assert.equal(serializePlaylist(tracks, 'linux'), tracks[0].audiotrack);
  assert.deepEqual(parsePlaylist(serializePlaylist(tracks, 'linux'), filename), [
    tracks[0].audiotrack
  ]);
});

test('Windows playlists preserve existing slash normalization and UNC entries', () => {
  assert.deepEqual(
    parsePlaylist('..\\Music\\01.flac\n\\\\server\\share\\02.flac', 'C:/Playlists/list.m3u'),
    ['C:/Music/01.flac', '//server/share/02.flac']
  );
  assert.equal(
    serializePlaylist([{ audiotrack: 'I:/Music/01.flac' }], 'win32'),
    'I:\\Music\\01.flac'
  );
  assert.throws(() => serializePlaylist([{ audiotrack: '/music/a\nb.flac' }], 'linux'), /M3U/);
});

test('catalog identity is case-sensitive on Linux and case-insensitive on Windows', () => {
  assert.equal(sameCatalogPath('/music/Artist/01.flac', '/music/artist/01.flac', 'linux'), false);
  assert.equal(
    sameCatalogPath('/music/Album\\Name/01.flac', '/music/Album/Name/01.flac', 'linux'),
    false
  );
  assert.equal(
    sameCatalogPath('I:/Music/ARTIST/01.flac', 'i:\\music\\artist\\01.flac', 'win32'),
    true
  );
  assert.equal(sameCatalogPath(undefined, undefined, 'linux'), false);
  const albums = [{ fullpath: '/music/Album/Name' }, { fullpath: '/music/Album\\Name' }];
  assert.equal(findPlayingAlbum(albums, { audiotrack: '/music/Album\\Name/01.flac' }), albums[1]);
});

test('track artwork parent lookup stays within the closest root and builds real ancestors', () => {
  assert.deepEqual(trackCoverParents('/music/Album/Set/Disc', ['/music'], 'linux'), [
    '/music/Album',
    '/music/Album/Set'
  ]);
  assert.deepEqual(trackCoverParents('/music2/Album/Disc', ['/music'], 'linux'), []);
  assert.deepEqual(
    trackCoverParents('/music/Album/Disc/Part', ['/music', '/music/Album'], 'linux'),
    ['/music/Album/Disc']
  );
  assert.deepEqual(trackCoverParents('/Music/Album/Disc', ['/music'], 'linux'), []);
  assert.deepEqual(trackCoverParents('I:/Music/Album/Set/Disc', ['i:/music'], 'win32'), [
    'i:/music/Album',
    'i:/music/Album/Set'
  ]);
});

test('Unix denied writes do not chmod files or attempt a tag write', async () => {
  let chmod = 0,
    opens = 0;
  const result = await ensureWritableWithStatus('/music/readonly.flac', {
    platform: 'linux',
    fileSystem: {
      access: async () => {
        throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      },
      chmod: async () => {
        chmod++;
      },
      open: async () => {
        opens++;
      }
    }
  });
  assert.equal(result.status, 'unwritable');
  assert.equal(chmod, 0);
  assert.equal(opens, 0);
  const writable = await ensureWritableWithStatus('/music/writable.flac', {
    platform: 'linux',
    fileSystem: { access: async () => {}, open: async () => ({ close: async () => {} }) }
  });
  assert.equal(writable.status, 'writable');
});

test('builder configuration validates without building and keeps Windows binaries out of Linux resources', async () => {
  const config = load(fs.readFileSync('electron-builder.yml', 'utf8'));
  await validateConfiguration(config, { isEnabled: false });
  assert.ok(config.win.extraResources.some((entry) => entry.from.includes('windows-x64')));
  assert.ok(!config.extraResources.some((entry) => entry.from.includes('windows-x64')));
  assert.ok(config.linux.extraResources.some((entry) => entry.to === './icon.png'));
  assert.deepEqual(config.linux.target, ['AppImage', 'deb']);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.ok(pkg.scripts['build:linux'].includes('npmRebuild=true'));
});

test('track folder artwork searches the literal directory and preserves parent order', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'music-path-artwork-'));
  try {
    const album = path.join(root, 'Album [2026]');
    fs.mkdirSync(album);
    fs.writeFileSync(path.join(album, 'FRONT.PNG'), 'literal artwork bytes');
    const found = await searchTrackCover([path.join(root, 'missing'), album]);
    assert.equal(found.toString(), 'literal artwork bytes');
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('music-path-artwork-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('renderer entrypoints compile in memory without path-capitalization warnings', () => {
  const result = buildSync({
    entryPoints: [
      'src/renderer/src/main.jsx',
      'src/renderer/src/metadataEditing.jsx',
      'src/renderer/src/coverSearchAlt.jsx'
    ],
    outdir: 'unused-in-memory',
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty', '.jpg': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' }
  });
  assert.deepEqual(
    result.warnings.filter((warning) => warning.id === 'different-path-case'),
    []
  );
});
