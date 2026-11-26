# Verified tag saves and recovery

Tag saves now track each file independently. The audio-file write and catalog update remain separate operations.

Before writing a file, the worker commits its requested values to the active catalog's `tag_save_jobs` table. Artwork expectations store content hashes rather than image bytes or a dependency on the temporary image path. If the journal cannot be written, the audio file is not changed.

The worker writes tags, closes the file, then reopens it to verify the requested values. Field errors are collected rather than only logged. It still attempts to refresh the catalog from the actual file contents after a partial write. File size and modification time are checked around verification and parsing; a changing file is left unfinished instead of being reported as confirmed.

Each file's catalog update commits independently. Likes remain user-owned and are preserved by metadata updates. A fully confirmed save clears that file's recovery record. Other results retain it.

The tag editor shows the file-write, verification, and catalog outcomes in View. It also discovers unfinished saves when reopened. Recovery reminders stay inside the tag editor. A Needs attention count expands or collapses the unfinished-save controls; it starts collapsed. The main window does not show a startup notification.

Recheck & refresh catalog reopens pending files, verifies the original requested values, and tries to update the catalog. It never repeats the tag write. If requested values are missing, the user must edit and save them explicitly. A missing file or a catalog identity/path mismatch remains unresolved; recovery never redirects a write to a different file.

Save and recheck workers are serialized through worker exit. Confirmed saves clear only submitted undo entries, preserving newer edits and unrelated edits during recovery.

Validation uses temporary MP3/FLAC fixtures and catalogs: successful saves and deletions, artwork addition/removal, partial field failures, catalog rollback and retry, a terminated worker after the file write, journal failure before a write, file changes during verification, IPC boundaries, and editor recovery controls.

Run native fixtures with Electron in Node mode (`ELECTRON_RUN_AS_NODE=1`), and run the UI fixtures with `node scripts/testTagSaveReport.cjs`.

In Review files, Forget unfinished save shows a brief confirmation. Forget record removes only that pending recovery record, including after a deliberate file/catalog deletion. A revision check rejects stale confirmations if a newer save replaced the record. Forget operations use the same serialized worker queue as saves and rechecks. They do not edit audio, update catalog entries, or turn failed saves into confirmed saves.
