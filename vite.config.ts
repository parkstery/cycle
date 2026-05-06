
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

/** Dev: /api/elevation 요청을 api/elevation.js 핸들러로 처리 (open-elevation -> opentopodata 폴백 포함) */
let elevationHandlerPromise: Promise<(req: any, res: any) => Promise<void>> | null = null;
function getElevationHandler() {
  if (!elevationHandlerPromise) {
    elevationHandlerPromise = import(pathToFileURL(path.join(__dirname, 'api', 'elevation.js')).href).then((m) => m.default);
  }
  return elevationHandlerPromise;
}

/** Dev: Valhalla(Stadia) 표고 프록시 — .env 의 STADIA_MAPS_API_KEY 사용 */
let valhallaElevationHandlerPromise: Promise<(req: any, res: any) => Promise<void>> | null = null;
function getValhallaElevationHandler() {
  if (!valhallaElevationHandlerPromise) {
    valhallaElevationHandlerPromise = import(pathToFileURL(path.join(__dirname, 'api', 'valhalla-elevation.js')).href).then(
      (m) => m.default
    );
  }
  return valhallaElevationHandlerPromise;
}

async function readRequestBodyJson(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  if (env.STADIA_MAPS_API_KEY && !process.env.STADIA_MAPS_API_KEY) {
    process.env.STADIA_MAPS_API_KEY = env.STADIA_MAPS_API_KEY;
  }

  // Load explicit keys for better security separation
  const GOOGLE_MAPS_API_KEY =
    env.GOOGLE_MAPS_API_KEY
    ?? env.VITE_GOOGLE_MAPS_API_KEY
    ?? env.GOOGLE_MAS_API_KEY
    ?? env.google_mas_api_key
    ?? process.env.GOOGLE_MAPS_API_KEY
    ?? process.env.VITE_GOOGLE_MAPS_API_KEY
    // Android/CI에서 오타로 들어올 수 있는 대체 후보(레거시/환경차 대응)
    ?? process.env.GOOGLE_MAS_API_KEY
    ?? process.env.google_mas_api_key
    ?? '';

  return {
    // Android/Capacitor: file:// 환경에서 리소스 로드 위해 상대 경로 사용 (절대경로 / 시 흰 화면)
    base: './',
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
      {
        name: 'valhalla-elevation-handler',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api/valhalla-elevation')) return next();
            if (req.method !== 'POST') {
              res.writeHead(405, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }
            try {
              const body = await readRequestBodyJson(req);
              const fakeReq = { method: 'POST', body };
              const fakeRes = {
                _status: 200,
                _headers: {} as Record<string, string>,
                status(code: number) {
                  this._status = code;
                  return this;
                },
                setHeader(k: string, v: string) {
                  this._headers[k] = v;
                  return this;
                },
                end(bodyStr: string) {
                  res.writeHead(this._status, this._headers);
                  res.end(bodyStr);
                },
                json(obj: unknown) {
                  this.setHeader('Content-Type', 'application/json');
                  this.end(JSON.stringify(obj));
                },
              };
              const handler = await getValhallaElevationHandler();
              await handler(fakeReq, fakeRes);
            } catch (e) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String((e as Error)?.message ?? e) }));
            }
          });
        },
      },
      {
        name: 'elevation-handler',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api/elevation')) return next();
            if (req.method !== 'POST') {
              res.writeHead(405, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }
            try {
              const body = await readRequestBodyJson(req);
              const fakeReq = { method: 'POST', body };
              const fakeRes = {
                _status: 200,
                _headers: {} as Record<string, string>,
                status(code: number) {
                  this._status = code;
                  return this;
                },
                setHeader(k: string, v: string) {
                  this._headers[k] = v;
                  return this;
                },
                end(bodyStr: string) {
                  res.writeHead(this._status, this._headers);
                  res.end(bodyStr);
                },
                json(obj: unknown) {
                  this.setHeader('Content-Type', 'application/json');
                  this.end(JSON.stringify(obj));
                },
              };
              const handler = await getElevationHandler();
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
      // Ensure process.env access in client code keeps GOOGLE_MAPS_API_KEY value.
      'process.env': JSON.stringify({
        GOOGLE_MAPS_API_KEY,
      }),
      // Mapbox GL — loadEnv 로 .env.local 까지 읽어 클라이언트에 고정 주입 (일부 환경에서 import.meta.env 만으로 누락될 때 보강)
      'import.meta.env.VITE_MAPBOX_ACCESS_TOKEN': JSON.stringify(env.VITE_MAPBOX_ACCESS_TOKEN ?? ''),
      // Android 등 클라이언트에서 Stadia Route 직접 호출 시 — .env 의 STADIA_MAPS_API_KEY 를 VITE_ 없이도 쓰게 함(키는 번들에 포함됨).
      'import.meta.env.VITE_STADIA_MAPS_API_KEY': JSON.stringify(
        env.STADIA_MAPS_API_KEY ?? env.VITE_STADIA_MAPS_API_KEY ?? ''
      ),
    },
  };
});
