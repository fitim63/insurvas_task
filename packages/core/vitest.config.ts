import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: process.env.SUPABASE_URL ? [] : ['test/integration/**'],
    testTimeout: 30_000,
  },
});
