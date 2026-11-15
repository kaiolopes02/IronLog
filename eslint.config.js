import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // android/ holds the generated project plus a copy of dist (minified bundles).
  { ignores: ['dist', 'dev-dist', 'node_modules', 'coverage', '.vite', 'android'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js', 'postcss.config.cjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        module: 'readonly',
      },
    },
  },
);
