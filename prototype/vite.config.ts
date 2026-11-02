import { defineConfig } from 'vite';

// Vendor code is split into long-cached chunks. Heavy tools (Mermaid and its layout engines,
// PDF reading/writing, the full icon set, backup bundles) are dynamically imported and only
// load when first used, so their size does not affect start-up.
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'vendor-react';
          if (/[\/](prismjs|react-simple-code-editor)[\/]/.test(id)) return 'vendor-code';
          if (/[\/]marked[\/]/.test(id)) return 'vendor-markdown';
          return undefined;
        },
      },
    },
  },
});
