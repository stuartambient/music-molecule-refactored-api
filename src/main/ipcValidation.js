import path from 'node:path';
import { childDefinitions } from './childWindowDefinitions.js';

const text = (value, max = 8192) =>
  typeof value === 'string' && value.length <= max && !value.includes('\0');
const id = (value) => text(value, 256) && value.length > 0;
const object = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const bool = (value) => typeof value === 'boolean';
const list = (value, check, max = 1000000) =>
  Array.isArray(value) && value.length <= max && value.every(check);
const oneOf =
  (...values) =>
  (value) =>
    values.includes(value);
const scalar = (value) =>
  value === null ||
  bool(value) ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  text(value, 1048576);
const location = (value) => text(value) && value.length > 0 && path.isAbsolute(value);
const locations = (value) => location(value) || list(value, location);
const strings = (value) => text(value) || list(value, (entry) => text(entry));
const page = (value) => Number.isSafeInteger(value) && value >= 0;
const track = (value) => object(value) && id(value.track_id) && location(value.audiotrack);
const keys = (value, allowed) =>
  object(value) && Object.keys(value).every((key) => allowed.includes(key));
const category = oneOf('artist-tracks', 'genre-tracks', 'album-tracks', 'root-tracks');
const noArgs = (args) => args.length === 0;
const argsOf =
  (...checks) =>
  (args) =>
    args.length === checks.length && checks.every((check, index) => check(args[index]));
const optional = (check) => (value) => value === undefined || check(value);

// Reject prototype keys and unusually deep/large payloads before they reach merging or worker code.
function safeData(value, depth = 0, budget = { remaining: 5000000 }) {
  if (--budget.remaining < 0 || depth > 24) return false;
  if (value === undefined || scalar(value)) return true;
  if (Array.isArray(value))
    return value.length <= 1000000 && value.every((item) => safeData(item, depth + 1, budget));
  return (
    object(value) &&
    Object.entries(value).every(
      ([key, item]) =>
        !['__proto__', 'prototype', 'constructor'].includes(key) &&
        safeData(item, depth + 1, budget)
    )
  );
}

const tagFields = [
  'albumArtists',
  'album',
  'beatsPerMinute',
  'composers',
  'conductor',
  'comment',
  'copyright',
  'disc',
  'discCount',
  'description',
  'encoder',
  'encodedBy',
  'encoderSettings',
  'genres',
  'isCompilation',
  'isrc',
  'lyrics',
  'performers',
  'performersRole',
  'pictures',
  'publisher',
  'remixedBy',
  'replayGainAlbumGain',
  'replayGainAlbumPeak',
  'replayGainTrackGain',
  'replayGainTrackPeak',
  'title',
  'track',
  'trackCount',
  'year',
  'like',
  'picture-location'
];
function tagEdits(value) {
  return list(
    value,
    (edit) =>
      keys(edit, ['id', 'track_id', 'updates']) &&
      location(edit.id) &&
      id(edit.track_id) &&
      keys(edit.updates, tagFields) &&
      Object.values(edit.updates).every(optional(scalar))
  );
}
function preferences(value, role) {
  if (
    !keys(value, role === 'editor' ? ['theme', 'editorTheme', 'grids'] : ['mainTheme', 'schedule'])
  )
    return false;
  if ('theme' in value && !oneOf('light', 'dark')(value.theme)) return false;
  if ('editorTheme' in value && !oneOf('follow', 'light', 'dark')(value.editorTheme)) return false;
  if (
    'mainTheme' in value &&
    !oneOf(
      'basic',
      'theme-1',
      'theme-2',
      'theme-3',
      'theme-4',
      'theme-5',
      'theme-6'
    )(value.mainTheme)
  )
    return false;
  if ('schedule' in value) {
    const time = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (typeof value.schedule === 'string') {
      if (!value.schedule.startsWith('everyday@') || !time(value.schedule.slice(9))) return false;
    } else if (
      !keys(value.schedule, [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday'
      ]) ||
      !Object.values(value.schedule).every((value) => value === '' || time(value))
    )
      return false;
  }
  if ('grids' in value) {
    if (!keys(value.grids, ['tagEdit']) || !keys(value.grids.tagEdit, ['columns'])) return false;
    if (
      !list(
        value.grids.tagEdit.columns,
        (column) =>
          keys(column, [
            'colId',
            'width',
            'hide',
            'pinned',
            'sort',
            'sortIndex',
            'aggFunc',
            'rowGroup',
            'rowGroupIndex',
            'pivot',
            'pivotIndex',
            'flex'
          ]) &&
          id(column.colId) &&
          Object.values(column).every(optional(scalar)),
        500
      )
    )
      return false;
  }
  return true;
}
function childRequest(value, role) {
  if (!keys(value, ['name', 'data']) || !childDefinitions[value.name]) return false;
  if (
    role === 'main'
      ? !['table-data', 'cover-search-alt'].includes(value.name)
      : role !== 'editor' || value.name !== 'cover-search-alt-tags'
  )
    return false;
  if (!keys(value.data, ['listType', 'results'])) return false;
  if (value.name === 'table-data')
    return (
      category(value.data.listType) &&
      (value.data.results === null || list(value.data.results, track))
    );
  return (
    value.data.listType === value.name &&
    keys(value.data.results, ['artist', 'title', 'path', 'type']) &&
    optional((v) => text(v, 4096))(value.data.results.artist) &&
    optional((v) => text(v, 4096))(value.data.results.title) &&
    optional(locations)(value.data.results.path) &&
    optional((v) => text(v, 128))(value.data.results.type)
  );
}
const emptyChannels = [
  'db-check',
  'db-repair',
  'db-restore',
  'recovery-complete',
  'app-restart',
  'get-roots',
  'pick-folder',
  'update-folders',
  'update-files',
  'update-meta',
  'update-covers',
  'total-tracks-stat',
  'artists-by-num-tracks',
  'distinct-directories',
  'clear-table',
  'genres-stat',
  'open-playlist',
  'set-shuffled-tracks-array',
  'show-text-input-menu',
  'get-preferences',
  'get-preferences-sync',
  'child-ready'
];
const validators = Object.fromEntries(emptyChannels.map((channel) => [channel, noArgs]));
Object.assign(validators, {
  'window-action': argsOf(oneOf('close', 'minimize', 'maximize')),
  'screen-mode': argsOf(oneOf('default', 'player', 'player-library', 'mini', 'mini-expanded')),
  'artwork-view': argsOf(bool),
  'update-roots': argsOf((value) => list(value, location)),
  'get-folder-path': argsOf((value) => text(value)),
  'get-tracks': argsOf(page, (value) => text(value, 4096), oneOf('ASC', 'DESC')),
  'get-albums': argsOf(page, (value) => text(value, 4096), oneOf('ASC', 'DESC')),
  'get-album-tracks': argsOf(locations),
  'check-track-availability': argsOf(location),
  'get-cover': argsOf(location),
  'prepare-music-tracks': argsOf(
    (value) =>
      keys(value, ['album', 'tracks', 'inspect']) &&
      'album' in value !== 'tracks' in value &&
      ('album' in value ? locations(value.album) : list(value.tracks, track)) &&
      optional(bool)(value.inspect)
  ),
  'update-like': argsOf(id),
  'is-liked': argsOf(id),
  'get-tracks-by-category': argsOf(
    (value) =>
      keys(value, ['listType', 'value']) && category(value.listType) && strings(value.value)
  ),
  'check-for-open-table': argsOf(oneOf('table-data')),
  'get-albums-by-root': argsOf(strings),
  'save-playlist': argsOf((value) => list(value, track)),
  'get-covers': argsOf(
    page,
    (value) => text(value, 4096),
    oneOf('ASC', 'DESC'),
    oneOf('not-requested', 'missing-covers')
  ),
  'get-shuffled-tracks': argsOf(page),
  'update-tags': argsOf(tagEdits),
  'rescan-track-error': argsOf(location, id),
  'show-album-cover-menu': argsOf(location, (value) => text(value)),
  'show-child': (args, role) => args.length === 1 && childRequest(args[0], role),
  'download-file': argsOf((value) => text(value), optional(location)),
  'download-tag-image': (args) =>
    args.length >= 2 &&
    args.length <= 3 &&
    text(args[0]) &&
    locations(args[1]) &&
    optional(bool)(args[2]),
  'select-image-from-folder': (args) =>
    args.length >= 1 && args.length <= 2 && locations(args[0]) && optional(bool)(args[1]),
  'open-album-folder': argsOf(location),
  'save-preferences': (args, role) => args.length === 1 && preferences(args[0], role),
  'show-context-menu': (args, role) => {
    if (args.length < 2 || args.length > 3) return false;
    const [value, type, folder] = args;
    if (role === 'main')
      return (
        ['files', 'folder', 'playlist', 'menu'].includes(type) &&
        (id(value) || value === 1) &&
        optional(location)(folder)
      );
    if (role === 'editor')
      return (
        ['tag-context-menu', 'picture', 'form-picture'].includes(type) &&
        object(value) &&
        optional(location)(folder)
      );
    return (
      type === 'cover' &&
      value === (role === 'cover' ? 'cover-search-alt' : 'cover-search-alt-tags') &&
      folder === undefined
    );
  }
});

export function validateIpcArguments(channel, args, role) {
  if (!safeData(args) || !validators[channel]?.(args, role))
    throw new Error(`Invalid arguments for ${channel}.`);
}

export function hasIpcValidator(channel) {
  return Object.hasOwn(validators, channel);
}

export function validateCatalogAccess(channel, args, role, { getCatalog, artworkAllowed }) {
  const checks = [];
  if (channel === 'update-tags')
    for (const edit of args[0]) {
      checks.push([edit.track_id, edit.id]);
      const image = edit.updates['picture-location'];
      if (image && image !== '-' && !artworkAllowed(image))
        throw new Error('Select artwork through the image picker or cover search first.');
    }
  if (channel === 'rescan-track-error') checks.push([args[1], args[0]]);
  if (checks.length) {
    const statement = getCatalog().prepare(
      'SELECT audiotrack FROM "audio-tracks" WHERE track_id = ?'
    );
    for (const [id, file] of checks)
      if (statement.get(id)?.audiotrack !== file)
        throw new Error('The track ID and file must match the catalog.');
  }
  if (['select-image-from-folder', 'download-tag-image'].includes(channel)) {
    const files = channel === 'download-tag-image' ? args[1] : args[0];
    const statement = getCatalog().prepare(
      'SELECT track_id FROM "audio-tracks" WHERE audiotrack = ?'
    );
    for (const file of Array.isArray(files) ? files : [files])
      if (!statement.get(file)) throw new Error('The selected track must belong to the catalog.');
  }
}
