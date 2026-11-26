# TagLib resource ownership review

The current app uses `File.createFromPath` in these paths:

| Path                                  | Owner and cleanup                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `utility/utils.js: parseMeta`         | Each parsed file is disposed in `finally`, including failures from the secondary metadata reader.                                                                                    |
| `updateTags.js: updateTags`           | The writer disposes its file in `finally`. The performer-role reopen path clears the closed reference before opening the replacement, preventing a second disposal if opening fails. |
| `tagVerification.js: verifyTagValues` | The reopened verification file is disposed in `finally`.                                                                                                                             |
| `rescanTrackErrorWorker.js`           | Its directly opened file is disposed in `finally`; parsed metadata has separate ownership.                                                                                           |
| `trackCover.js: getTrackCover`        | Artwork bytes are copied before disposal. Folder lookup happens after the file closes.                                                                                               |
| `tag-inspector.js: inspectTags`       | Path inputs are owned and disposed here; already-open file inputs are borrowed and remain the caller's responsibility.                                                               |

The current tag writer calls `inspectTags` with its own open file. No other application call was found. The path-input form is nevertheless guarded so that future callers cannot leak its file.

Dormant and legacy code identified during the review:

- `updateTagImageWorker.js`: no import or launcher was found in the current application. It is not the current single/multiple-track artwork save path. Its unguarded file opens are not being exercised by normal tag saves; do not revive it without a separate review.
- `updateTagFramesWorker.js`: referenced by the `changeSemicolonDelimeter` maintenance helper in main. The helper's only call is commented out. It is not a normal scan or save operation.
- `backfillWorker.old`: an old source artifact with no active launcher. The commented `backfillTags` example in main is not executed.
- The commented encoder-writing examples in `tags/utils.js` were not exported or called. They and their unused TagLib imports were removed; active normalization and encoder-reading functions are unchanged.

No library-wide tag writes or maintenance workers were run during this review. Production build outputs were not changed. Long-run memory/handle measurements are a separate next audit item; this review establishes ownership and error-path cleanup rather than claiming those measurements have passed.
