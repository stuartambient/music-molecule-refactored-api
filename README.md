# Music Molecule

An Electron/React music catalog, tag editor, and player with built-in and mpv playback.

## Start a development checkout

Run commands from the **project directory containing `package.json`**. If a worktree
contains a nested `music-molecule-ffmpeg-test` folder, enter that folder first.
The worktree or branch name does not select the database; the launch mode and
configuration do.

Use Node.js **22.18 or newer** and npm. Install dependencies on the operating system
where the app will run; do not copy `node_modules` between Windows and Linux.
The lockfile records the dependency versions, including Electron.

```sh
npm ci
npm run dev
```

`npm ci` installs the locked dependencies. Its postinstall step runs
`electron-builder install-app-deps`, which prepares native dependencies such as
`better-sqlite3` for Electron. It needs access to the dependency/download services.
If a matching prebuilt native module is unavailable, platform build tools are
needed; see [Electron's native-module guide](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules).

An `.env` file is **optional**. With no override, dev creates its catalog at
`src/db/music.db` and backups under `src/db/backups`. No database download, SQL
import, production catalog copy, or manual table creation is required.

On startup, the app creates the catalog directory/file if needed, checks integrity,
and initializes the required schema and indexes. A fresh catalog is empty. Select
your music folders in Settings and use the library scan controls to populate it.
If initialization fails, the recovery window offers repair/restore options rather
than starting normal catalog operations.

## Database and environment configuration

[.env.example](.env.example) contains the supported dev database settings. Copy it
to `.env` **only if you do not already have one**, and change the values if you want
a different dev catalog. Keep an existing `.env` when updating this checkout.

| Variable                  | Default           | Meaning                                    |
| ------------------------- | ----------------- | ------------------------------------------ |
| `MAIN_VITE_DB_PATH_DEV`   | `src/db/music.db` | Dev SQLite catalog file.                   |
| `MAIN_VITE_DB_BACKUP_DEV` | `src/db`          | Base directory; the app appends `backups`. |

Relative paths are resolved from the project directory. Absolute paths are also
accepted. Use forward slashes in `.env` values on Windows, and quote paths that
contain spaces. For example, `MAIN_VITE_DB_PATH_DEV="D:/Music Molecule Dev/music.db"`.
The selected directories must be writable. Point these values at **dev-only**
locations if overriding the defaults.

These variables are read through electron-vite's `import.meta.env`; restart the
dev process after changing them. The app does not use `MAIN_VITE_DB_PATH_PROD` to
choose its packaged database: packaged data paths come from
[src/main/appPaths.js](src/main/appPaths.js).

`.env`, local overrides, SQLite files/sidecars, backups, installed dependencies,
downloaded mpv binaries, and generated build output are ignored by Git. The
example configuration and required renderer source assets are tracked.

## Where the app stores data

| Item                             | `npm run dev`                                                 | Built/packaged runtime                 |
| -------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| Catalog                          | `src/db/music.db`, or the dev override above                  | Platform data location below           |
| Catalog backups                  | `<MAIN_VITE_DB_BACKUP_DEV>/backups`, default `src/db/backups` | `backups` beside the platform catalog  |
| Preferences                      | `src/main/preferences.json`                                   | `<Electron userData>/preferences.json` |
| Playlist dialog's default folder | `<Electron userData>/playlists`                               | `<Electron userData>/playlists`        |

Dev settings changes modify the tracked `src/main/preferences.json` file; preserve
your local choices when merging rather than resetting that file casually.

The platform catalog locations are:

- **Windows:** `%LOCALAPPDATA%/Music Molecule Data/music.db` for the usual Windows
  profile layout. The implementation preserves the existing location by resolving
  `Local` beside Electron's roaming app-data directory.
- **Linux preparation:** `$XDG_DATA_HOME/music-molecule/music.db`, falling back to
  `~/.local/share/music-molecule/music.db` when the override is absent or invalid.
  Native Linux release testing is still pending; see [Linux readiness](docs/linux-readiness.txt).
- **macOS preparation:** `Music Molecule Data/music.db` under Electron's app-data
  directory. A macOS release is not validated by the current work.

Electron's `userData` directory is platform/application specific; on a typical
Windows installation it is `%APPDATA%/music-molecule`. Preferences and the default
playlist folder are not the same location as the large catalog/backups directory.
The playlist save dialog can choose another location. Some dev and packaged paths,
including the default playlist folder, can therefore be shared.

Normal startup creates a timestamped catalog backup and retains the three newest
backups in that catalog's configured backup directory. SQLite may also create
`music.db-wal` and `music.db-shm` sidecars while the catalog is open. Close the app
before making a manual catalog copy; do not delete live sidecars to force a reset.
Catalog backups contain database state, **not copies of your audio files**.

## Keep development separate from production

Use `npm run dev` for normal source development. Leave the installed production app,
its catalog and backups, and its executables in place. Do not point the dev database
or backup override at the production data directory.

A separate catalog does **not** isolate the music itself: both apps can reference
the same audio files, and tag edits write to those selected files. Use disposable
music copies for experiments that should not affect your library.

`npm start` is **not** the dev command. It runs a legacy asset-copy step and previews
previously built output. That output uses production-mode data locations and may
open the same catalog as the installed app. It is not an isolated setup check.

The `build`, `build:win`, `build:unpack`, `build:linux`, and `build:mac` scripts generate
or replace output under `out`/`dist`. Packaging is a separate action from development;
do not run these just to verify setup or while preserving existing build artifacts.

## Playback and mpv setup

The built-in player uses Electron/Chromium and needs no separate mpv download.
The tag editor's audio preview also uses built-in playback.

For **Windows x64 mpv playback**, install the pinned runtime in this checkout:

```sh
npm run mpv:setup
```

The script downloads the archive described in `scripts/mpv-runtime.json`, verifies
its SHA-256, and installs it in ignored `vendor/mpv/windows-x64`. It also fetches
license notices. An already downloaded archive can be supplied with
`npm run mpv:setup -- --archive "C:/Downloads/mpv-runtime.zip"`.

Then open **Settings → Playback** and select **mpv (experimental)**. The setup
script is optional when using only the built-in engine. A Windows package using
mpv needs its runtime prepared before packaging.

`MPV_EXECUTABLE` is an optional **operating-system process environment** override.
Do not assume that putting this unprefixed variable in `.env` configures the app.
For example, in PowerShell:

```powershell
$env:MPV_EXECUTABLE = 'D:\Tools\mpv\mpv.exe'
npm run dev
```

On Linux, the app can find a system `mpv` on `PATH`, or use an absolute override:

```sh
MPV_EXECUTABLE=/absolute/path/to/mpv npm run dev
```

The present loading command requires a compatible modern mpv (0.38 or newer).
Linux native build/playback validation and distribution remain deferred. Windows
uses the bundled executable unless explicitly overridden.

See [mpv playback notes](docs/mpv-playback-experiment.md) for behavior and runtime
details. The filename is historical; that branch was merged into development.

## Troubleshooting a new checkout

- **ENOENT for `package.json`:** enter the nested project directory, not just the
  worktree parent, and run the command again.
- **SQLite ABI / `NODE_MODULE_VERSION` error:** install dependencies for this OS
  and Electron version. The setup postinstall step rebuilds app dependencies;
  `npx electron-builder install-app-deps` can rerun it. Avoid running native SQLite
  tests under a different Node ABI; follow each script's Electron instructions.
- **Empty library:** verify the dev catalog path and scan the intended music roots.
  An empty catalog in a new checkout is expected; it is not the production catalog.
- **Catalog cannot be opened:** check the configured parent directory and write
  permissions. Read the terminal/recovery window error before trying repair or restore.
- **mpv unavailable:** run the Windows setup step, check the override, or select
  built-in playback. On Linux, check the installed mpv version and executable permission.
- **Electron starts as Node instead of opening a window:** clear
  `ELECTRON_RUN_AS_NODE` in the launching terminal; it is for specific test scripts.

The source stylesheet, placeholder cover and loader required by renderer imports
are included in Git. Import capitalization must match actual directory names on
case-sensitive systems.

For development tools, VS Code with ESLint and Prettier is useful. Run `npm test`
for routine regression checks. See the [testing guide](docs/testing.md) for test
groups, prerequisites, failure reports, and optional UI/audio checks.

## Further notes

- [Tag-save recovery](docs/tag-save-recovery.md)
- [Streaming and audio preview checks](docs/streaming-protocol-review.txt)
- [Path compatibility and deferred Linux trial](docs/linux-readiness.txt)
- [Synthetic library scale measurements](docs/benchmarks/library-scale-2026-11-23.txt)
- [Metadata search measurements](docs/benchmarks/metadata-search-2026-11-27.txt)
- [Genre search behavior and measurements](docs/benchmarks/genre-search-2026-11-27.txt)
