/* global process, Buffer, setTimeout, console */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MpvService } from '../src/main/mpvService.js';

const root = mkdtempSync(path.join(tmpdir(), 'molecule-mpv-'));
const executable = process.env.MPV_EXECUTABLE || path.resolve('vendor/mpv/windows-x64/mpv.exe');
function wav(seconds) {
  const frames = Math.round(seconds * 48000),
    data = Buffer.alloc(44 + frames * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(48000, 24);
  data.writeUInt32LE(96000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    data.writeInt16LE(Math.round(10000 * Math.sin((i * 2 * Math.PI * 440) / 48000)), 44 + i * 2);
  return data;
}
const queue = [0, 1, 2].map((i) => {
  const audiotrack = path.join(root, `${i}.wav`);
  writeFileSync(audiotrack, wav(0.7));
  return { track_id: `track-${i}`, audiotrack };
});
const wait = async (predicate, message) => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(message);
};
const service = new MpvService({ executable, extraArgs: ['--ao=null'] });
const states = [];
service.on('state', (s) => states.push(s));
const load = async (
  sessionId,
  index = 0,
  source = 'playlistActive',
  tracks = queue,
  startTime = 0
) => {
  assert.equal(
    (
      await service.load(
        { sessionId, index, source, gapless: true, startTime, volume: 0.25 },
        tracks
      )
    ).ok,
    true
  );
  await wait(() => service.state.ready, `metadata for ${sessionId}`);
};
try {
  assert.equal(service.client.child, undefined, 'mpv must start lazily');
  await load('first', 0, 'playlistActive', queue, 0.2);
  const pid = service.client.child.pid;
  assert.equal(service.state.paused, true);
  assert.equal(service.state.volume, 0.25);
  assert.ok(service.state.position >= 0.19);
  await service.control('first', 'volume', 0.123);
  await service.control('first', 'seek', 0.1);
  assert.equal(await service.get('volume'), 12.3);
  assert.ok(Math.abs((await service.get('time-pos')) - 0.1) < 0.02);
  await service.control('first', 'pause', false);
  await wait(
    () => states.some((s) => s.trackId === 'track-1' && s.ready),
    'natural first transition'
  );
  await wait(() => service.state.ended, 'final EOF');
  assert.equal(service.state.trackId, 'track-2');
  assert.equal(service.client.child.pid, pid);
  await service.control('first', 'pause', false);
  await wait(() => !service.state.ended && service.state.ready, 'replay after EOF');
  await service.control('first', 'pause', true);
  assert.equal(await service.get('pause'), true);
  console.log('PASS native queue, offset, volume, seeking, natural handoffs, final EOF and replay');

  await load('album', 0, 'albumTracksActive');
  assert.equal((await service.get('playlist')).length, 1);
  await service.control('album', 'pause', false);
  await wait(() => service.state.ended, 'album single-track EOF');
  assert.equal(service.state.trackId, 'track-0');
  assert.equal(
    (await service.stop('first')).cancelled,
    true,
    'old stop must not stop newer source'
  );
  console.log('PASS expanded album plays one track; obsolete stop ignored');

  await load('edit');
  assert.equal((await service.updateQueue('edit', [queue[0], queue[2]])).ok, true);
  await service.control('edit', 'pause', false);
  await wait(() => service.state.trackId === 'track-2' && service.state.ready, 'edited successor');
  assert.equal(service.state.index, 1);
  assert.equal((await service.get('playlist')).length, 2);
  console.log('PASS editing upcoming entries retains the playing process and replaces successor');

  const missing = { track_id: 'missing', audiotrack: path.join(root, 'missing.flac') };
  const missingResult = await service.load(
    {
      sessionId: 'missing-current',
      index: 0,
      source: 'playlistActive',
      gapless: true,
      startTime: 0,
      volume: 0.2
    },
    [missing]
  );
  assert.equal(missingResult.ok, false);
  await load('missing-next', 0, 'playlistActive', [queue[0], missing, queue[2]]);
  await service.control('missing-next', 'pause', false);
  await wait(() => service.halted, 'missing successor did not stop');
  assert.equal(service.state.trackId, 'missing');
  assert.ok(service.state.error);
  console.log('PASS unavailable current and upcoming files report errors and stop');

  const corrupt = { track_id: 'corrupt', audiotrack: path.join(root, 'corrupt.flac') };
  writeFileSync(corrupt.audiotrack, 'not an audio stream');
  const badLoad = await service.load(
    {
      sessionId: 'corrupt',
      index: 0,
      source: 'playlistActive',
      gapless: true,
      startTime: 0,
      volume: 0.2
    },
    [corrupt]
  );
  if (badLoad.ok) await wait(() => service.halted, 'immediate decoder rejection was lost');
  assert.ok(service.state.error);
  await load('recovery');
  assert.ok(!service.state.error);
  const crashed = service.client.child;
  crashed.kill();
  await wait(() => service.halted, 'child exit did not reach player');
  await load('after-crash');
  assert.notEqual(service.client.child.pid, crashed.pid);
  console.log('PASS immediate decoder failures, process-exit reporting and fresh-process recovery');

  await load('duplicates', 0, 'playlistActive', [queue[0], queue[0], queue[1]]);
  await service.control('duplicates', 'pause', false);
  await wait(
    () => service.state.index === 1 && service.state.ready,
    'duplicate occurrence was not distinguished'
  );
  await service.control('duplicates', 'pause', true);
  await load('remove-before', 1);
  await service.updateQueue('remove-before', [queue[1], queue[2]]);
  assert.equal(service.state.trackId, queue[1].track_id);
  assert.equal(service.state.index, 0);
  await service.control('remove-before', 'pause', false);
  await wait(
    () => service.state.trackId === queue[2].track_id && service.state.ready,
    'removing a preceding entry lost successor'
  );
  console.log('PASS repeated tracks and removing a preceding playlist entry');

  const tagged = { track_id: 'tagged-wave', audiotrack: path.join(root, 'tagged-wave.mp3') };
  const tag = Buffer.alloc(26);
  tag.write('ID3');
  tag[3] = 3;
  tag[9] = 16;
  writeFileSync(tagged.audiotrack, Buffer.concat([tag, wav(0.7)]));
  await load('tagged-wave', 0, 'playlistActive', [tagged, queue[0]]);
  assert.ok(Math.abs(service.state.duration - 0.7) < 0.01);
  await service.control('tagged-wave', 'seek', 0.3);
  await service.control('tagged-wave', 'pause', false);
  await wait(
    () => service.state.trackId === queue[0].track_id && service.state.ready,
    'compatibility option leaked into the normal successor'
  );
  await wait(() => service.state.ended, 'successor did not finish');
  await load('tagged-upcoming', 0, 'playlistActive', [queue[0], tagged]);
  await service.control('tagged-upcoming', 'pause', false);
  await wait(
    () => service.state.trackId === tagged.track_id && service.state.ready,
    'tagged WAV successor could not load'
  );
  console.log(
    'PASS leading-ID3 WAV compatibility, seek, natural handoffs and per-file option isolation'
  );

  let finishOld;
  service.check = (file) =>
    file === 'slow'
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve({ available: true });
  const old = service.load(
    {
      sessionId: 'slow',
      index: 0,
      source: 'playlistActive',
      gapless: true,
      startTime: 0,
      volume: 0.2
    },
    [{ track_id: 'slow', audiotrack: 'slow' }]
  );
  await load('newest');
  finishOld({ available: true });
  assert.equal((await old).cancelled, true);
  assert.equal(service.session.sessionId, 'newest');
  console.log('PASS a sleeping-drive response cannot block or replace a newer selection');
} finally {
  const child = service.client.child;
  await service.close();
  assert.ok(!child || child.exitCode !== null || child.signalCode !== null, 'child must shut down');
  rmSync(root, { recursive: true, force: true });
}
