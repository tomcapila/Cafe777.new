import { defineConfig } from 'vitest/config';

// Scoped to the unit-testable pure modules under src/. Deliberately excludes the
// ad-hoc test_*.js / test-*.cjs probe scripts at the repo root (those are
// curl-style manual scripts, not unit tests).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
