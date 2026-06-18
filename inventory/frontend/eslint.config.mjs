import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      globals: globals.browser,
    },
  },
  {
    files: [
      'src/modules/retail/**/*.{ts,tsx}',
      'src/modules/restaurant/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app/api/client', '**/lib/domainQueries'],
              message: 'Views must import through their module facade.',
            },
          ],
          paths: [
            {
              name: '@tanstack/react-query',
              importNames: ['useQueryClient'],
              message: 'Cache access belongs in the module query facade.',
            },
          ],
        },
      ],
    },
  },
);
