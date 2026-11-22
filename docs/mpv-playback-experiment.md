# mpv playback experiment

Branch: `codex/mpv-playback-experiment`. This is an optional background mpv
process controlled by JSON IPC. It is not a libmpv native addon.

## Try it

From this checkout, run `npm run mpv:setup` once if the runtime is absent, then
start the app normally. In **Settings → Playback**, select **mpv (experimental)**.
The selection is saved. Enable **Gapless** in Covers or Playlist for continuous
transitions; it remains enabled until switched off. Switching engines retains
the selected track, paused state, volume, and position.

Tracks and Playlist advance through the native mpv queue. Selecting an individual
track in an expanded Album still stops when that track ends. Browsing another
list leaves playback alone; selecting a different source restores that source's
remembered position. The tag editor's audition player remains separate.

Test The Juniper Tree tracks 1 → 2 → 3, DSOM's Money → Us and Them, long tracks,
seeking near boundaries, pause/resume, Next/Previous, switching sources, changing
Playlist contents, an unavailable drive, and both normal and mini mode controls.
Confirm transitions by listening when tracks end naturally. A delayed drive or
silence encoded into a recording can still produce a gap.

## Runtime and packaging

The setup script downloads the pinned official Windows x64 CI archive recorded
in `scripts/mpv-runtime.json`, verifies its SHA-256, and extracts it into ignored
`vendor/mpv/windows-x64`. `npm run mpv:setup -- --archive C:/path/to/runtime.zip`
uses an already downloaded archive. The executable is not committed to Git.

Electron Builder copies this runtime and its notices to `resources/mpv`.
Run setup before building a Windows package. `MPV_EXECUTABLE` can override the
executable path for local experiments; this does not alter packaged resources.
Other platforms are not packaged by this experiment.

mpv reads local catalog files directly, using its native decoder, buffering,
and audio output. The main window supplies track IDs, not arbitrary paths or
native commands. Commands and events carry a playback session ID. Obsolete
responses and stop commands are ignored. A renderer reload stops playback;
exiting the app shuts down the child process. User scripts, user mpv configuration,
video output, and yt-dlp integration are disabled.

This backend has no application-imposed 512 MiB whole-track decoding cap.
It uses bounded demuxer read-ahead instead of decoding entire tracks into
renderer memory. mpv can still use memory for decoding and audio output.
Gapless does not remove recorded silence or guarantee uninterrupted playback
from slow or disconnected storage. Device formats and sample rates follow mpv's
output negotiation; this experiment does not promise exclusive or bit-perfect
output. Runtime availability currently checks the executable's presence; startup
or decoder failures are reported by the player and can be retried.

## Verification

With the runtime installed:

```powershell
node scripts/testMpvPlayback.mjs
node scripts/testMpvAudioSamples.mjs
node scripts/testMpvRenderer.cjs
npm run build
```

Native tests use silent output or a temporary PCM file. Renderer tests use the
actual provider, reducer, scrubber, preferences component, preload bridge, and
background mpv in an isolated hidden Electron window. Fixtures are generated;
tests do not modify the music catalog or recordings.

Before distributing an mpv package, retain the runtime's license notices and
review the pinned build's redistribution/source requirements and dependencies.
The bundled CI build is experimental; it should be deliberately updated and
retested before a release.

A bundled read-only Lua load hook recognizes a leading ID3v2 tag before a RIFF/WAVE
header and skips that prefix for the affected file only. This accommodates WAV-wrapped
MP3 recordings mislabeled as `.mp3`, without rewriting audio or scanning the queue.
The hook is written to a private temporary directory when mpv starts and removed
when it closes. Ordinary MP3, FLAC, and WAV files retain the normal demuxer settings.

Known playback failures remain marked in Playlist, Tracks, and expanded Albums for the current session. Decoder markers apply to the engine that failed; unavailable-file markers apply across engines. Hover over the badge for the error, and select the track to retry. A successful load clears the marker for that engine. Album file checks confirm filesystem availability, not full-file decodability; no full-album decode scan is added.
