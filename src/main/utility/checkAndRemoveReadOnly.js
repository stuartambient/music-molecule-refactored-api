import fs from 'node:fs';

const checkAndRemoveReadOnly = async (filePath) => {
  return new Promise((resolve, reject) => {
    fs.access(filePath, fs.constants.W_OK, (err) => {
      if (err) {
        if (err.code === 'EACCES' || err.code === 'EPERM') {
          console.log(`${filePath} is not writable. Removing the read-only attribute...`);
          fs.chmod(filePath, 0o666, (chmodErr) => {
            if (chmodErr) {
              console.error('Error changing file permissions:', chmodErr);
              return reject(new Error(`Failed to chmod ${filePath}: ${chmodErr.message}`));
            }
            console.log('Read-only attribute removed.');
            resolve(true);
          });
        } else {
          //console.error('Error accessing file:', err);
          return reject(new Error(`Cannot access file: ${filePath} (${err.code})`));
        }
      } else {
        resolve(true);
      }
    });
  });
};

export default checkAndRemoveReadOnly;
