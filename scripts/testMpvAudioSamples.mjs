/* global process, Buffer, setTimeout, console */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { MpvClient } from '../src/main/mpvClient.js';
const root = mkdtempSync(path.join(tmpdir(), 'molecule-mpv-samples-'));
const run = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', ...args], {
    windowsHide: true,
    maxBuffer: 5 * 1024 * 1024
  });
  if (r.error || r.status !== 0) throw Error(r.error?.message || r.stderr.toString());
  return r.stdout;
};
try {
  for (const format of ['flac', 'mp3']) {
    const files = [];
    for (let segment = 0; segment < 2; segment++) {
      const frames = 24000,
        b = Buffer.alloc(44 + frames * 2);
      b.write('RIFF');
      b.writeUInt32LE(b.length - 8, 4);
      b.write('WAVEfmt ', 8);
      b.writeUInt32LE(16, 16);
      b.writeUInt16LE(1, 20);
      b.writeUInt16LE(1, 22);
      b.writeUInt32LE(48000, 24);
      b.writeUInt32LE(96000, 28);
      b.writeUInt16LE(2, 32);
      b.writeUInt16LE(16, 34);
      b.write('data', 36);
      b.writeUInt32LE(frames * 2, 40);
      for (let i = 0; i < frames; i++)
        b.writeInt16LE(
          Math.round(10000 * Math.sin(((i + segment * frames) * 2 * Math.PI * 443) / 48000)),
          44 + i * 2
        );
      const wav = path.join(root, `${segment}.wav`),
        encoded = path.join(root, `${segment}.${format}`);
      writeFileSync(wav, b);
      run([
        '-y',
        '-i',
        wav,
        ...(format === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '2'] : ['-c:a', 'flac']),
        encoded
      ]);
      files.push(encoded);
    }
    const expected = Buffer.concat(
      files.map((file) => run(['-i', file, '-f', 's16le', '-acodec', 'pcm_s16le', '-']))
    );
    const output = path.join(root, `${format}-output.wav`);
    const client = new MpvClient({
      executable: process.env.MPV_EXECUTABLE || path.resolve('vendor/mpv/windows-x64/mpv.exe'),
      extraArgs: [
        '--ao=pcm',
        `--ao-pcm-file=${output}`,
        '--audio-format=s16',
        '--audio-channels=mono',
        '--audio-samplerate=48000'
      ]
    });
    let ended = 0;
    client.on('event', (e) => {
      if (e.event === 'end-file' && e.reason === 'eof') ended++;
    });
    try {
      await client.command(['set_property', 'pause', true]);
      await client.command(['loadfile', files[0], 'replace']);
      await client.command(['loadfile', files[1], 'append']);
      await client.command(['set_property', 'pause', false]);
      const deadline = Date.now() + 10000;
      while (ended < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
      assert.equal(ended, 2, 'both tracks must finish');
    } finally {
      await client.close();
    }
    const actual = run(['-i', output, '-f', 's16le', '-acodec', 'pcm_s16le', '-']);
    assert.equal(actual.length, expected.length, `${format}: inserted or missing frames`);
    let largest = 0;
    for (let i = 0; i < actual.length; i += 2)
      largest = Math.max(largest, Math.abs(actual.readInt16LE(i) - expected.readInt16LE(i)));
    assert.ok(largest <= 1, `${format}: samples differ (${largest})`);
    console.log(
      `PASS ${format.toUpperCase()} native mpv output: ${actual.length / 2} consecutive samples, no inserted/missing frames, max sample difference ${largest}`
    );
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
