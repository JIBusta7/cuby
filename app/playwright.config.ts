import { defineConfig } from '@playwright/test';

// Pruebas de aceptación en modo simulación. Con Chrome instalado se puede usar
// directamente: PW_CHANNEL=chrome npm run test:e2e
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    channel: process.env.PW_CHANNEL || undefined,
    // Micrófono falso de Chrome (un tono): permite probar el modo Sonido sin hardware.
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
