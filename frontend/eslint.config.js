import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

const NO_FETCH = 'Utiliser src/lib/xhr.js (XMLHttpRequest) : fetch et axios ne fournissent pas la progression d\'upload';

export default [
  { ignores: ['dist'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Les composants ne sont référencés qu'en JSX, que no-unused-vars ne voit pas
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: NO_FETCH }],
      'no-restricted-syntax': ['error', { selector: "MemberExpression[property.name='fetch']", message: NO_FETCH }],
      'no-restricted-imports': ['error', { paths: [{ name: 'axios', message: NO_FETCH }] }],
    },
  },
  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
