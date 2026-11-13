import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['cloud-tests/**/*.test.ts'],
    exclude: ['cloud-tests/miaoda-client-http.test.ts', 'cloud-tests/miaoda-local-runtime.test.ts', 'cloud-tests/miaoda-weread-native.test.ts'],
  },
});
