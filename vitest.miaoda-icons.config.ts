import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/miaoda-icons.raster.test.ts'],
    testTimeout: 30000,
  },
});
