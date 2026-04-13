import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    solidPlugin(),
    visualizer({ open: false, gzipSize: true, brotliSize: true, filename: 'dist/stats.html' }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8000', ws: true },
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'd3-core': ['d3'],
          'leaflet': ['leaflet'],
          'vendor': ['solid-js', '@solidjs/router', 'axios', 'date-fns'],
        },
      },
    },
  },
});
