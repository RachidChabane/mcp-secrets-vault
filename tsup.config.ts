import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  target: 'node20',
  outDir: 'dist',
  shims: false,
  esbuildOptions(options) {
    options.platform = 'node';
  }
});