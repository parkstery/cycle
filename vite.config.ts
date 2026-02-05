
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  // Load explicit keys for better security separation
  const GOOGLE_MAPS_API_KEY = env.GOOGLE_MAPS_API_KEY;

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/nominatim-search': {
          target: 'https://nominatim.openstreetmap.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/nominatim-search/, '/search'),
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => {
              req.setHeader('User-Agent', 'FitnessProCycleSimulator/1.0 (https://github.com/your-org/cycle)');
            });
          },
        },
        '/api/nominatim-reverse': {
          target: 'https://nominatim.openstreetmap.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/nominatim-reverse/, '/reverse'),
          configure: (proxy) => {
            proxy.on('proxyReq', (req) => {
              req.setHeader('User-Agent', 'FitnessProCycleSimulator/1.0 (https://github.com/your-org/cycle)');
            });
          },
        },
        '/api/osrm-route': {
          target: 'https://router.project-osrm.org',
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              const url = req.url || '';
              const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
              const params = new URLSearchParams(q);
              const profile = params.get('profile') || 'driving';
              const coords = params.get('coords') || '';
              const n = coords.split(';').filter(Boolean).length;
              const radiuses = n > 0 ? Array(n).fill(20).join(';') : '';
              const query = new URLSearchParams({
                overview: 'full',
                geometries: 'polyline',
                alternatives: 'false',
                steps: 'false',
                ...(radiuses && { radiuses }),
              });
              proxyReq.path = `/route/v1/${profile}/${coords}?${query.toString()}`;
            });
          },
        },
      },
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          // Add hash to filenames to force cache busting
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    },
    define: {
      // Expose keys securely to the client-side code
      'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(GOOGLE_MAPS_API_KEY),
      'process.env': {}
    }
  };
});
