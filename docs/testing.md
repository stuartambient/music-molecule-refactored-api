# Development tests

Run commands from the project directory containing `package.json`, after `npm ci`.
Use Node 22.18 or newer and the installed Electron dependencies described in the
[setup guide](../README.md). These commands are for developers; installed app users
do not need Node or these tests.

## Commands

| Command                | Coverage                                                                                                                                      | Requirements                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm test`             | Routine checks: unit and catalog groups                                                                                                       | Node and installed Electron/native dependencies                |
| `npm run test:unit`    | Playback state, lists, IPC validation, scheduling, streaming, tag/artwork cleanup, paths and in-memory renderer compilation                   | Node and installed dependencies                                |
| `npm run test:catalog` | SQL/search, scan writes/concurrency, metadata refresh, likes, verified tag saves/recovery, startup recovery and cover selection               | Electron's Node runtime and its matching SQLite binary         |
| `npm run test:ui`      | Isolated Chromium tests for album controls, cover chooser, genre search, reports, preview controls, settings, themes, lifecycle and streaming | Working desktop/display session and Electron                   |
| `npm run test:all`     | Routine checks plus UI checks                                                                                                                 | All requirements above; excludes optional audio and mpv groups |
| `npm run test:audio`   | Built-in gapless renderer playback using generated FLAC/MP3 fixtures                                                                          | Electron desktop session and `ffmpeg` on PATH                  |
| `npm run test:mpv`     | Native mpv playback, decoded sample continuity and mpv renderer integration                                                                   | Electron desktop session, mpv and `ffmpeg` on PATH             |
| `npm run test:list`    | Lists every discovered test file and its group without running tests                                                                          | Node only                                                      |

The mpv renderer fixture currently uses `vendor/mpv/windows-x64/mpv.exe` directly.
On Windows, prepare it with `npm run mpv:setup`. The other native mpv fixtures accept
`MPV_EXECUTABLE` in the launching environment, falling back to that same bundled
Windows path. Native Linux playback validation remains deferred; these test commands
do not certify a Linux release. See [mpv notes](mpv-playback-experiment.md) and
[Linux readiness](linux-readiness.txt).

The runner sets `ELECTRON_RUN_AS_NODE=1` only for catalog child processes and removes
it for other child processes. It does not change your terminal environment. Catalog
tests must use Electron's SQLite ABI; do not rebuild SQLite for ordinary Node just
to run this suite. If native loading fails, rerun `npx electron-builder install-app-deps`.

## Results and scope

Tests run sequentially in separate processes to isolate module hooks, simulated
IPC and native handles. Their output appears in the terminal, followed by a count
of passed/failed **test files**, with failed filenames and exit codes. Individual
scripts may also report assertion counts. The runner continues after failures and
returns a nonzero exit code if any file failed. An invalid group returns exit code 2.
Missing prerequisites cause failures rather than silently skipping a requested group;
some individual assertions intentionally skip cases that do not apply to the host OS.

To investigate one failure, use the filename in the summary. Ordinary Node and UI
scripts can be run with `node scripts/<filename>`. For a catalog fixture, PowerShell:

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
try {
  & ./node_modules/electron/dist/electron.exe scripts/testMetadataSearch.mjs
} finally {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}
```

The grouped commands use synthetic/in-memory or temporary catalogs, generated audio
and mocked IPC. They do not launch the normal app, read your configured music roots,
or invoke production builds. Tag-write fixtures write their own temporary audio files.
No `out` or `dist` build is required. Tests can create disposable Electron profiles;
some older fixtures can leave temporary directories after a run or interruption.
Screenshot helpers write into those test profiles, away from `out` and `dist`. Benchmark/soak
scripts and optional real-library playback arguments are not included in these groups.

Automated tests do not replace listening checks, trying the actual UI, checking a
packaged release, or testing against representative library sizes. They verify the
specific regression scenarios encoded in the scripts, not every possible failure.
Failure-injection fixtures intentionally log simulated errors even on passing runs;
use the assertion results and final failure summary to judge the outcome.

## Adding tests and automation

The runner discovers `scripts/test*.mjs` and `scripts/test*.cjs`. New `.mjs` files
join the unit group by default; add SQLite/native catalog tests to the explicit
`catalog` set in [runTests.mjs](../scripts/runTests.mjs). New `.cjs` files join the UI
group by default. Keep tests requiring mpv/ffmpeg in their explicit optional groups.
Use temporary fixtures and close native resources; never use personal music files
or the production catalog as test fixtures.

There is currently no hosted CI workflow. The local commands provide a repeatable
entry point for a future CI job. `npm test` is the baseline; `npm run test:all`
requires a desktop-capable runner (a configured virtual display on Linux).
Dependencies and Electron must be installed for the runner's OS and architecture.
Formatting/linting and release packaging remain separate checks; these commands
neither build nor publish an installer/archive.
