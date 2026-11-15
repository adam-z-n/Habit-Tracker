import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Relative base so the build works at any path (GitHub Pages serves it under /Habit-Tracker/).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
});
