import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(env.GOOGLE_MAPS_PLATFORM_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
              return 'react-vendor';
            }
            if (/node_modules\/(leaflet|react-leaflet|@react-leaflet|@vis\.gl)\//.test(id)) {
              return 'maps-vendor';
            }
            if (/node_modules\/(recharts|d3|d3-.*|victory-vendor|internmap)\//.test(id)) {
              return 'charts-vendor';
            }
            if (/node_modules\/(framer-motion|motion)\//.test(id)) {
              return 'motion-vendor';
            }
            if (/node_modules\/(jspdf|jspdf-autotable|html2canvas|dompurify)\//.test(id)) {
              return 'pdf-vendor';
            }
            if (/node_modules\/html5-qrcode\//.test(id)) {
              return 'qr-vendor';
            }
            if (/node_modules\/firebase\//.test(id) || /node_modules\/@firebase\//.test(id)) {
              return 'firebase-vendor';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
