import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules', '**/dist', '**/out'] },

  js.configs.recommended,

  ...(reactPlugin.configs.flat
    ? [reactPlugin.configs.flat.recommended, reactPlugin.configs.flat['jsx-runtime']]
    : [reactPlugin.configs.recommended]),

  {
    settings: {
      react: { version: 'detect' }
    }
  },

  // Renderer code → browser globals + your preload bridge
  {
    files: ['src/renderer/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        api: 'readonly'
      }
    }
  },

  // Main + preload code → node globals
  {
    files: ['src/main/**/*.{js,ts}', 'src/preload/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },

  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
      'unused-imports': unusedImportsPlugin
    },
    rules: {
      ...(reactHooksPlugin.configs.recommended?.rules ?? {}),
      ...(reactRefreshPlugin.configs.vite?.rules ?? {}),
      'react/prop-types': 'off',

      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_'
        }
      ],

      ...(prettierConfig.rules ?? {})
    }
  }
];
