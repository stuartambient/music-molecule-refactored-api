import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

export function createCoverDownloads({ dialog, downloadFile, getEditor, temporaryDirectory }) {
  const notify = (sender, result) => {
    if (!sender.isDestroyed())
      sender.send(
        result.status === 'error' ? 'download-failed' : 'download-completed',
        result.status === 'success'
          ? 'download successful'
          : result.status === 'cancelled'
            ? 'download cancelled'
            : result.message
      );
    return result;
  };
  const failed = (sender, error) =>
    notify(sender, {
      status: 'error',
      message: `The cover could not be saved. ${error?.message || String(error)}`
    });
  return {
    async save(sender, fileUrl, folder) {
      try {
        const filename = `cover${path.extname(new URL(fileUrl).pathname)}`;
        const selection = await dialog.showSaveDialog({
          title: 'save image',
          defaultPath: folder ? path.join(folder, filename) : filename,
          filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
          properties: ['showOverwriteConfirmation']
        });
        if (selection.canceled || sender.isDestroyed())
          return notify(sender, { status: 'cancelled' });
        if (!selection.filePath) throw new Error('No save location was selected.');
        if (!(await downloadFile(fileUrl, selection.filePath)))
          throw new Error('The download did not complete.');
        return notify(sender, { status: 'success' });
      } catch (error) {
        return failed(sender, error);
      }
    },
    async stage(sender, fileUrl, filePath, delayDownload = true) {
      let saved;
      let delivered = false;
      try {
        const editor = getEditor();
        if (!editor || editor.isDestroyed())
          throw new Error('The tag editor is closed. Open it and try again.');
        if (!delayDownload)
          throw new Error(
            'Immediate embedding is unavailable. Select artwork through the tag edit form.'
          );
        saved = path.join(
          temporaryDirectory(),
          `cover-${crypto.randomBytes(16).toString('hex')}${path.extname(new URL(fileUrl).pathname)}`
        );
        if (!(await downloadFile(fileUrl, saved)))
          throw new Error('The download did not complete.');
        if (editor.isDestroyed())
          throw new Error('The tag editor closed before the download finished.');
        editor.webContents.send('for-submit-form', {
          tempFile: saved.replaceAll('\\', '/'),
          filePath
        });
        delivered = true;
        return notify(sender, { status: 'success' });
      } catch (error) {
        return failed(sender, error);
      } finally {
        if (saved && !delivered) await fs.rm(saved, { force: true }).catch(() => {});
      }
    }
  };
}
