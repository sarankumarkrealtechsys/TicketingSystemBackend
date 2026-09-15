import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: 'next', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['node_modules/**', 'uploads/**', 'prisma/**'],
  },
];
