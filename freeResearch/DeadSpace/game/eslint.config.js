import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['node_modules', '.tsbuild', '.e2e-dist', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, __DEV__: 'readonly', __TEST_HOOKS__: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-constant-condition': 'off',
      'prefer-const': 'warn',
    },
  },
  {
    // 權威模擬與共用程式碼不得碰 DOM、three.js、UI
    files: ['src/sim/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: { globals: { ...globals.worker } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*', 'postprocessing', 'n8ao'], message: 'sim/shared 不得 import three.js' },
            { group: ['preact', 'preact/*', '@preact/*'], message: 'sim/shared 不得 import UI' },
            { group: ['**/render/**', '**/ui/**', '**/client/**', '**/audio/**', '**/net/**'], message: 'sim/shared 不得依賴 client 端模組' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'sessionStorage'],
    },
  },
)
