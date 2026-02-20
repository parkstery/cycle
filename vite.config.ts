
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Dev: /api/osrm-route 요청을 api/osrm-route.js 핸들러로 처리 (모드별 OSM DE 서버 사용) */
let osrmHandlerPromise = null;
function getOsrmHandler() {
  if (!osrmHandlerPromise) {
    osrmHandlerPromise = import(pathToFileURL(path.join(__dirname, 'api', 'osrm-route.js')).href).then((m) => m.default);
  }
  return osrmHandlerPromise;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  // Load explicit keys for better security separation
  const GOOGLE_MAPS_API_KEY = env.GOOGLE_MAPS_API_KEY;

  return {
    plugins: [
      react(),
      {
        name: 'osrm-route-handler',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api/osrm-route')) return next();
            try {
              const url = new URL(req.url, 'http://localhost');
              const query = Object.fromEntries(url.searchParams);
              const fakeReq = { method: 'GET', query };
              const fakeRes = {
                _status: 200,
                _headers: {} as Record<string, string>,
                status(code: number) { this._status = code; return this; },
                setHeader(k: string, v: string) { this._headers[k] = v; return this; },
                end(body: string) {
                  res.writeHead(this._status, this._headers);
                  res.end(body);
                },
                json(obj: unknown) {
                  this.setHeader('Content-Type', 'application/json');
                  this.end(JSON.stringify(obj));
                },
              };
              const handler = await getOsrmHandler();
              await handler(fakeReq, fakeRes);
            } catch (e) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String((e as Error)?.message ?? e) }));
            }
          });
        },
      },
    ],
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
        '/api/elevation': {
          target: 'https://api.open-elevation.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/elevation/, '/api/v1/lookup'),
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
