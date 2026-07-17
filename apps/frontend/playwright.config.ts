import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PW_PORT ?? '4173');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['line'],
    ['json', { outputFile: 'test-results/visual-results.json' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
  },
  snapshotPathTemplate:
    '{testDir}/baselines/{platform}/{projectName}/{testFilePath}/{arg}{ext}',
  webServer: {
    command:
      `pnpm --filter @fops/frontend build && ` +
      `pnpm --filter @fops/frontend exec vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
