
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  // Load explicit keys for better security separation
  const GOOGLE_MAPS_API_KEY = env.GOOGLE_MAPS_API_KEY;

  return {
    plugins: [react()],
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
