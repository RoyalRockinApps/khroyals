const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  { ignores: ['**/build/**', '**/.gradle/**', 'src/api/database.types.ts', 'schools/*/handbook.ts'] },
  { files: ['schools/index.js'], languageOptions: { globals: { __dirname: 'readonly' } } },
  { files: ['src/api/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  { rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'error' } },
]);
