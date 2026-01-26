import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  // PM Instruction: Apply API key directly in code due to domain restrictions.
  // Using the Google Cloud key found in index.html as the robust fallback.
  const API_KEY = env.API_KEY || "AIzaSyBYXu5yKdW71VuKmI-N2M2xbvMaYTK2HCg";

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(API_KEY),
      'process.env': {}
    }
  };
});