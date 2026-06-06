import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Deliberately minimal: this lints the one bug class that used to ship
// silently — rules-of-hooks violations — plus exhaustive-deps as a warning.
// Keep it focused; broad style rules add noise without catching real bugs.
export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '**/*.test.ts', '**/*.test.tsx'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
