const operations = (channels) =>
  Object.fromEntries(
    channels.map((channel) => [
      channel.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()),
      channel
    ])
  );
const contract = (invoke, send, events) => ({
  invoke: operations(invoke),
  send: operations(send),
  events
});

export const ipcContracts = {
  main: contract(
    [
      'db-check',
      'artwork-view',
      'get-roots',
      'update-roots',
      'pick-folder',
      'get-folder-path',
      'update-folders',
      'update-files',
      'update-meta',
      'update-covers',
      'get-tracks',
      'get-albums',
      'get-album-tracks',
      'check-track-availability',
      'prepare-music-tracks',
      'get-cover',
      'update-like',
      'is-liked',
      'total-tracks-stat',
      'artists-by-num-tracks',
      'get-tracks-by-category',
      'distinct-directories',
      'check-for-open-table',
      'get-albums-by-root',
      'genres-stat',
      'open-playlist',
      'save-playlist',
      'get-covers',
      'set-shuffled-tracks-array',
      'get-shuffled-tracks',
      'show-album-cover-menu',
      'show-text-input-menu',
      'show-child',
      'get-preferences',
      'save-preferences'
    ],
    ['window-action', 'screen-mode', 'clear-table', 'show-context-menu', 'open-album-folder'],
    [
      'album-menu',
      'context-menu-command',
      'hamburger-menu-command',
      'main-theme-updated',
      'track-like-removed',
      'track-liked',
      'tracks-loaded',
      'update-complete',
      'update-error',
      'updated-tags',
      'window-closed'
    ]
  ),
  recovery: contract(
    ['db-check', 'db-repair', 'db-restore'],
    ['recovery-complete', 'app-restart'],
    ['recovery-error']
  ),
  editor: contract(
    [
      'get-preferences-sync',
      'get-preferences',
      'save-preferences',
      'show-child',
      'update-tags',
      'rescan-track-error',
      'select-image-from-folder'
    ],
    ['child-ready', 'show-context-menu'],
    [
      'context-menu-command',
      'for-submit-form',
      'theme-preferences-updated',
      'form-menu-command',
      'rescanned-track',
      'reset-table',
      'save-image-folder',
      'send-to-child',
      'updated-tags'
    ]
  ),
  cover: contract(
    ['download-file'],
    ['child-ready', 'show-context-menu'],
    ['context-menu-command', 'send-to-child', 'download-completed', 'download-failed']
  ),
  'tag-cover': contract(
    ['download-tag-image'],
    ['child-ready', 'show-context-menu'],
    ['context-menu-command', 'send-to-child', 'download-completed', 'download-failed']
  )
};

export function canRequest(role, direction, channel) {
  return Object.values(ipcContracts[role]?.[direction] || {}).includes(channel);
}
