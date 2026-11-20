import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// React Refresh injects an inline preamble and opens a websocket only in development.
const developmentCsp = {
  name: 'development-csp',
  apply: 'serve',
  transformIndexHtml: {
    order: 'pre',
    handler(html, context) {
      const updated = html
        .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
        .replace("connect-src 'self';", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*;");
      if (!context.filename.endsWith('index.html')) return updated;
      return {
        html: updated.replace(
          "script-src 'self' 'unsafe-inline';",
          "script-src 'self' 'unsafe-inline' http://localhost:8097;"
        ),
        tags: [{ tag: 'script', attrs: { src: 'http://localhost:8097' }, injectTo: 'body' }]
      };
    }
  }
};

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
    plugins: [react(), developmentCsp]
  }
});
