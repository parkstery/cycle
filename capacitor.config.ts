import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.liveonsoft.cycle',
  appName: 'Ride the World - Indoor Cycling',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'none'
    }
  }
};

export default config;
