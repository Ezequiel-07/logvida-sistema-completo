import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.logvida.app',
  appName: 'LogVida',

  // Como o site está online, não precisamos de build local
  webDir: 'www', // pasta padrão, pode estar vazia

  server: {
    androidScheme: 'https',  // HTTPS obrigatório
    hostname: 'logvida.com', // site online
    cleartext: false,         // apenas HTTPS
    url: 'https://logvida.com', // para live reload se quiser em dev
  },
};

export default config;
