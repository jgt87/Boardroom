import { defineConfig, loadEnv, type Plugin } from 'vite';
import { drawioEndpoint } from './src/drawio-endpoint';

// Content Security Policy. Embeds may only frame the allow-listed providers (see specs-media.ts);
// media, images and the PDF worker use data:/blob: URLs; React style attributes need inline styles.
// The development server additionally needs a websocket for hot reload.
const embedOrigins = [
  'https://www.youtube-nocookie.com',
  'https://player.vimeo.com',
  'https://www.google.com',
  'https://www.figma.com',
  'https://codepen.io',
  'https://docs.google.com',
  'https://www.loom.com',
  // Office Online documents and Power BI reports (track J).
  'https://onedrive.live.com',
  'https://*.sharepoint.com',
  'https://app.powerbi.com',
];
function contentSecurityPolicy(dev: boolean, editorOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    // https: lets a picture dragged from another site be downloaded into the board (decision R2-Q1, 2026-11-08).
    // The fetch sends no cookies or referrer; sites that refuse cross-origin reads still give a bookmark.
    `connect-src 'self' data: blob: https:${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    `frame-src ${[editorOrigin, ...embedOrigins].join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}
const cspPlugin = (editorOrigin: string): Plugin => {
  let dev = false;
  return {
    name: 'boardroom-csp',
    configResolved(config) {
      dev = config.command === 'serve';
    },
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head><meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(dev, editorOrigin)}"/>`,
      );
    },
  };
};

// Vendor code is split into long-cached chunks. Heavy tools (Mermaid and its layout engines,
// PDF reading/writing, the full icon set, backup bundles) are dynamically imported and only
// load when first used, so their size does not affect start-up.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const editor = drawioEndpoint(env.VITE_DRAWIO_EDITOR_URL);
  return {
    define: { __DRAWIO_EDITOR_URL__: JSON.stringify(editor.url) },
    plugins: [cspPlugin(editor.origin)],
    server: {
      // Test reports and captures are not part of the app: watching them reloaded every open tab
      // (including other devices) whenever the browser tests ran.
      watch: {
        ignored: ['**/e2e/.tmp/**', '**/playwright-report/**', '**/test-results/**', '**/dist/**', '**/qa/**'],
      },
      // Transform every app module when the server starts, so a first visit (including lazily loaded
      // tools) never waits for on-demand compilation.
      warmup: { clientFiles: ['./src/main.tsx', './src/**/*.{ts,tsx}'] },
    },
    // Pre-bundle lazily imported packages at start-up so the dev server never re-optimises and
    // reloads the page the first time a tool (PDF, emoji, backups, Mermaid…) is used.
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        'mermaid',
        'pdfjs-dist',
        'jspdf',
        'fflate',
        'marked',
        'prismjs',
        'react-simple-code-editor',
        'qrcode-generator',
      ],
    },
    build: {
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
            if (/[\\/](prismjs|react-simple-code-editor)[\\/]/.test(id)) return 'vendor-code';
            if (/[\\/]marked[\\/]/.test(id)) return 'vendor-markdown';
            return undefined;
          },
        },
      },
    },
  };
});
