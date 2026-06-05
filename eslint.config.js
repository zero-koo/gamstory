import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import i18next from 'eslint-plugin-i18next';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      '.output',
      '.vinxi',
      '.tanstack',
      'src/routeTree.gen.ts',
      'storybook-static',
      'coverage',
      'playwright-report',
      'node_modules',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: true,
        document: true,
        navigator: true,
        console: true,
        setTimeout: true,
        clearTimeout: true,
        setInterval: true,
        clearInterval: true,
        fetch: true,
        Response: true,
        Request: true,
        Headers: true,
        URL: true,
        URLSearchParams: true,
      },
    },
    plugins: { react, 'react-hooks': reactHooks, i18next },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'i18next/no-literal-string': [
        'warn',
        {
          mode: 'jsx-text-only',
          'jsx-attributes': {
            include: ['title', 'alt', 'placeholder', 'aria-label'],
          },
        },
      ],
    },
  },
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: { 'i18next/no-literal-string': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}', 'tests/**/*'],
    rules: { 'i18next/no-literal-string': 'off' },
  },
  prettier,
);
