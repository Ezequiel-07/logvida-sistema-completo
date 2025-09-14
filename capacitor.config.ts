import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.logvida.app',
  appName: 'LogVida',
  webDir: 'www', // Pasta vazia, pois o app carrega a URL online
  server: {
    url: 'https://logvida.com',
    hostname: 'logvida.com',
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
