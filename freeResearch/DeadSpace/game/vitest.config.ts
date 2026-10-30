import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
  define: { __DEV__: 'true', __TEST_HOOKS__: 'true' },
})
