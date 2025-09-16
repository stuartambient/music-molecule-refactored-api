import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin()
      /*   visualizer({
        filename: 'C:/users/sambi/desktop/visualizer.html', // Path for the output file
        open: false, // Automatically open the file after build
        gzipSize: true, // Show gzipped sizes
        brotliSize: true // Show Brotli-compressed sizes
      }) */
    ],
    build: {
      sourcemap: false,
      publicDir: 'assets',
      rollupOptions: {
        external: [
          'src/db/music.db'
          /*      'src/main/updateFilesWorker.js',
          'src/main/connection.js',
          'src/main/sql.js' */
        ] // Exclude the database file
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js'),
          metadataEditing: resolve(__dirname, 'src/preload/metadataEditing.js'),
          coverSearchAlt: resolve(__dirname, 'src/preload/coverSearchAlt.js')
        },
        external: ['src/db/music.db'] // Exclude the database file
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@': resolve(__dirname, 'src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/index.html'),
          metadataEditing: resolve(__dirname, 'src/renderer/metadataEditing.html'),
          splash: resolve(__dirname, 'src/renderer/splash.html'),
          coverSearchAlt: resolve(__dirname, 'src/renderer/coverSearchAlt.html')
        },
        external: ['src/db/music.db'] // Exclude the database file
      }
    },
    plugins: [react()]
  }
});
