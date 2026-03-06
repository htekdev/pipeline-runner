import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI binary
  {
    entry: { index: 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    dts: false,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  // Library entry (for programmatic use)
  {
    entry: { lib: 'src/lib.ts' },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: false,
    sourcemap: true,
    dts: true,
  },
]);
