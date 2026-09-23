import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 8799);
const executablePath = process.env.CHROMIUM_PATH ?? (process.env.PLAYWRIGHT_BROWSERS_PATH ? '/opt/pw-browsers/chromium' : undefined);

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    launchOptions: executablePath ? { executablePath } : undefined,
    locale: 'ko-KR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // 운영 빌드를 서버가 그대로 내보내는 구성으로 검사한다
    command: `pnpm build && rm -rf /tmp/novapouch-e2e && DATA_DIR=/tmp/novapouch-e2e PORT=${port} pnpm --filter @novapouch/server start`,
    cwd: '../..',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
