import fs from 'node:fs';
import process from 'node:process';
import { setTimeout, clearTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { syncBuiltinESMExports } from 'node:module';
import { setImmediate as settle } from 'node:timers/promises';

export function trackFileResources(File) {
  const openFiles = new Map(),
    instances = new Map();
  let opens = 0,
    closes = 0,
    peak = 0,
    nextInstance = 0,
    filesCreated = 0,
    filesDisposed = 0;
  const original = {
    openSync: fs.openSync,
    closeSync: fs.closeSync,
    open: fs.open,
    close: fs.close,
    promiseOpen: fs.promises.open,
    create: File.createFromPath
  };
  const opened = (fd, name) => {
    openFiles.set(fd, String(name));
    opens++;
    peak = Math.max(peak, openFiles.size);
  };
  const closed = (fd) => {
    if (openFiles.delete(fd)) closes++;
  };
  fs.openSync = (...args) => {
    const fd = original.openSync(...args);
    opened(fd, args[0]);
    return fd;
  };
  fs.closeSync = (fd) => {
    const result = original.closeSync(fd);
    closed(fd);
    return result;
  };
  fs.open = (...args) => {
    const callback = args.pop();
    return original.open(...args, (error, fd) => {
      if (!error) opened(fd, args[0]);
      callback(error, fd);
    });
  };
  fs.close = (fd, callback) =>
    original.close(fd, (error) => {
      if (!error) closed(fd);
      callback(error);
    });
  fs.promises.open = async (...args) => {
    const handle = await original.promiseOpen(...args),
      fd = handle.fd;
    opened(fd, args[0]);
    const close = handle.close.bind(handle);
    handle.close = async () => {
      const result = await close();
      closed(fd);
      return result;
    };
    return handle;
  };
  File.createFromPath = (...args) => {
    const file = original.create(...args),
      key = ++nextInstance;
    filesCreated++;
    instances.set(key, String(args[0]));
    const dispose = file.dispose.bind(file);
    file.dispose = () => {
      const result = dispose();
      if (instances.delete(key)) filesDisposed++;
      return result;
    };
    return file;
  };
  syncBuiltinESMExports();
  return {
    snapshot: () => ({
      openFileCount: openFiles.size,
      openFileExamples: [...openFiles.values()].slice(0, 8),
      opens,
      closes,
      peakOpenFiles: peak,
      taglibOutstanding: instances.size,
      taglibExamples: [...instances.values()].slice(0, 8),
      filesCreated,
      filesDisposed
    }),
    restore() {
      fs.openSync = original.openSync;
      fs.closeSync = original.closeSync;
      fs.open = original.open;
      fs.close = original.close;
      fs.promises.open = original.promiseOpen;
      File.createFromPath = original.create;
      syncBuiltinESMExports();
    }
  };
}

export function windowsProcessSampler() {
  if (process.platform !== 'win32') return { sample: async () => null, close: async () => {} };
  const command = `$line = [Console]::ReadLine(); while ($null -ne $line) { $observedProcess = $null; try { $observedProcess = [System.Diagnostics.Process]::GetProcessById([int]$line); $observedProcess.Refresh(); @{ handleCount = $observedProcess.HandleCount; workingSetBytes = $observedProcess.WorkingSet64; privateBytes = $observedProcess.PrivateMemorySize64 } | ConvertTo-Json -Compress } catch { @{ error = $_.Exception.Message } | ConvertTo-Json -Compress } finally { if ($null -ne $observedProcess) { $observedProcess.Dispose() } }; $line = [Console]::ReadLine() }`;
  const child = spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const lines = createInterface({ input: child.stdout });
  let pending,
    failure,
    stderr = '';
  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });
  child.on('error', (error) => {
    failure = error;
    if (pending) {
      pending.reject(error);
      pending = null;
    }
  });
  child.on('exit', (code) => {
    if (pending) {
      pending.reject(new Error(`Handle sampler exited ${code}: ${stderr}`));
      pending = null;
    }
  });
  lines.on('line', (line) => {
    if (pending) {
      const request = pending;
      pending = null;
      try {
        const value = JSON.parse(line);
        if (value.error) throw new Error(value.error);
        request.resolve(value);
      } catch (error) {
        request.reject(error);
      }
    }
  });
  return {
    sample: () =>
      new Promise((resolve, reject) => {
        if (failure) return reject(failure);
        const timer = setTimeout(() => {
          pending = null;
          reject(new Error('Windows handle sampler timed out'));
        }, 10000);
        pending = {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          }
        };
        child.stdin.write(`${process.pid}\n`);
      }),
    close: async () => {
      child.stdin.end();
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        const timer = setTimeout(() => {
          child.kill();
          resolve();
        }, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      lines.close();
    }
  };
}

export async function resourceSample(tracker, monitor) {
  const beforeGc = process.memoryUsage();
  await settle();
  globalThis.gc();
  await settle();
  globalThis.gc();
  await settle();
  const afterGc = process.memoryUsage();
  const windows = await monitor.sample();
  return {
    beforeGc,
    afterGc,
    windows,
    files: tracker.snapshot(),
    resources: process.getActiveResourcesInfo()
  };
}
