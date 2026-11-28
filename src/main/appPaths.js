import path from 'node:path';

export function appPaths({ platform, env, home, appData, userData, logs, resources }) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const data =
    platform === 'win32'
      ? paths.join(appData, '..', 'Local', 'Music Molecule Data')
      : platform === 'linux'
        ? paths.join(
            env.XDG_DATA_HOME && paths.isAbsolute(env.XDG_DATA_HOME)
              ? env.XDG_DATA_HOME
              : paths.join(home, '.local', 'share'),
            'music-molecule'
          )
        : paths.join(appData, 'Music Molecule Data');
  return {
    userData,
    preferences: paths.join(userData, 'preferences.json'),
    playlists: paths.join(userData, 'playlists'),
    local: data,
    db: paths.join(data, 'music.db'),
    backups: paths.join(data, 'backups'),
    logs,
    resources
  };
}
