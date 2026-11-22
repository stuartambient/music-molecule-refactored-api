/* global process, __dirname, Buffer, fetch, console */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const manifest = require('./mpv-runtime.json');

(async () => {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error(
      'This experiment bundles Windows x64 mpv. Set MPV_EXECUTABLE for another compatible build.'
    );
  const root = path.resolve(__dirname, '..');
  const destination = path.join(root, 'vendor/mpv/windows-x64');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'music-mpv-setup-'));
  const archive = path.join(temp, 'runtime.zip');
  const flag = process.argv.indexOf('--archive');
  const bytes =
    flag >= 0
      ? await fs.readFile(process.argv[flag + 1])
      : Buffer.from(await (await fetch(manifest.url)).arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256)
    throw new Error('mpv runtime checksum mismatch.');
  await fs.writeFile(archive, bytes);
  await fs.mkdir(destination, { recursive: true });
  const script = path.join(temp, 'expand.ps1');
  await fs.writeFile(
    script,
    'param($ArchivePath,$DestinationPath)\nExpand-Archive -LiteralPath $ArchivePath -DestinationPath $DestinationPath -Force\n'
  );
  const extracted = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-File',
      script,
      archive,
      destination
    ],
    { encoding: 'utf8', windowsHide: true }
  );
  if (extracted.error || extracted.status !== 0)
    throw new Error(extracted.error?.message || extracted.stderr);
  await fs.writeFile(
    path.join(destination, 'NOTICE.md'),
    `mpv ${manifest.version}\n\nOfficial CI archive: ${manifest.url}\nSHA256: ${manifest.sha256}\nSource: ${manifest.source}\nLicenses and build dependencies: https://github.com/mpv-player/mpv/blob/master/Copyright\n`
  );
  for (const license of ['LICENSE.GPL', 'LICENSE.LGPL']) {
    const response = await fetch(
      'https://raw.githubusercontent.com/mpv-player/mpv/d11ffba25/' + license
    );
    if (!response.ok) throw new Error('Could not download mpv license: ' + license);
    await fs.writeFile(path.join(destination, license), await response.text());
  }
  await fs.writeFile(path.join(destination, 'runtime.json'), JSON.stringify(manifest, null, 2));
  console.log('Verified mpv installed in ' + destination);
  // Remove only files created in the unique setup directory.
  await fs.unlink(archive);
  await fs.unlink(script);
  await fs.rmdir(temp);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
